// tests/fase4b01_rls_compatibility_runner.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.0.1
// SUITE DE VALIDACIÓN EXPERIMENTAL DE COMPATIBILIDAD RLS EN POSTGRESQL 17 AISLADO

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CONTAINER = 'pg_isolated_fase3b';
const DB_NAME = 'test_db';
const DB_USER = 'test_user';

function runSql(sql) {
  try {
    const stdout = execSync(
      `docker exec -i ${CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -v ON_ERROR_STOP=1 -A -t`,
      { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return { success: true, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      success: false,
      stdout: err.stdout ? err.stdout.toString().trim() : '',
      stderr: err.stderr ? err.stderr.toString().trim() : err.message
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
    return parsed;
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${res.stdout}\nError: ${e.message}`);
  }
}

function runMigrationFile(filePath) {
  const fullPath = path.resolve(filePath);
  const sql = fs.readFileSync(fullPath, 'utf8');
  return runSql(sql);
}

console.log('========================================================================');
console.log('=== SUITE FASE 4B.0.1: COMPATIBILIDAD RLS EN POSTGRESQL 17 AISLADO ===');
console.log('========================================================================\n');

const testEvidence = {
  timestamp: new Date().toISOString(),
  environment: 'PostgreSQL 17.11 on Alpine Linux (pg_isolated_fase3b)',
  database: DB_NAME,
  tests: []
};

function recordTest(name, passed, details = {}) {
  testEvidence.tests.push({ name, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}`);
  if (!passed) {
    console.error('  Detalles del fallo:', details);
  }
  return passed;
}

// -----------------------------------------------------------------------------
// PASO 1: Recreación del Estado Histórico Real de Producción
// -----------------------------------------------------------------------------
console.log('--- PASO 1: Recreando Estado Histórico Real de Supabase Producción ---');

runSql(`
-- Asegurar esquema auth y función auth.role() y auth.uid()
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    current_user
  );
$$;

-- Tabla de administradores
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.admin_users (user_id, email, is_active)
VALUES ('16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2'::uuid, 'admin@kioscoprox.com', true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true;

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

-- Limpiar objetos nuevos si existían de pruebas previas
DROP VIEW IF EXISTS public.v_campaign_totals CASCADE;
DROP VIEW IF EXISTS public.v_campaign_combined_metrics CASCADE;
DROP TABLE IF EXISTS public.consolidation_audit_log CASCADE;
DROP TABLE IF EXISTS public.purge_ledger CASCADE;
DROP TABLE IF EXISTS public.campaign_daily_aggregates CASCADE;

-- Recrear campaign_events con el esquema base idéntico a producción
DROP TABLE IF EXISTS public.campaign_events CASCADE;
CREATE TABLE public.campaign_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  campaign_id text NOT NULL,
  merchant_id text NOT NULL,
  event_type text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Estado de permisos histórico real en Supabase:
GRANT ALL ON TABLE public.campaign_events TO anon, authenticated, service_role;
ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;

-- Políticas RLS históricas reales:
CREATE POLICY "campaign_events_select_auth"
ON public.campaign_events FOR SELECT TO public
USING (auth.role() = 'authenticated');

CREATE POLICY "campaign_events_update_auth"
ON public.campaign_events FOR UPDATE TO public
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "campaign_events_delete_auth"
ON public.campaign_events FOR DELETE TO public
USING (auth.role() = 'authenticated');

-- Insertar evento de prueba
INSERT INTO public.campaign_events (event_id, campaign_id, merchant_id, event_type, timestamp)
VALUES ('evt-baseline-001', 'camp-alpha', 'merch-01', 'impression', now());
`);

// -----------------------------------------------------------------------------
// PASO 2: Demostración de Vulnerabilidad en el Estado Histórico Previo
// -----------------------------------------------------------------------------
console.log('\n--- PASO 2: Verificando Vulnerabilidad del Estado Heredado ---');

// Un usuario autenticado no-admin podía hacer UPDATE y DELETE
const legacyUpdateAttempt = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
UPDATE public.campaign_events SET event_type = 'compromised' WHERE event_id = 'evt-baseline-001';
COMMIT;
`);

const legacyCheck = runSql(`SELECT event_type FROM public.campaign_events WHERE event_id = 'evt-baseline-001';`).stdout;

recordTest('Vulnerabilidad Heredada: Usuario no-admin modifica evento bajo políticas antiguas',
  legacyUpdateAttempt.success && legacyCheck === 'compromised',
  { legacyUpdateSuccess: legacyUpdateAttempt.success, currentType: legacyCheck }
);

// Restaurar valor para la siguiente fase
runSql(`UPDATE public.campaign_events SET event_type = 'impression' WHERE event_id = 'evt-baseline-001';`);

// -----------------------------------------------------------------------------
// PASO 3: Aplicación Quirúrgica de la Migración Corregida
// -----------------------------------------------------------------------------
console.log('\n--- PASO 3: Aplicando Migración con Limpieza RLS y Revocaciones ---');

const ddlResult = runMigrationFile('supabase/migrations/20261106_campaign_statistics_aggregates.sql');
const funcResult = runMigrationFile('supabase/migrations/20261106_campaign_statistics_functions.sql');

recordTest('Migración DDL y Funciones aplicada con éxito sobre esquema histórico real',
  ddlResult.success && funcResult.success,
  { ddl: ddlResult.success, func: funcResult.success }
);

// Verificar que las políticas antiguas fueron eliminadas y no existen solapamientos
const activePolicies = runSqlJson(`
  SELECT polname, polcmd, polroles::text
  FROM pg_policy
  WHERE polrelid = 'public.campaign_events'::regclass
  ORDER BY polname;
`);

const policyNames = activePolicies.map(p => p.polname);
const hasLegacyPolicies = policyNames.includes('campaign_events_select_auth') ||
                          policyNames.includes('campaign_events_update_auth') ||
                          policyNames.includes('campaign_events_delete_auth');

recordTest('Limpieza RLS: Políticas heredadas eliminadas sin solapamiento por OR',
  !hasLegacyPolicies && policyNames.includes('campaign_events_admin_select') && policyNames.includes('campaign_events_service_role'),
  { activePolicies: policyNames }
);

// -----------------------------------------------------------------------------
// PASO 4: Matriz Exhaustiva de Seguridad 4x4 (anon, authenticated, admin, service_role)
// -----------------------------------------------------------------------------
console.log('\n--- PASO 4: Matriz de Seguridad 4x4 sobre public.campaign_events ---');

// 1. ROL: anon
const anonSelect = runSql(`
BEGIN;
SET LOCAL ROLE anon;
SELECT * FROM public.campaign_events;
COMMIT;
`);
recordTest('Matriz [anon - SELECT]: Bloqueado con error 42501 (Permission Denied)',
  !anonSelect.success && anonSelect.stderr.includes('permission denied'),
  { stderr: anonSelect.stderr }
);

const anonInsert = runSql(`
BEGIN;
SET LOCAL ROLE anon;
INSERT INTO public.campaign_events (event_id, campaign_id, merchant_id, event_type)
VALUES ('evt-anon-bad', 'camp-alpha', 'merch-01', 'click');
COMMIT;
`);
recordTest('Matriz [anon - INSERT]: Bloqueado con error 42501 (Permission Denied)',
  !anonInsert.success && anonInsert.stderr.includes('permission denied'),
  { stderr: anonInsert.stderr }
);

const anonUpdate = runSql(`
BEGIN;
SET LOCAL ROLE anon;
UPDATE public.campaign_events SET event_type = 'hacked';
COMMIT;
`);
recordTest('Matriz [anon - UPDATE]: Bloqueado con error 42501 (Permission Denied)',
  !anonUpdate.success && anonUpdate.stderr.includes('permission denied'),
  { stderr: anonUpdate.stderr }
);

const anonDelete = runSql(`
BEGIN;
SET LOCAL ROLE anon;
DELETE FROM public.campaign_events;
COMMIT;
`);
recordTest('Matriz [anon - DELETE]: Bloqueado con error 42501 (Permission Denied)',
  !anonDelete.success && anonDelete.stderr.includes('permission denied'),
  { stderr: anonDelete.stderr }
);

// 2. ROL: authenticated (Usuario regular no-admin)
const nonAdminSelect = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT COUNT(*) FROM public.campaign_events;
COMMIT;
`);
const nonAdminCount = nonAdminSelect.stdout.split('\n').filter(l => l && !isNaN(Number(l)))[0];
recordTest('Matriz [authenticated no-admin - SELECT]: Permitido por SQL, pero RLS retorna 0 filas',
  nonAdminSelect.success && Number(nonAdminCount) === 0,
  { success: nonAdminSelect.success, rowsReturned: nonAdminCount }
);

const nonAdminInsert = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO public.campaign_events (event_id, campaign_id, merchant_id, event_type)
VALUES ('evt-auth-bad', 'camp-alpha', 'merch-01', 'click');
COMMIT;
`);
recordTest('Matriz [authenticated no-admin - INSERT]: Bloqueado con error 42501 (Permission Denied)',
  !nonAdminInsert.success && nonAdminInsert.stderr.includes('permission denied'),
  { stderr: nonAdminInsert.stderr }
);

const nonAdminUpdate = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
UPDATE public.campaign_events SET event_type = 'modified';
COMMIT;
`);
recordTest('Matriz [authenticated no-admin - UPDATE]: Bloqueado con error 42501 (Permission Denied)',
  !nonAdminUpdate.success && nonAdminUpdate.stderr.includes('permission denied'),
  { stderr: nonAdminUpdate.stderr }
);

const nonAdminDelete = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DELETE FROM public.campaign_events;
COMMIT;
`);
recordTest('Matriz [authenticated no-admin - DELETE]: Bloqueado con error 42501 (Permission Denied)',
  !nonAdminDelete.success && nonAdminDelete.stderr.includes('permission denied'),
  { stderr: nonAdminDelete.stderr }
);

// 3. ROL: authenticated (Administrador Activo en admin_users)
const adminSelect = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT COUNT(*) FROM public.campaign_events;
COMMIT;
`);
const adminCount = adminSelect.stdout.split('\n').filter(l => l && !isNaN(Number(l)))[0];
recordTest('Matriz [admin activo - SELECT]: Acceso autorizado por RLS (ve filas reales)',
  adminSelect.success && Number(adminCount) > 0,
  { success: adminSelect.success, rowsReturned: adminCount }
);

const adminInsert = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO public.campaign_events (event_id, campaign_id, merchant_id, event_type)
VALUES ('evt-admin-bad', 'camp-alpha', 'merch-01', 'click');
COMMIT;
`);
recordTest('Matriz [admin activo - INSERT]: Bloqueado (Inmutabilidad de telemetría sin canal directo)',
  !adminInsert.success && adminInsert.stderr.includes('permission denied'),
  { stderr: adminInsert.stderr }
);

const adminUpdate = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
UPDATE public.campaign_events SET event_type = 'tampered';
COMMIT;
`);
recordTest('Matriz [admin activo - UPDATE]: Bloqueado (Inmutabilidad de telemetría sin canal directo)',
  !adminUpdate.success && adminUpdate.stderr.includes('permission denied'),
  { stderr: adminUpdate.stderr }
);

const adminDelete = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DELETE FROM public.campaign_events;
COMMIT;
`);
recordTest('Matriz [admin activo - DELETE]: Bloqueado (Inmutabilidad de telemetría sin canal directo)',
  !adminDelete.success && adminDelete.stderr.includes('permission denied'),
  { stderr: adminDelete.stderr }
);

// 4. ROL: service_role (Edge Function terminal-sync y tareas de mantenimiento)
const srSelect = runSql(`
BEGIN;
SET LOCAL ROLE service_role;
SELECT COUNT(*) FROM public.campaign_events;
COMMIT;
`);
const srCount = srSelect.stdout.split('\n').filter(l => l && !isNaN(Number(l)))[0];
recordTest('Matriz [service_role - SELECT]: Acceso total concedido',
  srSelect.success && Number(srCount) > 0,
  { success: srSelect.success, rowsReturned: srCount }
);

const srInsert = runSql(`
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.campaign_events (event_id, campaign_id, merchant_id, event_type)
VALUES ('evt-sr-test-99', 'camp-alpha', 'merch-01', 'impression');
COMMIT;
`);
recordTest('Matriz [service_role - INSERT]: Autorizado (simulando ingesta terminal-sync)',
  srInsert.success,
  { success: srInsert.success }
);

const srUpdate = runSql(`
BEGIN;
SET LOCAL ROLE service_role;
UPDATE public.campaign_events SET aggregated_at = now() WHERE event_id = 'evt-sr-test-99';
COMMIT;
`);
recordTest('Matriz [service_role - UPDATE]: Autorizado (simulando consolidación de lote)',
  srUpdate.success,
  { success: srUpdate.success }
);

const srDelete = runSql(`
BEGIN;
SET LOCAL ROLE service_role;
DELETE FROM public.campaign_events WHERE event_id = 'evt-sr-test-99';
COMMIT;
`);
recordTest('Matriz [service_role - DELETE]: Autorizado (simulando purga rotativa)',
  srDelete.success,
  { success: srDelete.success }
);

// -----------------------------------------------------------------------------
// PASO 5: Verificación del Acceso del Panel Administrativo (Vistas y Totales)
// -----------------------------------------------------------------------------
console.log('\n--- PASO 5: Verificación del Panel Administrativo (Vistas) ---');

const adminViewsAccess = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT COUNT(*) FROM public.v_campaign_combined_metrics;
SELECT COUNT(*) FROM public.v_campaign_totals;
COMMIT;
`);
recordTest('Panel Admin: Acceso legítimo a v_campaign_combined_metrics y v_campaign_totals',
  adminViewsAccess.success,
  { output: adminViewsAccess.stdout }
);

const nonAdminViewsAccess = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT COUNT(*) FROM public.v_campaign_combined_metrics;
COMMIT;
`);
const nonAdminViewCount = nonAdminViewsAccess.stdout.split('\n').filter(l => l && !isNaN(Number(l)))[0];
recordTest('Panel Admin Seguridad: No-Admin ve 0 filas en v_campaign_combined_metrics vía RLS',
  nonAdminViewsAccess.success && Number(nonAdminViewCount) === 0,
  { rowsReturned: nonAdminViewCount }
);

// Guardar evidencia JSON
const evidencePath = path.resolve('tests/fase4b01_rls_evidence.json');
fs.writeFileSync(evidencePath, JSON.stringify(testEvidence, null, 2), 'utf8');

const allPassed = testEvidence.tests.every(t => t.passed);
console.log('\n========================================================================');
console.log(`=== RESULTADO SUITE 4B.0.1: ${allPassed ? 'TODAS LAS PRUEBAS PASARON (100% PASS)' : 'FALLOS DETECTADOS'} ===`);
console.log(`Evidencia guardada en: ${evidencePath}`);
console.log('========================================================================\n');

if (!allPassed) {
  process.exit(1);
}
