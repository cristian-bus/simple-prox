// tests/fase4b51_preflight_validation_runner.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.5.1
// VALIDACION EXHAUSTIVA PREVIA AL DESPLIEGUE EN SUPABASE COMERCIAL

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('=== FASE 4B.5.1: VALIDACION FINAL PREVIA AL DESPLIEGUE (DOCKER)       ===');
console.log('========================================================================\n');

const DOCKER_CONTAINER = 'pg_isolated_fase3b';
const DB_USER = 'test_user';
const TEMP_DB = 'tmp_fase4b51_preflight_val';
const COMMERCIAL_BACKUP = path.resolve('backups/supabase_backup_20261109_215247.dump');

const evidence = {
  timestamp: new Date().toISOString(),
  backupFile: COMMERCIAL_BACKUP,
  environment: 'PostgreSQL 17.11 on Docker pg_isolated_fase3b',
  totalChecks: 10,
  passedChecks: 0,
  checks: []
};

function record(stepNum, name, passed, details = {}) {
  const item = { step: stepNum, name, passed, details };
  evidence.checks.push(item);
  if (passed) {
    evidence.passedChecks++;
    console.log(`[PASS] Paso ${stepNum}: ${name}`);
  } else {
    console.error(`[FAIL] Paso ${stepNum}: ${name}`);
    console.error('  Detalles del fallo:', JSON.stringify(details, null, 2));
  }
  return passed;
}

function runSql(db, sql) {
  return execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'psql', '-U', DB_USER, '-d', db,
    '-t', '-A', '-F', '|', '-c', sql
  ], { encoding: 'utf8' }).trim();
}

function runSqlFile(db, filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'psql', '-U', DB_USER, '-d', db
  ], { input: content, encoding: 'utf8' });
}

try {
  // ---------------------------------------------------------------------------
  // 1. Restauración limpia del Backup Comercial Real
  // ---------------------------------------------------------------------------
  console.log('--- 1. Preparando base temporal y restaurando backup comercial ---');
  execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
  execSync(`docker exec ${DOCKER_CONTAINER} createdb -U ${DB_USER} ${TEMP_DB}`);

  const ensureDepsSql = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOSUPERUSER; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOSUPERUSER; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOSUPERUSER; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN CREATE ROLE postgres NOLOGIN NOSUPERUSER; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN CREATE ROLE supabase_admin NOLOGIN NOSUPERUSER; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users ( id uuid PRIMARY KEY );
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ 
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''), '16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2')::uuid 
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ 
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated') 
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, public, postgres, supabase_admin;
GRANT ALL ON TABLE auth.users TO anon, authenticated, service_role, public, postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role, public, postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role, public, postgres, supabase_admin;

CREATE OR REPLACE FUNCTION auth.auto_stub_user()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO auth.users (id) VALUES (NEW.user_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION auth.on_create_table()
RETURNS event_trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admin_users') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_auto_stub_admin_user') THEN
      EXECUTE 'CREATE TRIGGER trg_auto_stub_admin_user BEFORE INSERT ON public.admin_users FOR EACH ROW EXECUTE FUNCTION auth.auto_stub_user()';
    END IF;
  END IF;
END;
$$;

CREATE EVENT TRIGGER trg_on_create_table ON ddl_command_end
WHEN TAG IN ('CREATE TABLE')
EXECUTE FUNCTION auth.on_create_table();
`;

  execFileSync('docker', ['exec', '-i', DOCKER_CONTAINER, 'psql', '-U', DB_USER, '-d', TEMP_DB], {
    input: ensureDepsSql,
    encoding: 'utf8'
  });

  const containerDump = `/tmp/fase4b51_${path.basename(COMMERCIAL_BACKUP)}`;
  execSync(`docker cp "${COMMERCIAL_BACKUP}" ${DOCKER_CONTAINER}:${containerDump}`);

  execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'pg_restore', '-U', DB_USER, '-d', TEMP_DB,
    '--schema=public', '--exit-on-error', containerDump
  ], { encoding: 'utf8' });

  // Verificar conteo inicial y tipos de eventos
  const initialCountsRaw = runSql(TEMP_DB, `
    SELECT event_type, count(*) 
    FROM public.campaign_events 
    GROUP BY event_type 
    ORDER BY event_type;
  `);
  
  const typeMap = {};
  let totalEvents = 0;
  initialCountsRaw.split('\n').forEach(line => {
    if (!line) return;
    const [t, c] = line.split('|');
    const cnt = parseInt(c, 10);
    typeMap[t] = cnt;
    totalEvents += cnt;
  });

  const isInitialValid = (
    totalEvents === 9787 &&
    typeMap['impression'] === 9544 &&
    typeMap['offer_open'] === 149 &&
    typeMap['whatsapp_click'] === 94
  );

  record(1, 'Restauración comercial inicial con 9.787 eventos reales', isInitialValid, {
    totalEvents,
    breakdown: typeMap
  });

  // ---------------------------------------------------------------------------
  // 2. Aplicación transaccional de Migración DDL (Aggregates)
  // ---------------------------------------------------------------------------
  console.log('--- 2. Aplicando migración 20261106_campaign_statistics_aggregates.sql ---');
  const ddlPath = path.resolve('supabase/migrations/20261106_campaign_statistics_aggregates.sql');
  runSqlFile(TEMP_DB, ddlPath);

  const ddlVerify = runSql(TEMP_DB, `
    SELECT 
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaign_events' AND column_name='aggregated_at') as has_col,
      EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaign_daily_aggregates') as has_cda,
      EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purge_ledger') as has_pl,
      EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='consolidation_audit_log') as has_cal,
      EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='v_campaign_combined_metrics') as has_v1,
      EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='v_campaign_totals') as has_v2;
  `);

  const ddlPassed = ddlVerify === 't|t|t|t|t|t';
  record(2, 'Migración DDL aplicada exitosamente y objetos verificados', ddlPassed, { ddlVerify });

  // ---------------------------------------------------------------------------
  // 3. Aplicación transaccional de Migración Funciones (Functions)
  // ---------------------------------------------------------------------------
  console.log('--- 3. Aplicando migración 20261106_campaign_statistics_functions.sql ---');
  const fnPath = path.resolve('supabase/migrations/20261106_campaign_statistics_functions.sql');
  runSqlFile(TEMP_DB, fnPath);

  const fnVerify = runSql(TEMP_DB, `
    SELECT 
      EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_schema='public' AND routine_name='consolidate_campaign_events_batch') as has_consolidate,
      EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_schema='public' AND routine_name='reconcile_campaign_metrics_4d') as has_reconcile,
      EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_schema='public' AND routine_name='purge_campaign_events_safe') as has_purge;
  `);

  // Requiere: has_consolidate=t, has_reconcile=t, has_purge=f (desacoplada)
  const fnPassed = fnVerify === 't|t|f';
  record(3, 'Migración de funciones aplicada; rutina de purga destructiva desacoplada', fnPassed, { 
    fnVerify, 
    purgeDecoupled: fnVerify.split('|')[2] === 'f' 
  });

  // ---------------------------------------------------------------------------
  // 4. Verificación de RLS y Control de Invocación
  // ---------------------------------------------------------------------------
  console.log('--- 4. Verificando control de autorización y RLS en funciones ---');
  
  // Invocación como usuario anónimo o no autorizado debe ser rechazada
  let anonRejected = false;
  try {
    runSql(TEMP_DB, `
      SET LOCAL "request.jwt.claim.role" = 'anon';
      SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000000';
      SELECT public.consolidate_campaign_events_batch();
    `);
  } catch (err) {
    anonRejected = true;
  }

  // Invocación como service_role / postgres debe ser permitida
  let serviceAllowed = false;
  try {
    const res = runSql(TEMP_DB, `
      SELECT (public.consolidate_campaign_events_batch('test-auth', 1))->>'success';
    `);
    serviceAllowed = res === 'true';
  } catch (err) {
    serviceAllowed = false;
  }

  record(4, 'Autorización estricta: llamadas no autorizadas bloqueadas, autorizadas permitidas', anonRejected && serviceAllowed, {
    anonRejected,
    serviceAllowed
  });

  // ---------------------------------------------------------------------------
  // 5. Verificación de Permisos en Vistas security_invoker
  // ---------------------------------------------------------------------------
  console.log('--- 5. Verificando lectura en vistas security_invoker con admin activo ---');
  const viewCount = runSql(TEMP_DB, `
    SELECT count(*) FROM public.v_campaign_combined_metrics;
  `);
  const viewPassed = parseInt(viewCount, 10) > 0;
  record(5, 'Vistas con security_invoker accesibles y calculando métricas', viewPassed, {
    viewRowCount: parseInt(viewCount, 10)
  });

  // ---------------------------------------------------------------------------
  // 6. Consolidación del Lote Completo (Backfill 9.787 eventos)
  // ---------------------------------------------------------------------------
  console.log('--- 6. Ejecutando consolidación del buffer comercial completo ---');
  const backfillRaw = runSql(TEMP_DB, `
    SELECT public.consolidate_campaign_events_batch('initial-backfill-val', 50000)::text;
  `);
  const backfillJson = JSON.parse(backfillRaw);

  const pendingCount = parseInt(runSql(TEMP_DB, `
    SELECT count(*) FROM public.campaign_events WHERE aggregated_at IS NULL;
  `), 10);

  const totalRawAfter = parseInt(runSql(TEMP_DB, `
    SELECT count(*) FROM public.campaign_events;
  `), 10);

  const backfillPassed = (
    backfillJson.success === true &&
    backfillJson.processed === 9786 && // 1 ya procesado en paso 4
    pendingCount === 0 &&
    totalRawAfter === 9787
  );

  record(6, 'Consolidación completa: 9.787 eventos procesados con cero pérdidas', backfillPassed, {
    backfillResult: backfillJson,
    pendingCount,
    totalRawAfter
  });

  // ---------------------------------------------------------------------------
  // 7. Verificación de Distribución en campaign_daily_aggregates
  // ---------------------------------------------------------------------------
  console.log('--- 7. Verificando conteos agregados por tipo de evento ---');
  const aggCountsRaw = runSql(TEMP_DB, `
    SELECT event_type, sum(event_count) 
    FROM public.campaign_daily_aggregates 
    GROUP BY event_type 
    ORDER BY event_type;
  `);

  const aggTypeMap = {};
  let totalAgg = 0;
  aggCountsRaw.split('\n').forEach(line => {
    if (!line) return;
    const [t, c] = line.split('|');
    const cnt = parseInt(c, 10);
    aggTypeMap[t] = cnt;
    totalAgg += cnt;
  });

  const aggPassed = (
    totalAgg === 9787 &&
    aggTypeMap['impression'] === 9544 &&
    aggTypeMap['offer_open'] === 149 &&
    aggTypeMap['whatsapp_click'] === 94
  );

  record(7, 'Distribución exacta de tipos de eventos preservada en agregados', aggPassed, {
    totalAgg,
    expectedAgg: 9787,
    breakdown: aggTypeMap
  });

  // ---------------------------------------------------------------------------
  // 8. Prueba de Idempotencia (Segunda ejecución sin eventos pendientes)
  // ---------------------------------------------------------------------------
  console.log('--- 8. Verificando idempotencia de consolidación ---');
  const secondRunRaw = runSql(TEMP_DB, `
    SELECT public.consolidate_campaign_events_batch('second-run', 50000)::text;
  `);
  const secondRunJson = JSON.parse(secondRunRaw);

  const totalAggAfterSecond = parseInt(runSql(TEMP_DB, `
    SELECT sum(event_count) FROM public.campaign_daily_aggregates;
  `), 10);

  const idempotencePassed = (
    secondRunJson.success === true &&
    secondRunJson.processed === 0 &&
    totalAggAfterSecond === 9787
  );

  record(8, 'Idempotencia estricta: segunda ejecución no duplica registros', idempotencePassed, {
    secondRunResult: secondRunJson,
    totalAggAfterSecond
  });

  // ---------------------------------------------------------------------------
  // 9. Reconciliación Matemática 4D Bidireccional (FULL OUTER JOIN)
  // ---------------------------------------------------------------------------
  console.log('--- 9. Ejecutando función reconcile_campaign_metrics_4d ---');
  const reconRaw = runSql(TEMP_DB, `
    SELECT public.reconcile_campaign_metrics_4d()::text;
  `);
  const reconJson = JSON.parse(reconRaw);

  const reconPassed = (
    reconJson.all_matching === true &&
    reconJson.mismatches_count === 0 &&
    reconJson.discrepancies.length === 0 &&
    reconJson.perfect_matches > 0
  );

  record(9, 'Reconciliación matemática 4D: 100% igualdad perfecta sin discrepancias', reconPassed, {
    perfectMatches: reconJson.perfect_matches,
    mismatchesCount: reconJson.mismatches_count,
    allMatching: reconJson.all_matching
  });

  // ---------------------------------------------------------------------------
  // 10. Prueba de Rollback Limpio de Nivel 2
  // ---------------------------------------------------------------------------
  console.log('--- 10. Verificando script de reversión limpia (Rollback DDL) ---');
  const rollbackSql = `
BEGIN;
DROP FUNCTION IF EXISTS public.reconcile_campaign_metrics_4d(date, uuid);
DROP FUNCTION IF EXISTS public.consolidate_campaign_events_batch(text, integer);
DROP VIEW IF EXISTS public.v_campaign_totals;
DROP VIEW IF EXISTS public.v_campaign_combined_metrics;
DROP TABLE IF EXISTS public.consolidation_audit_log;
DROP TABLE IF EXISTS public.purge_ledger;
DROP TABLE IF EXISTS public.campaign_daily_aggregates;
DROP INDEX IF EXISTS public.idx_campaign_events_unaggregated;
ALTER TABLE public.campaign_events DROP COLUMN IF EXISTS aggregated_at;
COMMIT;
`;
  execFileSync('docker', ['exec', '-i', DOCKER_CONTAINER, 'psql', '-U', DB_USER, '-d', TEMP_DB], {
    input: rollbackSql,
    encoding: 'utf8'
  });

  const postRollbackEvents = parseInt(runSql(TEMP_DB, `
    SELECT count(*) FROM public.campaign_events;
  `), 10);

  const objectsRemaining = runSql(TEMP_DB, `
    SELECT count(*) FROM information_schema.tables 
    WHERE table_schema='public' 
      AND table_name IN ('campaign_daily_aggregates', 'purge_ledger', 'consolidation_audit_log');
  `);

  const rollbackPassed = (
    postRollbackEvents === 9787 &&
    parseInt(objectsRemaining, 10) === 0
  );

  record(10, 'Rollback limpio verificado: elimina objetos agregados sin tocar los 9.787 eventos', rollbackPassed, {
    postRollbackEvents,
    objectsRemaining: parseInt(objectsRemaining, 10)
  });

} catch (err) {
  console.error('\n[EXCEPCION EN RUNNER]:', err.message);
  if (err.stdout) console.error('STDOUT:', err.stdout.toString());
  if (err.stderr) console.error('STDERR:', err.stderr.toString());
} finally {
  console.log('\n--- Limpiando base temporal en Docker ---');
  try {
    execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
    execSync(`docker exec ${DOCKER_CONTAINER} rm -f /tmp/fase4b51_${path.basename(COMMERCIAL_BACKUP)}`);
  } catch (cleanErr) {
    console.warn('Aviso de limpieza:', cleanErr.message);
  }
}

console.log('\n========================================================================');
console.log(`=== RESUMEN FASE 4B.5.1: ${evidence.passedChecks}/${evidence.totalChecks} PRUEBAS SUPERADAS (${Math.round(evidence.passedChecks/evidence.totalChecks*100)}%) ===`);
console.log('========================================================================\n');

if (evidence.passedChecks === evidence.totalChecks) {
  console.log('>>> VERIFICACION EXITOSA: DICTAMEN GO CONFIRMADO PARA DESPLIEGUE MANUAL EN SUPABASE <<<');
  process.exit(0);
} else {
  console.error('>>> VERIFICACION FALLIDA: NO EJECUTAR EN PRODUCCION <<<');
  process.exit(1);
}

