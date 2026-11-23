// tests/fase4b71_sizing_audit.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.7.1
// AUDITORÍA DE TAMAÑOS REALES EN DOCKER AISLADO

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DOCKER_CONTAINER = 'pg_isolated_fase3b';
const DB_USER = 'test_user';
const TEMP_DB = 'tmp_fase4b71_audit';
const COMMERCIAL_BACKUP = path.resolve('backups/supabase_backup_20261109_215247.dump');

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
  console.log('--- 1. Preparando base temporal y restaurando backup comercial ---');
  execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
  execSync(`docker exec ${DOCKER_CONTAINER} createdb -U ${DB_USER} ${TEMP_DB}`);

  const ensureRolesSql = `
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
  runSql(TEMP_DB, ensureRolesSql);

  const containerDump = `/tmp/fase4b71_${path.basename(COMMERCIAL_BACKUP)}`;
  execSync(`docker cp "${COMMERCIAL_BACKUP}" ${DOCKER_CONTAINER}:${containerDump}`);

  execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'pg_restore', '-U', DB_USER, '-d', TEMP_DB,
    '--schema=public', '--exit-on-error', containerDump
  ], { encoding: 'utf8' });

  // Aplicar migraciones
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_aggregates.sql');
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_functions.sql');

  // Ejecutar consolidación
  runSql(TEMP_DB, `SELECT public.consolidate_campaign_events_batch('manual', 50000);`);

  console.log('\n--- 2. Mediciones de tamaño real de campaign_events y agregados ---');

  const sizingSql = `
    SELECT 
      relname,
      pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
      pg_total_relation_size(c.oid) as total_bytes,
      pg_size_pretty(pg_relation_size(c.oid)) as table_size,
      pg_relation_size(c.oid) as table_bytes,
      pg_size_pretty(pg_indexes_size(c.oid)) as index_size,
      pg_indexes_size(c.oid) as index_bytes,
      reltuples::bigint as estimated_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' 
      AND c.relname IN ('campaign_events', 'campaign_daily_aggregates', 'consolidation_audit_log', 'purge_ledger')
    ORDER BY pg_total_relation_size(c.oid) DESC;
  `;
  console.log(runSql(TEMP_DB, sizingSql));

  console.log('\n--- 3. Detalle de índices en campaign_events ---');
  const indexDetailSql = `
    SELECT 
      i.relname as index_name,
      pg_size_pretty(pg_relation_size(i.oid)) as size,
      pg_relation_size(i.oid) as bytes
    FROM pg_class t
    JOIN pg_index x ON t.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    WHERE t.relname = 'campaign_events'
    ORDER BY pg_relation_size(i.oid) DESC;
  `;
  console.log(runSql(TEMP_DB, indexDetailSql));

  console.log('\n--- 4. Conteo de filas exacto y fecha mín/máx ---');
  const datesSql = `
    SELECT 
      count(*) as total_events,
      min(timestamp) as min_ts,
      max(timestamp) as max_ts,
      (max(timestamp)::date - min(timestamp)::date) as days_span
    FROM public.campaign_events;
  `;
  console.log(runSql(TEMP_DB, datesSql));

  console.log('\n--- 5. Distribución por fecha en campaign_daily_aggregates ---');
  const aggDatesSql = `
    SELECT 
      count(*) as agg_partitions,
      sum(event_count) as total_aggregated_events,
      min(event_date) as min_date,
      max(event_date) as max_date,
      count(distinct event_date) as distinct_dates,
      count(distinct campaign_id) as distinct_campaigns,
      count(distinct merchant_id) as distinct_merchants
    FROM public.campaign_daily_aggregates;
  `;
  console.log(runSql(TEMP_DB, aggDatesSql));

  // Limpieza
  execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
  console.log('\nBase temporal eliminada.');
} catch (e) {
  console.error('Error:', e);
}

