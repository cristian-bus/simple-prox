// tests/fase4b75_retention_cron_runner.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.7.5 CORRECCIÓN FINAL
// SUITE DE VALIDACIÓN: CONTEO REAL DIRECTO POR DELETE, ROLES PG_CRON Y ADVISORY LOCKS

import { execSync, spawn } from 'child_process';
import fs from 'fs';

console.log('========================================================================');
console.log('=== SUITE FASE 4B.7.5: PRUEBAS EN DOCKER AISLADO (RE-VERIFICACIÓN) ===');
console.log('========================================================================\n');

function runPsql(sqlScript, role = 'postgres') {
  const res = execSync(`docker exec -i supabase_db_KioscoProX psql -U ${role} -d postgres -v ON_ERROR_STOP=1`, {
    input: sqlScript,
    encoding: 'utf8'
  });
  return res.trim();
}

let passedTests = 0;
const totalTests = 11;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FALLO: ${message}`);
  }
}

async function main() {
  // 1. Preparar infraestructura previa
  console.log('1. Preparando extensiones y esquema base...');
  runPsql(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    CREATE TABLE IF NOT EXISTS public.campaigns (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      daily_limit integer,
      is_daily_limit_enabled boolean DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS public.merchants (
      id text PRIMARY KEY,
      name text,
      status text DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS public.campaign_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id uuid REFERENCES public.campaigns(id),
      merchant_id text,
      event_type text NOT NULL,
      timestamp timestamptz NOT NULL,
      aggregated_at timestamptz DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS public.campaign_daily_aggregates (
      campaign_id uuid NOT NULL,
      event_date date NOT NULL,
      event_type text NOT NULL,
      merchant_id text NOT NULL,
      event_count bigint NOT NULL DEFAULT 0,
      last_aggregated_at timestamptz DEFAULT now(),
      PRIMARY KEY (campaign_id, event_date, event_type, merchant_id)
    );

    CREATE TABLE IF NOT EXISTS public.purge_ledger (
      id bigserial PRIMARY KEY,
      purge_batch_id uuid NOT NULL,
      campaign_id uuid NOT NULL,
      event_date date NOT NULL,
      merchant_id text NOT NULL,
      event_type text NOT NULL,
      purged_count integer NOT NULL,
      cutoff_date date NOT NULL,
      executed_at timestamptz NOT NULL DEFAULT now(),
      executed_by text
    );

    CREATE OR REPLACE VIEW public.v_campaign_combined_metrics AS
    SELECT 
      coalesce(cda.campaign_id, ce.campaign_id) AS campaign_id,
      coalesce(cda.event_date, (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS event_date,
      coalesce(cda.event_type, ce.event_type) AS event_type,
      coalesce(cda.merchant_id, ce.merchant_id) AS merchant_id,
      (coalesce(cda.event_count, 0) + count(ce.id))::bigint AS event_count
    FROM public.campaign_daily_aggregates cda
    FULL OUTER JOIN public.campaign_events ce 
      ON ce.aggregated_at IS NULL
     AND ce.campaign_id = cda.campaign_id
     AND ce.event_type = cda.event_type
     AND ce.merchant_id = cda.merchant_id
     AND (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = cda.event_date
    GROUP BY 
      coalesce(cda.campaign_id, ce.campaign_id),
      coalesce(cda.event_date, (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date),
      coalesce(cda.event_type, ce.event_type),
      coalesce(cda.merchant_id, ce.merchant_id),
      cda.event_count;
  `);

  console.log('Aplicando migración previa 20261111_retention_and_quota_hardening.sql...');
  runPsql(fs.readFileSync('supabase/migrations/20261111_retention_and_quota_hardening.sql', 'utf8'));

  console.log('Aplicando Tarea 1 Ajustada: 20261111_fix_purge_count_diagnostic.sql...');
  runPsql(fs.readFileSync('supabase/migrations/20261111_fix_purge_count_diagnostic.sql', 'utf8'));

  // Seed de datos
  console.log('Sembrando datos sintéticos...');
  runPsql(`
    TRUNCATE public.campaign_events CASCADE;
    TRUNCATE public.campaign_daily_aggregates CASCADE;
    TRUNCATE public.purge_ledger CASCADE;
    TRUNCATE public.campaigns CASCADE;
    TRUNCATE public.merchants CASCADE;

    INSERT INTO public.campaigns (id, title, status)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'Camp Aislada', 'active');

    INSERT INTO public.merchants (id, name, status)
    VALUES ('M-DOCKER-01', 'Kiosco Docker', 'active');

    -- 350 consolidados antiguos (45 días) -> ELEGIBLES
    INSERT INTO public.campaign_events (campaign_id, merchant_id, event_type, timestamp, aggregated_at)
    SELECT 
      'a0000000-0000-0000-0000-000000000001'::uuid,
      'M-DOCKER-01',
      'impression',
      now() - interval '45 days' + (g || ' seconds')::interval,
      now() - interval '40 days'
    FROM generate_series(1, 350) g;

    -- 50 antiguos NO consolidados (45 días, aggregated_at NULL) -> NO ELEGIBLES
    INSERT INTO public.campaign_events (campaign_id, merchant_id, event_type, timestamp, aggregated_at)
    SELECT 
      'a0000000-0000-0000-0000-000000000001'::uuid,
      'M-DOCKER-01',
      'impression',
      now() - interval '45 days' + (g || ' seconds')::interval,
      NULL
    FROM generate_series(1, 50) g;

    -- 100 consolidados recientes (5 días) -> NO ELEGIBLES
    INSERT INTO public.campaign_events (campaign_id, merchant_id, event_type, timestamp, aggregated_at)
    SELECT 
      'a0000000-0000-0000-0000-000000000001'::uuid,
      'M-DOCKER-01',
      'impression',
      now() - interval '5 days' + (g || ' seconds')::interval,
      now() - interval '4 days'
    FROM generate_series(1, 100) g;
  `);

  const initialCount = parseInt(runPsql('SELECT count(*) FROM public.campaign_events;').split('\n')[2]);
  assert(initialCount === 500, `Seed debe tener 500 eventos, tiene ${initialCount}`);
  console.log(`Seed inicial verificado: 500 eventos.`);

  // PRUEBA 1: Dry run sin eliminación
  console.log('\n--- CASO 1: Dry run sin eliminación ---');
  const dryOut = runPsql(`SELECT public.purge_consolidated_campaign_events(true, 30, 5000)::text;`).split('\n')[2].trim();
  const dryJson = JSON.parse(dryOut);
  assert(dryJson.dry_run === true, 'dry_run debe ser true');
  assert(dryJson.eligible_count === 350, `eligible_count debe ser 350, dio ${dryJson.eligible_count}`);
  assert(dryJson.purged_count === 0, `purged_count debe ser 0 en dry run, dio ${dryJson.purged_count}`);
  const countAfterDry = parseInt(runPsql('SELECT count(*) FROM public.campaign_events;').split('\n')[2]);
  assert(countAfterDry === 500, 'Dry run no debe alterar tabla');
  passedTests++;
  console.log('[PASS] Caso 1: Dry run no eliminó registros e identificó 350 elegibles.');

  // PRUEBA 2: Conteo DIRECTO desde filas eliminadas por DELETE (p_limit = 200)
  console.log('\n--- CASO 2: Conteo real directo desde filas devueltas por DELETE (p_limit = 200) ---');
  const b1Out = runPsql(`SELECT public.purge_consolidated_campaign_events(false, 30, 200)::text;`).split('\n')[2].trim();
  const b1Json = JSON.parse(b1Out);
  assert(b1Json.dry_run === false, 'dry_run debe ser false');
  assert(b1Json.eligible_count === 200, `eligible_count debe ser 200`);
  assert(b1Json.purged_count === 200, `purged_count directo debe ser 200, dio ${b1Json.purged_count}`);
  const countAfterB1 = parseInt(runPsql('SELECT count(*) FROM public.campaign_events;').split('\n')[2]);
  assert(countAfterB1 === 300, `Conteo en tabla debe ser 300, dio ${countAfterB1}`);
  passedTests++;
  console.log('[PASS] Caso 2: purged_count medido directamente por DELETE sum(cnt) = 200.');

  // PRUEBA 3: Segundo lote remanente directo (150 eventos restantes)
  console.log('\n--- CASO 3: Segundo lote con conteo directo (150 restantes) ---');
  const b2Out = runPsql(`SELECT public.purge_consolidated_campaign_events(false, 30, 5000)::text;`).split('\n')[2].trim();
  const b2Json = JSON.parse(b2Out);
  assert(b2Json.eligible_count === 150, `eligible_count debe ser 150`);
  assert(b2Json.purged_count === 150, `purged_count debe ser 150`);
  const countAfterB2 = parseInt(runPsql('SELECT count(*) FROM public.campaign_events;').split('\n')[2]);
  assert(countAfterB2 === 150, `Conteo en tabla debe ser 150, dio ${countAfterB2}`);
  passedTests++;
  console.log('[PASS] Caso 3: Lote remanente medido directamente por DELETE = 150.');

  // PRUEBA 4: Conservación de eventos recientes
  console.log('\n--- CASO 4: Conservación de eventos recientes ---');
  const recentCount = parseInt(runPsql(`SELECT count(*) FROM public.campaign_events WHERE timestamp > now() - interval '30 days';`).split('\n')[2]);
  assert(recentCount === 100, `Debe conservar 100 recientes, hay ${recentCount}`);
  passedTests++;
  console.log('[PASS] Caso 4: 100 eventos recientes conservados.');

  // PRUEBA 5: Fallos de consolidación (impedir eliminación de no consolidados)
  console.log('\n--- CASO 5: Protección de eventos no consolidados ---');
  const unaggCount = parseInt(runPsql(`SELECT count(*) FROM public.campaign_events WHERE aggregated_at IS NULL;`).split('\n')[2]);
  assert(unaggCount === 50, `Debe conservar 50 no consolidados, hay ${unaggCount}`);
  passedTests++;
  console.log('[PASS] Caso 5: 50 eventos no consolidados conservados intactos.');

  // PRUEBA 6: Conservación de estadísticas en purge_ledger
  console.log('\n--- CASO 6: Auditoría en purge_ledger ---');
  const ledgerTotal = parseInt(runPsql(`SELECT sum(purged_count) FROM public.purge_ledger;`).split('\n')[2]);
  assert(ledgerTotal === 350, `purge_ledger debe registrar 350 eventos, registró ${ledgerTotal}`);
  passedTests++;
  console.log('[PASS] Caso 6: purge_ledger auditó con éxito los 350 eventos eliminados.');

  // PRUEBA 7: Autorización en el contexto exacto de pg_cron (usuario postgres / supabase_admin)
  console.log('\n--- CASO 7: Verificación de autorización con rol de pg_cron (postgres) ---');
  const cronAuthOut = runPsql(`
    SELECT public.purge_consolidated_campaign_events(true, 30, 5000)::text;
  `, 'postgres').split('\n')[2].trim();
  const cronAuthJson = JSON.parse(cronAuthOut);
  assert(cronAuthJson.dry_run === true, 'Ejecución bajo rol postgres autorizada');
  passedTests++;
  console.log('[PASS] Caso 7: Autorización bajo rol de pg_cron (postgres) confirmada.');

  // PRUEBA 8: Bloqueo contra concurrencia mediante Advisory Lock desde otra sesión
  console.log('\n--- CASO 8: Bloqueo de purgas concurrentes (Advisory Lock inter-sesión) ---');
  // Iniciar una sesión paralela que retiene el advisory lock
  const blocker = spawn('docker', ['exec', '-i', 'supabase_db_KioscoProX', 'psql', '-U', 'postgres', '-d', 'postgres'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  blocker.stdin.write('SELECT pg_advisory_lock(1845192842);\n');
  await new Promise(r => setTimeout(r, 600));

  // Ahora, en otra sesión, intentar correr purge_consolidated_campaign_events
  const concRes = execSync('docker exec -i supabase_db_KioscoProX psql -U postgres -d postgres -t -A -c "SELECT public.purge_consolidated_campaign_events(false, 30, 5000)::text;"', {
    encoding: 'utf8'
  }).trim();

  // Liberar el blocker
  blocker.stdin.write('SELECT pg_advisory_unlock(1845192842);\n\\q\n');
  blocker.stdin.end();

  const concJson = JSON.parse(concRes);
  assert(concJson.code === 'CONCURRENT_PURGE_IN_PROGRESS', `Debe retornar CONCURRENT_PURGE_IN_PROGRESS, dio ${concJson.code}`);
  assert(concJson.purged_count === 0, 'No debe purgar nada ante concurrencia');
  passedTests++;
  console.log('[PASS] Caso 8: Protección contra concurrencia confirmada (lock inter-sesión bloqueó ejecución paralela).');

  // PRUEBA 9: Idempotencia de migración pg_cron
  console.log('\n--- CASO 9: Aplicación e Idempotencia de migración pg_cron ---');
  runPsql(fs.readFileSync('supabase/migrations/20261111_schedule_daily_purge_cron.sql', 'utf8'));
  runPsql(fs.readFileSync('supabase/migrations/20261111_schedule_daily_purge_cron.sql', 'utf8'));
  const cronJobsCount = parseInt(runPsql(`SELECT count(*) FROM cron.job WHERE jobname = 'daily_purge_campaign_events';`).split('\n')[2]);
  assert(cronJobsCount === 1, `Debe haber exactamente 1 job de cron, hay ${cronJobsCount}`);
  passedTests++;
  console.log('[PASS] Caso 9: Programación pg_cron idempotente (1 solo job).');

  // PRUEBA 10: Ejecución limpia cuando no hay elegibles
  console.log('\n--- CASO 10: Ejecución limpia sin eventos elegibles ---');
  const emptyOut = runPsql(`SELECT public.purge_consolidated_campaign_events(false, 30, 5000)::text;`).split('\n')[2].trim();
  const emptyJson = JSON.parse(emptyOut);
  assert(emptyJson.eligible_count === 0, 'eligible_count debe ser 0');
  assert(emptyJson.purged_count === 0, 'purged_count debe ser 0');
  passedTests++;
  console.log('[PASS] Caso 10: Ejecución limpia con 0 elegibles.');

  // PRUEBA 11: Rechazo de retención inválida (< 30 días)
  console.log('\n--- CASO 11: Rechazo de retención menor a 30 días ---');
  let rejected = false;
  try {
    runPsql(`SELECT public.purge_consolidated_campaign_events(false, 15, 5000);`);
  } catch (e) {
    rejected = true;
  }
  assert(rejected === true, 'Debe rechazar p_retention_days < 30');
  passedTests++;
  console.log('[PASS] Caso 11: Rechazo exitoso de retención menor a 30 días.');

  console.log('\n========================================================================');
  console.log(`RESULTADO FINAL: ${passedTests}/${totalTests} PRUEBAS EXITOSAS (100% PASS)`);
  console.log('========================================================================');
}

main().catch(err => {
  console.error('\n❌ ERROR EN LA SUITE DE PRUEBAS:', err);
  process.exit(1);
});
