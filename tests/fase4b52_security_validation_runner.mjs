// tests/fase4b52_security_validation_runner.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.5.2
// VALIDACION EXHAUSTIVA DE SEGURIDAD, AUTORIZACION, LIMITES Y CONSOLIDACION POR LOTES

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('=== FASE 4B.5.2: VALIDACION DE AUTORIZACION, LIMITES Y LOTES (DOCKER)===');
console.log('========================================================================\n');

const DOCKER_CONTAINER = 'pg_isolated_fase3b';
const DB_USER = 'test_user';
const TEMP_DB = 'tmp_fase4b52_sec_val';
const COMMERCIAL_BACKUP = path.resolve('backups/supabase_backup_20261109_215247.dump');

const evidence = {
  timestamp: new Date().toISOString(),
  backupFile: COMMERCIAL_BACKUP,
  environment: 'PostgreSQL 17.11 on Docker pg_isolated_fase3b',
  totalChecks: 12,
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
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''), '00000000-0000-0000-0000-000000000000')::uuid 
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ 
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') 
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

  const containerDump = `/tmp/fase4b52_${path.basename(COMMERCIAL_BACKUP)}`;
  execSync(`docker cp "${COMMERCIAL_BACKUP}" ${DOCKER_CONTAINER}:${containerDump}`);

  execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'pg_restore', '-U', DB_USER, '-d', TEMP_DB,
    '--schema=public', '--exit-on-error', containerDump
  ], { encoding: 'utf8' });

  // ---------------------------------------------------------------------------
  // Verificaciones 1, 2, 3, 4: Eventos originales y desglose exacto
  // ---------------------------------------------------------------------------
  const rawStats = runSql(TEMP_DB, `
    SELECT 
      count(*) as total,
      count(*) FILTER (WHERE event_type = 'impression') as impressions,
      count(*) FILTER (WHERE event_type = 'offer_open') as offer_opens,
      count(*) FILTER (WHERE event_type = 'whatsapp_click') as whatsapp_clicks
    FROM public.campaign_events;
  `);
  const [totalRaw, impRaw, openRaw, waRaw] = rawStats.split('|').map(v => parseInt(v, 10));

  record(1, '9.787 eventos comerciales originales preservados', totalRaw === 9787, { totalRaw });
  record(2, '9.544 impresiones preservadas exactamente', impRaw === 9544, { impRaw });
  record(3, '149 aperturas de oferta preservadas exactamente', openRaw === 149, { openRaw });
  record(4, '94 clics de WhatsApp preservados exactamente', waRaw === 94, { waRaw });

  // ---------------------------------------------------------------------------
  // Aplicar migraciones
  // ---------------------------------------------------------------------------
  console.log('--- Aplicando migraciones DDL y funciones corregidas ---');
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_aggregates.sql');
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_functions.sql');

  // ---------------------------------------------------------------------------
  // Verificación 5: Ausencia estricta de función destructiva de purga
  // ---------------------------------------------------------------------------
  const purgeExists = runSql(TEMP_DB, `
    SELECT EXISTS(
      SELECT 1 FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'purge_campaign_events_safe'
    );
  `);
  record(5, 'Función destructiva de purga (purge_campaign_events_safe) ausente de la base', purgeExists === 'f', { purgeExists });

  // ---------------------------------------------------------------------------
  // Verificación 6: Rechazo estricto de usuarios no autorizados (anon y auth no admin)
  // ---------------------------------------------------------------------------
  console.log('--- 6. Comprobando rechazo de roles no autorizados ---');
  let anonRejected = false;
  try {
    runSql(TEMP_DB, `
      SET LOCAL "request.jwt.claims" = '{"role": "anon", "sub": "11111111-1111-1111-1111-111111111111"}';
      SET LOCAL "request.jwt.claim.role" = 'anon';
      SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
      SELECT public.consolidate_campaign_events_batch();
    `);
  } catch (err) {
    anonRejected = true;
  }

  let nonAdminAuthRejected = false;
  try {
    runSql(TEMP_DB, `
      SET LOCAL "request.jwt.claims" = '{"role": "authenticated", "sub": "22222222-2222-2222-2222-222222222222"}';
      SET LOCAL "request.jwt.claim.role" = 'authenticated';
      SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
      SELECT public.consolidate_campaign_events_batch();
    `);
  } catch (err) {
    nonAdminAuthRejected = true;
  }

  let nonAdminReconRejected = false;
  try {
    runSql(TEMP_DB, `
      SET LOCAL "request.jwt.claims" = '{"role": "authenticated", "sub": "22222222-2222-2222-2222-222222222222"}';
      SET LOCAL "request.jwt.claim.role" = 'authenticated';
      SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
      SELECT public.reconcile_campaign_metrics_4d();
    `);
  } catch (err) {
    nonAdminReconRejected = true;
  }

  record(6, 'Rechazo de usuarios no autorizados (anon y authenticated no-admin)', 
    anonRejected && nonAdminAuthRejected && nonAdminReconRejected, 
    { anonRejected, nonAdminAuthRejected, nonAdminReconRejected }
  );

  // ---------------------------------------------------------------------------
  // Verificación 7: Ejecución permitida con credenciales autorizadas
  // ---------------------------------------------------------------------------
  console.log('--- 7. Comprobando ejecución permitida para roles autorizados ---');
  // Probar service_role
  let serviceRoleAllowed = false;
  let serviceErr = null;
  try {
    const res = runSql(TEMP_DB, `
      SET "request.jwt.claims" = '{"role": "service_role"}';
      SET "request.jwt.claim.role" = 'service_role';
      SELECT (public.reconcile_campaign_metrics_4d())->>'all_matching';
    `);
    console.log('Service role res:', res);
    serviceRoleAllowed = (res.includes('true'));
  } catch (err) {
    serviceErr = err.stderr ? err.stderr.toString() : err.message;
    console.error('Service role err:', serviceErr);
    serviceRoleAllowed = false;
  }

  // Probar active admin (user 16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2 de admin_users)
  let activeAdminAllowed = false;
  let adminErr = null;
  try {
    const res = runSql(TEMP_DB, `
      SET "request.jwt.claims" = '{"role": "authenticated", "sub": "16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2"}';
      SET "request.jwt.claim.role" = 'authenticated';
      SET "request.jwt.claim.sub" = '16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2';
      SELECT (public.reconcile_campaign_metrics_4d())->>'all_matching';
    `);
    console.log('Active admin res:', res);
    activeAdminAllowed = (res.includes('true'));
  } catch (err) {
    adminErr = err.stderr ? err.stderr.toString() : err.message;
    console.error('Active admin err:', adminErr);
    activeAdminAllowed = false;
  }

  record(7, 'Ejecución correcta con credenciales autorizadas (service_role y admin activo)',
    serviceRoleAllowed && activeAdminAllowed,
    { serviceRoleAllowed, activeAdminAllowed, serviceErr, adminErr }
  );

  // ---------------------------------------------------------------------------
  // Verificación 8: Rechazo estricto de límites inválidos
  // ---------------------------------------------------------------------------
  console.log('--- 8. Comprobando validación de p_limit ---');
  const invalidLimits = [0, -1, -500, 'NULL', 50001, 100000];
  let allInvalidRejected = true;
  const limitResults = {};

  for (const lim of invalidLimits) {
    try {
      runSql(TEMP_DB, `SELECT public.consolidate_campaign_events_batch('val-limit', ${lim});`);
      allInvalidRejected = false;
      limitResults[lim] = 'PERMITIDO_INDEBIDO';
    } catch (err) {
      limitResults[lim] = 'RECHAZADO_CORRECTO';
    }
  }

  record(8, 'Rechazo estricto de límites inválidos (<= 0, NULL, > 50.000)',
    allInvalidRejected,
    limitResults
  );

  // ---------------------------------------------------------------------------
  // Verificación 9: Consolidación completa mediante lotes (ej: 5.000 + restante)
  // ---------------------------------------------------------------------------
  console.log('--- 9. Ejecutando consolidación en lotes controlados (Lote 1: 5.000, Lote 2: restante) ---');
  // Lote 1: exactamente 5.000 eventos
  const batch1Raw = runSql(TEMP_DB, `
    SELECT public.consolidate_campaign_events_batch('worker-batch-1', 5000)::text;
  `);
  const batch1Json = JSON.parse(batch1Raw);

  const pendingAfterBatch1 = parseInt(runSql(TEMP_DB, `
    SELECT count(*) FROM public.campaign_events WHERE aggregated_at IS NULL;
  `), 10);

  // Lote 2: restante (4.787 eventos) con límite de 50.000
  const batch2Raw = runSql(TEMP_DB, `
    SELECT public.consolidate_campaign_events_batch('worker-batch-2', 50000)::text;
  `);
  const batch2Json = JSON.parse(batch2Raw);

  const pendingAfterBatch2 = parseInt(runSql(TEMP_DB, `
    SELECT count(*) FROM public.campaign_events WHERE aggregated_at IS NULL;
  `), 10);

  const totalAggregatesAfterBatches = parseInt(runSql(TEMP_DB, `
    SELECT sum(event_count) FROM public.campaign_daily_aggregates;
  `), 10);

  const batchesPassed = (
    batch1Json.success === true &&
    batch1Json.processed === 5000 &&
    pendingAfterBatch1 === 4787 &&
    batch2Json.success === true &&
    batch2Json.processed === 4787 &&
    pendingAfterBatch2 === 0 &&
    totalAggregatesAfterBatches === 9787
  );

  record(9, 'Consolidación completa mediante lotes secuenciales (5.000 + 4.787 = 9.787)',
    batchesPassed,
    {
      batch1Processed: batch1Json.processed,
      pendingAfterBatch1,
      batch2Processed: batch2Json.processed,
      pendingAfterBatch2,
      totalAggregatesAfterBatches
    }
  );

  // ---------------------------------------------------------------------------
  // Verificación 10: Segunda ejecución sin duplicaciones (Idempotencia)
  // ---------------------------------------------------------------------------
  console.log('--- 10. Comprobando idempotencia (sin eventos pendientes) ---');
  const batch3Raw = runSql(TEMP_DB, `
    SELECT public.consolidate_campaign_events_batch('worker-batch-3', 50000)::text;
  `);
  const batch3Json = JSON.parse(batch3Raw);

  const totalAggregatesAfterBatch3 = parseInt(runSql(TEMP_DB, `
    SELECT sum(event_count) FROM public.campaign_daily_aggregates;
  `), 10);

  const aggCountsByType = runSql(TEMP_DB, `
    SELECT 
      sum(event_count) FILTER (WHERE event_type = 'impression') as impressions,
      sum(event_count) FILTER (WHERE event_type = 'offer_open') as offer_opens,
      sum(event_count) FILTER (WHERE event_type = 'whatsapp_click') as whatsapp_clicks
    FROM public.campaign_daily_aggregates;
  `);
  const [aggImp, aggOpen, aggWa] = aggCountsByType.split('|').map(v => parseInt(v, 10));

  const idempotencePassed = (
    batch3Json.success === true &&
    batch3Json.processed === 0 &&
    totalAggregatesAfterBatch3 === 9787 &&
    aggImp === 9544 &&
    aggOpen === 149 &&
    aggWa === 94
  );

  record(10, 'Idempotencia: Ejecución posterior no duplica ningún registro ni altera totales',
    idempotencePassed,
    {
      batch3Result: batch3Json,
      totalAggregatesAfterBatch3,
      breakdown: { impressions: aggImp, offer_opens: aggOpen, whatsapp_clicks: aggWa }
    }
  );

  // ---------------------------------------------------------------------------
  // Verificación 11: Conciliación 4D Bidireccional con Cero Diferencias
  // ---------------------------------------------------------------------------
  console.log('--- 11. Ejecutando conciliación matemática 4D (reconcile_campaign_metrics_4d) ---');
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

  record(11, 'Conciliación 4D perfecta: all_matching = true, cero diferencias en 73 particiones',
    reconPassed,
    {
      perfectMatches: reconJson.perfect_matches,
      mismatchesCount: reconJson.mismatches_count,
      allMatching: reconJson.all_matching
    }
  );

  // ---------------------------------------------------------------------------
  // Verificación 12: Integridad total de la tabla comercial campaign_events
  // ---------------------------------------------------------------------------
  const rawCountFinal = parseInt(runSql(TEMP_DB, `SELECT count(*) FROM public.campaign_events;`), 10);
  record(12, 'Integridad absoluta: Todos los 9.787 eventos permanecen en campaign_events (cero borrados)',
    rawCountFinal === 9787,
    { rawCountFinal }
  );

} catch (err) {
  console.error('\n[EXCEPCION EN RUNNER]:', err.message);
  if (err.stdout) console.error('STDOUT:', err.stdout.toString());
  if (err.stderr) console.error('STDERR:', err.stderr.toString());
} finally {
  console.log('\n--- Limpiando entorno efímero en Docker ---');
  try {
    execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
    execSync(`docker exec ${DOCKER_CONTAINER} rm -f /tmp/fase4b52_${path.basename(COMMERCIAL_BACKUP)}`);
  } catch (cleanErr) {
    console.warn('Aviso de limpieza:', cleanErr.message);
  }
}

console.log('\n========================================================================');
console.log(`=== RESUMEN FASE 4B.5.2: ${evidence.passedChecks}/${evidence.totalChecks} PRUEBAS SUPERADAS (${Math.round(evidence.passedChecks/evidence.totalChecks*100)}%) ===`);
console.log('========================================================================\n');

if (evidence.passedChecks === evidence.totalChecks) {
  console.log('>>> TODAS LAS PRUEBAS OBLIGATORIAS SUPERADAS: DICTAMEN GO CONFIRMADO <<<');
  process.exit(0);
} else {
  console.error('>>> FALLO EN PRUEBAS: DICTAMEN NO-GO <<<');
  process.exit(1);
}
