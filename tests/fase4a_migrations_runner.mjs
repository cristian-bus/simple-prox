// tests/fase4a_migrations_runner.mjs
// Suite de validación local y auditoría de migraciones SQL para FASE 4A en PostgreSQL 17
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CONTAINER_NAME = 'pg_isolated_fase3b';
const DB_USER = 'test_user';
const DB_NAME = 'test_db';

function runSql(sql, options = {}) {
  try {
    const cmd = `docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -v ON_ERROR_STOP=1 -A -t -F "|"`;
    const res = execSync(cmd, {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout || 60000
    });
    return { stdout: res.trim(), stderr: '', success: true };
  } catch (err) {
    return {
      stdout: err.stdout ? err.stdout.toString().trim() : '',
      stderr: err.stderr ? err.stderr.toString().trim() : (err.message || ''),
      success: false
    };
  }
}

function runSqlJson(sql) {
  const cleanSql = sql.trim().replace(/;\s*$/, '');
  const wrapped = `SELECT json_agg(t) FROM (${cleanSql}) t;`;
  const res = runSql(wrapped);
  if (!res.success) {
    throw new Error(`SQL Error: ${res.stderr}\nQuery: ${cleanSql}`);
  }
  if (!res.stdout || res.stdout === '' || res.stdout === 'null') {
    return [];
  }
  try {
    const parsed = JSON.parse(res.stdout);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(row => {
      // Si la fila tiene una sola clave cuyo valor es un objeto o escalar, aplanar si es función
      const keys = Object.keys(row);
      if (keys.length === 1 && typeof row[keys[0]] === 'object' && row[keys[0]] !== null && !Array.isArray(row[keys[0]])) {
        return row[keys[0]];
      }
      return row;
    });
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${res.stdout}\nError: ${e.message}`);
  }
}

function runMigrationFile(filePath) {
  const fullPath = path.resolve(filePath);
  const sql = fs.readFileSync(fullPath, 'utf8');
  return runSql(sql);
}

console.log('===============================================================');
console.log('=== INICIANDO SUITE DE VALIDACIÓN FASE 4A (POSTGRESQL 17) ===');
console.log('===============================================================\n');

const testEvidence = {
  timestamp: new Date().toISOString(),
  environment: 'PostgreSQL 17.11 on Alpine Linux (pg_isolated_fase3b)',
  database: DB_NAME,
  user: DB_USER,
  tests: []
};

function recordTest(name, passed, details = {}) {
  const result = { name, passed, details };
  testEvidence.tests.push(result);
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}`);
  if (!passed) {
    console.error('  Detalles del fallo:', details);
  }
  return passed;
}

// -----------------------------------------------------------------------------
// PRUEBA 1: Instalación Limpia y Reejecución Idempotente
// -----------------------------------------------------------------------------
console.log('--- PRUEBA 1: Instalación Limpia y Reejecución Idempotente ---');

// Limpieza inicial previa y aseguramiento de roles en entorno aislado
runSql(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;

-- Asegurar esquema auth y función auth.uid() para simulación fiel de Supabase
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Tabla oficial de administradores y función is_active_admin (espejo idéntico a producción)
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
      AND is_active = true
  );
END;
$$;

-- Insertar fixture de administrador real activo y asegurar permisos
INSERT INTO public.admin_users (user_id, email, is_active)
VALUES ('16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2'::uuid, 'admin@kioscoprox.com', true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON public.admin_users TO service_role;

DROP VIEW IF EXISTS public.v_campaign_totals CASCADE;
DROP VIEW IF EXISTS public.v_campaign_combined_metrics CASCADE;
DROP FUNCTION IF EXISTS public.purge_campaign_events_safe(integer, integer, boolean, text) CASCADE;
DROP FUNCTION IF EXISTS public.reconcile_campaign_metrics_4d(date, text) CASCADE;
DROP FUNCTION IF EXISTS public.consolidate_campaign_events_batch(text, integer) CASCADE;
DROP TABLE IF EXISTS public.consolidation_audit_log CASCADE;
DROP TABLE IF EXISTS public.purge_ledger CASCADE;
DROP TABLE IF EXISTS public.campaign_daily_aggregates CASCADE;
ALTER TABLE public.campaign_events DROP COLUMN IF EXISTS aggregated_at;
`);

// 1.1 Primera ejecución de migraciones
const aggMigRes1 = runMigrationFile('supabase/migrations/20261106_campaign_statistics_aggregates.sql');
const funcMigRes1 = runMigrationFile('supabase/migrations/20261106_campaign_statistics_functions.sql');

// 1.2 Reejecución (Idempotencia)
const aggMigRes2 = runMigrationFile('supabase/migrations/20261106_campaign_statistics_aggregates.sql');
const funcMigRes2 = runMigrationFile('supabase/migrations/20261106_campaign_statistics_functions.sql');

recordTest('Prueba 1: Instalación Limpia y Reejecución Idempotente',
  aggMigRes1.success && funcMigRes1.success && aggMigRes2.success && funcMigRes2.success,
  {
    first_run_aggregates: aggMigRes1.success,
    first_run_functions: funcMigRes1.success,
    idempotent_aggregates: aggMigRes2.success,
    idempotent_functions: funcMigRes2.success,
    error: aggMigRes2.stderr || funcMigRes2.stderr
  }
);

// -----------------------------------------------------------------------------
// PRUEBA 2: Backfill Sintético (10.000 Eventos emulando Supabase real)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 2: Backfill Sintético (10.000 Eventos) ---');

runSql(`
TRUNCATE public.campaign_events RESTART IDENTITY;

-- Inserción de 10.000 eventos distribuidos en 15 días, 5 campañas, 8 comercios y 3 tipos
INSERT INTO public.campaign_events (event_id, campaign_id, merchant_id, event_type, timestamp, aggregated_at)
SELECT 
  'evt-bf-' || i,
  'camp-' || (1 + (i % 5)),
  'merch-' || (1 + (i % 8)),
  CASE (i % 3) WHEN 0 THEN 'impression' WHEN 1 THEN 'offer_open' ELSE 'whatsapp_click' END,
  CURRENT_DATE - INTERVAL '1 day' * (i % 15) + INTERVAL '1 minute' * (i % 1440),
  NULL
FROM generate_series(1, 10000) AS i;
`);

const backfillExec = runSqlJson(`SELECT public.consolidate_campaign_events_batch('backfill-worker', 50000);`)[0];
const unaggregatedRemaining = runSqlJson(`SELECT COUNT(*) AS count FROM public.campaign_events WHERE aggregated_at IS NULL;`)[0].count;
const aggregatesTotalSum = runSqlJson(`SELECT SUM(event_count) AS total FROM public.campaign_daily_aggregates;`)[0].total;

recordTest('Prueba 2: Backfill Sintético de 10.000 Eventos',
  backfillExec.success === true &&
  backfillExec.processed === 10000 &&
  Number(unaggregatedRemaining) === 0 &&
  Number(aggregatesTotalSum) === 10000,
  { backfillExec, unaggregatedRemaining, aggregatesTotalSum }
);

// -----------------------------------------------------------------------------
// PRUEBA 3: Consolidación Repetida (Idempotencia y Sin Duplicación)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 3: Consolidación Repetida (Idempotencia) ---');

const repeatConsolidate = runSqlJson(`SELECT public.consolidate_campaign_events_batch('cron-worker-check', 50000);`)[0];
const aggregatesTotalAfterRepeat = runSqlJson(`SELECT SUM(event_count) AS total FROM public.campaign_daily_aggregates;`)[0].total;

recordTest('Prueba 3: Consolidación Repetida Sin Duplicación',
  repeatConsolidate.success === true &&
  repeatConsolidate.processed === 0 &&
  Number(aggregatesTotalAfterRepeat) === 10000,
  { repeatConsolidate, aggregatesTotalAfterRepeat }
);

// -----------------------------------------------------------------------------
// PRUEBA 4: Conciliación Histórica 4D Inicial (FULL OUTER JOIN)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 4: Conciliación Histórica 4D Inicial ---');

const reconInitial = runSqlJson(`SELECT public.reconcile_campaign_metrics_4d();`)[0];

recordTest('Prueba 4: Conciliación 4D Inicial al 100%',
  reconInitial.all_matching === true &&
  reconInitial.mismatches_count === 0 &&
  reconInitial.total_partitions_checked > 0,
  reconInitial
);

// -----------------------------------------------------------------------------
// PRUEBA 5: Purga Defensiva con Simulación (Dry-Run por Defecto)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 5: Purga Defensiva Dry-Run ---');

const dryRunPurge = runSqlJson(`SELECT public.purge_campaign_events_safe(5);`)[0];
const rawCountAfterDryRun = runSqlJson(`SELECT COUNT(*) AS count FROM public.campaign_events;`)[0].count;

recordTest('Prueba 5: Purga Desactivada por Defecto (Dry-Run)',
  dryRunPurge.success === true &&
  dryRunPurge.mode === 'DRY_RUN' &&
  Number(rawCountAfterDryRun) === 10000,
  { dryRunPurge, rawCountAfterDryRun }
);

// -----------------------------------------------------------------------------
// PRUEBA 6: Primera Purga Real y Auditoría en purge_ledger
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 6: Primera Purga Real (> 5 días) ---');

const realPurge1 = runSqlJson(`SELECT public.purge_campaign_events_safe(5, 50000, false, 'test-operator-1');`)[0];
const rawRemaining1 = runSqlJson(`SELECT COUNT(*) AS count FROM public.campaign_events;`)[0].count;
const ledgerCount1 = runSqlJson(`SELECT SUM(purged_count) AS total_purged FROM public.purge_ledger;`)[0].total_purged;
const reconPostPurge1 = runSqlJson(`SELECT public.reconcile_campaign_metrics_4d();`)[0];

recordTest('Prueba 6: Purga Real con Auditoría y Conciliación Inmune',
  realPurge1.success === true &&
  realPurge1.mode === 'REAL_PURGE' &&
  realPurge1.deleted_count > 0 &&
  Number(rawRemaining1) + Number(ledgerCount1) === 10000 &&
  reconPostPurge1.all_matching === true &&
  reconPostPurge1.mismatches_count === 0,
  { realPurge1, rawRemaining1, ledgerCount1, reconPostPurge1 }
);

// -----------------------------------------------------------------------------
// PRUEBA 7: Llegada y Consolidación de Eventos Atrasados Post-Purga
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 7: Eventos Atrasados en Ventana Purgada ---');

// Insertar 150 eventos con fechas de hace 8 y 10 días (ya purgadas)
runSql(`
INSERT INTO public.campaign_events (event_id, campaign_id, merchant_id, event_type, timestamp, aggregated_at)
SELECT 
  'evt-late-' || i,
  'camp-' || (1 + (i % 5)),
  'merch-' || (1 + (i % 8)),
  'impression',
  CURRENT_DATE - INTERVAL '8 days' + INTERVAL '2 minutes' * i,
  NULL
FROM generate_series(1, 150) AS i;
`);

const lateConsolidation = runSqlJson(`SELECT public.consolidate_campaign_events_batch('worker-late-events', 50000);`)[0];
const aggregatesTotalAfterLate = runSqlJson(`SELECT SUM(event_count) AS total FROM public.campaign_daily_aggregates;`)[0].total;
const reconPostLate = runSqlJson(`SELECT public.reconcile_campaign_metrics_4d();`)[0];

recordTest('Prueba 7: Integración y Conciliación de Eventos Atrasados',
  lateConsolidation.success === true &&
  lateConsolidation.processed === 150 &&
  Number(aggregatesTotalAfterLate) === 10150 &&
  reconPostLate.all_matching === true &&
  reconPostLate.mismatches_count === 0,
  { lateConsolidation, aggregatesTotalAfterLate, reconPostLate }
);

// -----------------------------------------------------------------------------
// PRUEBA 8: Segunda Purga Real (Post-Eventos Atrasados)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 8: Segunda Purga Real de Eventos Atrasados Consolidados ---');

const realPurge2 = runSqlJson(`SELECT public.purge_campaign_events_safe(5, 50000, false, 'test-operator-2');`)[0];
const rawRemaining2 = runSqlJson(`SELECT COUNT(*) AS count FROM public.campaign_events;`)[0].count;
const ledgerCount2 = runSqlJson(`SELECT SUM(purged_count) AS total_purged FROM public.purge_ledger;`)[0].total_purged;
const reconPostPurge2 = runSqlJson(`SELECT public.reconcile_campaign_metrics_4d();`)[0];

recordTest('Prueba 8: Segunda Purga y Conservación Matemática de Integridad',
  realPurge2.success === true &&
  realPurge2.deleted_count === 150 &&
  Number(rawRemaining2) + Number(ledgerCount2) === 10150 &&
  reconPostPurge2.all_matching === true &&
  reconPostPurge2.mismatches_count === 0,
  { realPurge2, rawRemaining2, ledgerCount2, reconPostPurge2 }
);

// -----------------------------------------------------------------------------
// PRUEBA 9: Detección de Discrepancias y Aborto Defensivo de Purga
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 9: Detección de Inconsistencias y Aborto de Purga ---');

// Obtener clave primaria exacta de un agregado con fecha elegible para purga
const targetRow = runSqlJson(`
  SELECT campaign_id, event_date, event_type, merchant_id 
  FROM public.campaign_daily_aggregates 
  WHERE event_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 5
  ORDER BY campaign_id, event_date, event_type, merchant_id
  LIMIT 1;
`)[0];

// Inyectar anomalía deliberada en ese registro exacto
runSql(`
UPDATE public.campaign_daily_aggregates 
SET event_count = event_count + 999 
WHERE campaign_id = '${targetRow.campaign_id}'
  AND event_date = '${targetRow.event_date}'
  AND event_type = '${targetRow.event_type}'
  AND merchant_id = '${targetRow.merchant_id}';
`);

const reconWithAnomaly = runSqlJson(`SELECT public.reconcile_campaign_metrics_4d();`)[0];
const purgeWithAnomaly = runSql(`SELECT public.purge_campaign_events_safe(5, 50000, false, 'admin-bad');`);

// Restaurar exactamente el mismo registro para dejar estado 100% limpio
runSql(`
UPDATE public.campaign_daily_aggregates 
SET event_count = event_count - 999 
WHERE campaign_id = '${targetRow.campaign_id}'
  AND event_date = '${targetRow.event_date}'
  AND event_type = '${targetRow.event_type}'
  AND merchant_id = '${targetRow.merchant_id}';
`);

recordTest('Prueba 9: Detección Bidireccional de Inconsistencias y Cancelación de Purga',
  reconWithAnomaly.all_matching === false &&
  reconWithAnomaly.mismatches_count > 0 &&
  purgeWithAnomaly.stderr.includes('PURGA_CANCELADA'),
  {
    anomaly_detected: reconWithAnomaly.mismatches_count > 0,
    mismatches_count: reconWithAnomaly.mismatches_count,
    purge_aborted_message: purgeWithAnomaly.stderr
  }
);

// -----------------------------------------------------------------------------
// PRUEBA 10: Concurrencia de Consolidadores (Mutual Exclusion con Advisory Lock)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 10: Concurrencia de Consolidadores (Advisory Lock) ---');

// Lanzar conexión en segundo plano que retiene el advisory lock por 2.5 segundos
const lockHolder = spawn('docker', [
  'exec', '-i', CONTAINER_NAME,
  'psql', '-U', DB_USER, '-d', DB_NAME,
  '-c', 'BEGIN; SELECT pg_advisory_xact_lock(847291038472910283); SELECT pg_sleep(2.5); COMMIT;'
]);

// Pausa de 300ms para asegurar que la conexión 1 adquirió el lock
await new Promise(r => setTimeout(r, 300));

// Conexión 2 intenta consolidar mientras el lock está tomado
const concurrentWorkerRes = runSqlJson(`SELECT public.consolidate_campaign_events_batch('worker-concurrent', 100);`)[0];

// Esperar a que el holder termine limpiamente
await new Promise(r => lockHolder.on('close', r));

recordTest('Prueba 10: Exclusión Mutua Concurrente entre Consolidadores',
  concurrentWorkerRes.success === false &&
  concurrentWorkerRes.reason === 'LOCKED_BY_ANOTHER_TRANSACTION',
  concurrentWorkerRes
);

// -----------------------------------------------------------------------------
// PRUEBA 11: Validación de Vistas y Totales para Panel Administrativo
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 11: Validación de Vistas para Panel Administrativo ---');

const totals = runSqlJson(`SELECT * FROM public.v_campaign_totals ORDER BY campaign_id, event_type;`);
const combinedSum = runSqlJson(`SELECT SUM(event_count) AS total FROM public.v_campaign_combined_metrics;`)[0].total;

recordTest('Prueba 11: Integridad de Vistas v_campaign_totals y v_campaign_combined_metrics',
  totals.length > 0 &&
  Number(combinedSum) === 10150,
  { total_campaign_types: totals.length, combinedSum }
);

// -----------------------------------------------------------------------------
// PRUEBA 13 a 18: BATERÍA DE SEGURIDAD RLS, ROLES Y RPC (FASE 4A.2)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBAS 13 a 18: BATERÍA DE SEGURIDAD Y PERMISOS ---');

// P13: Consulta de vista como Administrador Activo
const adminViewQuery = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT COUNT(*) FROM public.v_campaign_combined_metrics;
COMMIT;
`);
const adminLines = adminViewQuery.stdout.split('\n').map(l => l.trim()).filter(l => l && !isNaN(Number(l)));
const adminRowsCount = adminLines.length > 0 ? Number(adminLines[0]) : 0;

recordTest('Prueba 13: Consulta de Vistas como Administrador Activo (Acceso Autorizado)',
  adminViewQuery.success && adminRowsCount > 0,
  { success: adminViewQuery.success, rowsSeen: adminRowsCount }
);

// P14: Consulta de vista como Usuario Autenticado NO Administrador (Debe ver 0 filas por RLS)
const nonAdminViewQuery = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT COUNT(*) FROM public.v_campaign_combined_metrics;
COMMIT;
`);
const nonAdminLines = nonAdminViewQuery.stdout.split('\n').map(l => l.trim()).filter(l => l && !isNaN(Number(l)));
const nonAdminRowsCount = nonAdminLines.length > 0 ? Number(nonAdminLines[0]) : -1;

recordTest('Prueba 14: Consulta de Vistas como NO Administrador (Bloqueado por RLS = 0 filas)',
  nonAdminViewQuery.success && nonAdminRowsCount === 0,
  { success: nonAdminViewQuery.success, rowsSeen: nonAdminRowsCount }
);

// P15: Intento de Acceso Anónimo a Vistas (Debe fallar con permiso denegado 42501)
const anonViewQuery = runSql(`
BEGIN;
SET LOCAL ROLE anon;
SELECT * FROM public.v_campaign_combined_metrics LIMIT 1;
COMMIT;
`);

recordTest('Prueba 15: Acceso Anónimo a Vistas Bloqueado (42501)',
  !anonViewQuery.success && (anonViewQuery.stderr.includes('permission denied') || anonViewQuery.stderr.includes('42501')),
  { error: anonViewQuery.stderr }
);

// P16: Ejecución de RPC reconcile como NO Administrador (Debe lanzar excepción de Acceso denegado)
const nonAdminRpcQuery = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.reconcile_campaign_metrics_4d();
COMMIT;
`);

recordTest('Prueba 16: RPC Reconcile Bloqueado para NO Administrador',
  !nonAdminRpcQuery.success && nonAdminRpcQuery.stderr.includes('Acceso denegado'),
  { error: nonAdminRpcQuery.stderr }
);

// P17: Ejecución de RPC reconcile como Administrador Activo
const adminRpcQuery = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.reconcile_campaign_metrics_4d();
COMMIT;
`);

recordTest('Prueba 17: RPC Reconcile Permitido para Administrador Activo',
  adminRpcQuery.success && adminRpcQuery.stdout.includes('all_matching'),
  { success: adminRpcQuery.success, output: adminRpcQuery.stdout }
);

// P18: Intento de ejecución de RPC consolidate y purge por authenticated (Bloqueado por REVOKE)
const authConsolidateQuery = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT public.consolidate_campaign_events_batch();
COMMIT;
`);

const authPurgeQuery = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT public.purge_campaign_events_safe();
COMMIT;
`);

recordTest('Prueba 18: RPC Consolidate y Purge Prohibidos para Authenticated (Solo service_role)',
  !authConsolidateQuery.success && !authPurgeQuery.success &&
  authConsolidateQuery.stderr.includes('permission denied') &&
  authPurgeQuery.stderr.includes('permission denied'),
  {
    consolidateErr: authConsolidateQuery.stderr,
    purgeErr: authPurgeQuery.stderr
  }
);

// -----------------------------------------------------------------------------
// PRUEBA 12: Rollback Seguro (Escenario A: Antes de Activar la Purga)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 12: Rollback Seguro (Escenario A) ---');

// Recrear un dataset nuevo no purgado para validar el rollback
runSql(`
TRUNCATE public.campaign_events RESTART IDENTITY;
INSERT INTO public.campaign_events (event_id, campaign_id, merchant_id, event_type, timestamp, aggregated_at)
SELECT 
  'evt-rb-test-' || i,
  'camp-1', 'merch-1', 'impression', NOW(), NULL
FROM generate_series(1, 50) AS i;
`);

// Ejecutar rollback desde manual-scripts
const funcRbRes = runMigrationFile('supabase/manual-scripts/20261106_campaign_statistics_functions_ROLLBACK.sql');
const aggRbRes = runMigrationFile('supabase/manual-scripts/20261106_campaign_statistics_aggregates_ROLLBACK.sql');

// Comprobar que campaign_events conserva los 50 eventos intactos
const remainingEventsAfterRb = runSqlJson(`SELECT COUNT(*) AS count FROM public.campaign_events;`)[0].count;

// Comprobar que las tablas y vistas nuevas ya no existen
const checkTables = runSql(`
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'campaign_daily_aggregates') AS t_agg,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purge_ledger') AS t_purge,
       EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'v_campaign_combined_metrics') AS v_comb;
`).stdout;

recordTest('Prueba 12: Rollback Seguro Preservando Datos Crudos',
  funcRbRes.success && aggRbRes.success &&
  Number(remainingEventsAfterRb) === 50 &&
  checkTables.includes('f|f|f'),
  { funcRbRes: funcRbRes.success, aggRbRes: aggRbRes.success, remainingEventsAfterRb, checkTables }
);

// -----------------------------------------------------------------------------
// REINSTALAR MIGRACIONES PARA DEJAR EL ENTORNO LISTO
// -----------------------------------------------------------------------------
console.log('\n--- Reinstalando migraciones finales en test_db... ---');
runMigrationFile('supabase/migrations/20261106_campaign_statistics_aggregates.sql');
runMigrationFile('supabase/migrations/20261106_campaign_statistics_functions.sql');

// Guardar evidencia JSON
const evidencePath = path.resolve('tests/fase4a_raw_evidence.json');
fs.writeFileSync(evidencePath, JSON.stringify(testEvidence, null, 2), 'utf8');

const allPassed = testEvidence.tests.every(t => t.passed);
console.log('\n===============================================================');
console.log(`=== SUITE FASE 4A FINALIZADA: ${allPassed ? 'TODAS LAS PRUEBAS PASARON (12/12 PASS)' : 'EXISTEN FALLOS'} ===`);
console.log(`Evidencia guardada en: ${evidencePath}`);
console.log('===============================================================\n');

if (!allPassed) {
  process.exit(1);
}
