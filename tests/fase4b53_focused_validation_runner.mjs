// tests/fase4b53_focused_validation_runner.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.5.3
// PRUEBAS FOCALIZADAS DE AUTORIZACION, CONSOLIDACION Y CONCILIACION EN DOCKER AISLADO

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('=== FASE 4B.5.3: PRUEBAS FOCALIZADAS DE AUTORIZACION Y CONCILIACION  ===');
console.log('========================================================================\n');

const DOCKER_CONTAINER = 'pg_isolated_fase3b';
const DB_USER = 'test_user';
const TEMP_DB = 'tmp_fase4b53_focused_val';
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

function runSql(db, sql, user = DB_USER) {
  return execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'psql', '-U', user, '-d', db,
    '-t', '-A', '-F', '|', '-c', sql
  ], { encoding: 'utf8' }).trim();
}

function runSqlFile(db, filePath, user = DB_USER) {
  const content = fs.readFileSync(filePath, 'utf8');
  return execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'psql', '-U', user, '-d', db
  ], { input: content, encoding: 'utf8' });
}

try {
  // ---------------------------------------------------------------------------
  // 1. Verificación estática de código SQL: Cero roles de test y cero purga
  // ---------------------------------------------------------------------------
  console.log('--- 1. Auditando código SQL productivo ---');
  const functionsSql = fs.readFileSync('supabase/migrations/20261106_campaign_statistics_functions.sql', 'utf8');
  const ddlSql = fs.readFileSync('supabase/migrations/20261106_campaign_statistics_aggregates.sql', 'utf8');

  const hasTestUser = functionsSql.includes('test_user') || ddlSql.includes('test_user');
  const hasPurgeFn = functionsSql.includes('CREATE OR REPLACE FUNCTION public.purge_campaign_events_safe') ||
                     ddlSql.includes('CREATE OR REPLACE FUNCTION public.purge_campaign_events_safe');

  record(1, 'Código SQL productivo libre de test_user y exento de funciones de purga',
    !hasTestUser && !hasPurgeFn,
    { hasTestUser, hasPurgeFn }
  );

  // ---------------------------------------------------------------------------
  // 2. Restauración limpia del Backup Comercial Real
  // ---------------------------------------------------------------------------
  console.log('--- 2. Preparando base temporal y restaurando backup comercial ---');
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

GRANT service_role TO test_user;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users ( id uuid PRIMARY KEY );
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'anon'::text $$;
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

  const containerDump = `/tmp/fase4b53_${path.basename(COMMERCIAL_BACKUP)}`;
  execSync(`docker cp "${COMMERCIAL_BACKUP}" ${DOCKER_CONTAINER}:${containerDump}`);

  execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'pg_restore', '-U', DB_USER, '-d', TEMP_DB,
    '--schema=public', '--exit-on-error', containerDump
  ], { encoding: 'utf8' });

  // ---------------------------------------------------------------------------
  // 3. Aplicar migraciones en la base restaurada
  // ---------------------------------------------------------------------------
  console.log('--- 3. Aplicando migraciones DDL y funciones corregidas ---');
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_aggregates.sql');
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_functions.sql');

  const rawCountBefore = parseInt(runSql(TEMP_DB, 'SELECT count(*) FROM public.campaign_events;'), 10);
  record(2, 'Restauración comercial y aplicación de migraciones sin alteración de datos (9.787 eventos)',
    rawCountBefore === 9787,
    { rawCountBefore }
  );

  // ---------------------------------------------------------------------------
  // 4. Auditoría de permisos de catálogo (GRANT/REVOKE EXECUTE)
  // ---------------------------------------------------------------------------
  console.log('--- 4. Auditando privilegios de catálogo PostgreSQL ---');
  const permsSql = `
    SELECT 
      has_function_privilege('anon', 'public.consolidate_campaign_events_batch(text, integer)', 'EXECUTE') as anon_consolidate,
      has_function_privilege('authenticated', 'public.consolidate_campaign_events_batch(text, integer)', 'EXECUTE') as auth_consolidate,
      has_function_privilege('service_role', 'public.consolidate_campaign_events_batch(text, integer)', 'EXECUTE') as service_consolidate,
      has_function_privilege('anon', 'public.reconcile_campaign_metrics_4d(date, uuid)', 'EXECUTE') as anon_recon,
      has_function_privilege('authenticated', 'public.reconcile_campaign_metrics_4d(date, uuid)', 'EXECUTE') as auth_recon,
      has_function_privilege('service_role', 'public.reconcile_campaign_metrics_4d(date, uuid)', 'EXECUTE') as service_recon;
  `;
  const perms = runSql(TEMP_DB, permsSql);
  // Esperado: f|f|t|f|f|t
  const permsPassed = perms === 'f|f|t|f|f|t';
  record(3, 'Permisos efectivos de catálogo: anon y authenticated bloqueados, service_role concedido',
    permsPassed,
    { permsResult: perms, expected: 'f|f|t|f|f|t' }
  );

  // ---------------------------------------------------------------------------
  // 5. Invocación desde rol no privilegiado (anon) debe fallar con permission denied
  // ---------------------------------------------------------------------------
  console.log('--- 5. Comprobando rechazo nativo de PostgreSQL para anon ---');
  let anonBlocked = false;
  let anonError = '';
  try {
    runSql(TEMP_DB, `
      SET ROLE anon;
      SELECT public.consolidate_campaign_events_batch();
    `);
  } catch (err) {
    anonBlocked = true;
    anonError = err.stderr ? err.stderr.toString() : err.message;
  }
  record(4, 'Rol anon rechazado por el motor de PostgreSQL (permission denied)',
    anonBlocked && anonError.includes('permission denied'),
    { anonBlocked, anonError: anonError.trim() }
  );

  // ---------------------------------------------------------------------------
  // 6. Invocación desde rol autenticado común (authenticated) debe fallar
  // ---------------------------------------------------------------------------
  console.log('--- 6. Comprobando rechazo nativo de PostgreSQL para authenticated ---');
  let authBlocked = false;
  let authError = '';
  try {
    runSql(TEMP_DB, `
      SET ROLE authenticated;
      SELECT public.reconcile_campaign_metrics_4d();
    `);
  } catch (err) {
    authBlocked = true;
    authError = err.stderr ? err.stderr.toString() : err.message;
  }
  record(5, 'Rol authenticated rechazado por el motor de PostgreSQL (permission denied)',
    authBlocked && authError.includes('permission denied'),
    { authBlocked, authError: authError.trim() }
  );

  // ---------------------------------------------------------------------------
  // 7. Invocación autorizada desde service_role y postgres
  // ---------------------------------------------------------------------------
  console.log('--- 7. Comprobando ejecución legítima para service_role y postgres ---');
  let serviceRoleOk = false;
  try {
    const res = runSql(TEMP_DB, `
      SET ROLE service_role;
      SELECT (public.reconcile_campaign_metrics_4d())->>'all_matching';
    `);
    serviceRoleOk = res.includes('true');
  } catch (err) {
    serviceRoleOk = false;
  }

  let postgresDirectOk = false;
  try {
    const res = runSql(TEMP_DB, `
      SELECT (public.reconcile_campaign_metrics_4d())->>'all_matching';
    `);
    postgresDirectOk = res.includes('true');
  } catch (err) {
    postgresDirectOk = false;
  }

  record(6, 'Ejecución exitosa para roles autorizados (service_role y postgres)',
    serviceRoleOk && postgresDirectOk,
    { serviceRoleOk, postgresDirectOk }
  );

  // ---------------------------------------------------------------------------
  // 8. Validación rigurosa de límites de p_limit (1 a 50.000)
  // ---------------------------------------------------------------------------
  console.log('--- 8. Comprobando validación de límites (1 a 50.000) ---');
  const testLimits = [
    { val: 0, shouldFail: true },
    { val: -10, shouldFail: true },
    { val: 'NULL', shouldFail: true },
    { val: 50001, shouldFail: true },
    { val: 50000, shouldFail: false }
  ];

  let limitValidationPassed = true;
  for (const item of testLimits) {
    try {
      runSql(TEMP_DB, `SELECT public.consolidate_campaign_events_batch('worker-limit-test', ${item.val});`);
      if (item.shouldFail) limitValidationPassed = false;
    } catch (err) {
      if (!item.shouldFail) limitValidationPassed = false;
    }
  }

  record(7, 'Validación de p_limit: <=0, NULL y >50.000 rechazados; 50.000 admitido',
    limitValidationPassed,
    { testLimits }
  );

  // ---------------------------------------------------------------------------
  // 9. Consolidación del buffer comercial completo (Backfill)
  // ---------------------------------------------------------------------------
  console.log('--- 9. Ejecutando consolidación del buffer comercial (9.787 eventos) ---');
  const backfillRaw = runSql(TEMP_DB, `
    SELECT public.consolidate_campaign_events_batch('fase4b53-backfill', 50000)::text;
  `);
  const backfillJson = JSON.parse(backfillRaw);

  const pendingCount = parseInt(runSql(TEMP_DB, 'SELECT count(*) FROM public.campaign_events WHERE aggregated_at IS NULL;'), 10);
  const totalAggregates = parseInt(runSql(TEMP_DB, 'SELECT sum(event_count) FROM public.campaign_daily_aggregates;'), 10);

  const countsByType = runSql(TEMP_DB, `
    SELECT 
      sum(event_count) FILTER (WHERE event_type = 'impression') as imp,
      sum(event_count) FILTER (WHERE event_type = 'offer_open') as open,
      sum(event_count) FILTER (WHERE event_type = 'whatsapp_click') as wa
    FROM public.campaign_daily_aggregates;
  `);
  const [impCount, openCount, waCount] = countsByType.split('|').map(v => parseInt(v, 10));

  const backfillPassed = (
    backfillJson.success === true &&
    pendingCount === 0 &&
    totalAggregates === 9787 &&
    impCount === 9544 &&
    openCount === 149 &&
    waCount === 94
  );

  record(8, 'Consolidación completa: 9.787 eventos en aggregates (9544 imp, 149 open, 94 click)',
    backfillPassed,
    { backfillResult: backfillJson, totalAggregates, impCount, openCount, waCount }
  );

  // ---------------------------------------------------------------------------
  // 10. Idempotencia: Segunda ejecución no altera cómputos
  // ---------------------------------------------------------------------------
  console.log('--- 10. Comprobando idempotencia tras el backfill ---');
  const secondRunRaw = runSql(TEMP_DB, `
    SELECT public.consolidate_campaign_events_batch('fase4b53-second-run', 50000)::text;
  `);
  const secondRunJson = JSON.parse(secondRunRaw);
  const totalAggAfterSecond = parseInt(runSql(TEMP_DB, 'SELECT sum(event_count) FROM public.campaign_daily_aggregates;'), 10);

  const idempotencePassed = (
    secondRunJson.success === true &&
    secondRunJson.processed === 0 &&
    totalAggAfterSecond === 9787
  );

  record(9, 'Idempotencia: segunda pasada procesa 0 eventos y preserva exactamente 9.787 registros',
    idempotencePassed,
    { secondRunResult: secondRunJson, totalAggAfterSecond }
  );

  // ---------------------------------------------------------------------------
  // 11. Conciliación matemática 4D (FULL OUTER JOIN)
  // ---------------------------------------------------------------------------
  console.log('--- 11. Ejecutando conciliación matemática 4D ---');
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

  record(10, `Conciliación matemática 4D: 100% igualdad perfecta en las ${reconJson.perfect_matches} particiones`,
    reconPassed,
    {
      perfectMatches: reconJson.perfect_matches,
      mismatchesCount: reconJson.mismatches_count,
      allMatching: reconJson.all_matching
    }
  );

} catch (err) {
  console.error('\n[EXCEPCION EN RUNNER]:', err.message);
  if (err.stdout) console.error('STDOUT:', err.stdout.toString());
  if (err.stderr) console.error('STDERR:', err.stderr.toString());
} finally {
  console.log('\n--- Limpiando entorno efímero en Docker ---');
  try {
    execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
    execSync(`docker exec ${DOCKER_CONTAINER} rm -f /tmp/fase4b53_${path.basename(COMMERCIAL_BACKUP)}`);
  } catch (cleanErr) {
    console.warn('Aviso de limpieza:', cleanErr.message);
  }
}

console.log('\n========================================================================');
console.log(`=== RESUMEN FASE 4B.5.3: ${evidence.passedChecks}/${evidence.totalChecks} PRUEBAS SUPERADAS (${Math.round(evidence.passedChecks/evidence.totalChecks*100)}%) ===`);
console.log('========================================================================\n');

if (evidence.passedChecks === evidence.totalChecks) {
  console.log('>>> TODAS LAS PRUEBAS FOCALIZADAS SUPERADAS: DICTAMEN GO CONFIRMADO <<<');
  process.exit(0);
} else {
  console.error('>>> FALLO EN PRUEBAS FOCALIZADAS: DICTAMEN NO-GO <<<');
  process.exit(1);
}
