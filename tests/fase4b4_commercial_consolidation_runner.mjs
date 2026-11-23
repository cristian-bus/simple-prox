// tests/fase4b4_commercial_consolidation_runner.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.4
// VALIDACION EXHAUSTIVA DE MIGRACIONES DE ESTADISTICAS CON TIPOS UUID SOBRE BACKUP COMERCIAL REAL

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('=== FASE 4B.4: VALIDACION DE TIPOS UUID Y CONSOLIDACION COMERCIAL REAL ===');
console.log('========================================================================\n');

const DOCKER_CONTAINER = 'pg_isolated_fase3b';
const DB_USER = 'test_user';
const TEMP_DB = 'tmp_fase4b4_commercial_val';
const COMMERCIAL_BACKUP = path.resolve('backups/supabase_backup_20261109_215247.dump');

const evidence = {
  timestamp: new Date().toISOString(),
  backupFile: COMMERCIAL_BACKUP,
  environment: 'PostgreSQL 17.11 on Alpine Linux (Docker pg_isolated_fase3b)',
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
  // 1. Preparación de Base Efímera y Restauración del Backup Comercial
  // ---------------------------------------------------------------------------
  console.log('--- Inicializando entorno aislado y restaurando backup comercial ---');
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

  const containerDump = `/tmp/fase4b4_${path.basename(COMMERCIAL_BACKUP)}`;
  execSync(`docker cp "${COMMERCIAL_BACKUP}" ${DOCKER_CONTAINER}:${containerDump}`);

  execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'pg_restore', '-U', DB_USER, '-d', TEMP_DB,
    '--schema=public', '--exit-on-error', containerDump
  ], { encoding: 'utf8' });

  execSync(`docker exec ${DOCKER_CONTAINER} rm -f ${containerDump}`);

  // Línea base real
  const rawCountBefore = parseInt(runSql(TEMP_DB, "SELECT count(*) FROM public.campaign_events;"), 10);
  const rawImpressionsBefore = parseInt(runSql(TEMP_DB, "SELECT count(*) FROM public.campaign_events WHERE event_type = 'impression';"), 10);
  const rawOfferOpensBefore = parseInt(runSql(TEMP_DB, "SELECT count(*) FROM public.campaign_events WHERE event_type = 'offer_open';"), 10);
  const rawWhatsappClicksBefore = parseInt(runSql(TEMP_DB, "SELECT count(*) FROM public.campaign_events WHERE event_type = 'whatsapp_click';"), 10);

  console.log(`Línea base confirmada: ${rawCountBefore} eventos (${rawImpressionsBefore} impresiones, ${rawOfferOpensBefore} aperturas, ${rawWhatsappClicksBefore} clics whatsapp)\n`);

  // ---------------------------------------------------------------------------
  // 2. Aplicar Migraciones Corregidas con Tipos UUID
  // ---------------------------------------------------------------------------
  console.log('--- Aplicando migraciones corregidas (DDL + PL/pgSQL) ---');
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_aggregates.sql');
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_functions.sql');
  console.log('Migraciones aplicadas con exito (DDL y funciones compiladas).\n');

  // ---------------------------------------------------------------------------
  // PRUEBA 1: Conservación de Todos los Eventos Originales (No DELETE)
  // ---------------------------------------------------------------------------
  const rawCountAfterDdl = parseInt(runSql(TEMP_DB, "SELECT count(*) FROM public.campaign_events;"), 10);
  record(1, 'Conservacion de todos los eventos originales tras aplicar DDL (9.787)',
    rawCountAfterDdl === 9787,
    { rawCountBefore, rawCountAfterDdl }
  );

  // ---------------------------------------------------------------------------
  // PRUEBA 2: Backfill / Consolidación de los 9.787 Eventos Comerciales
  // ---------------------------------------------------------------------------
  console.log('\n--- Ejecutando consolidacion de eventos comerciales ---');
  const consolidateResRaw = runSql(TEMP_DB, "SELECT public.consolidate_campaign_events_batch('fase4b4-validator', 50000);");
  const consolidateRes = JSON.parse(consolidateResRaw);

  const pendingAfter = parseInt(runSql(TEMP_DB, "SELECT count(*) FROM public.campaign_events WHERE aggregated_at IS NULL;"), 10);
  const aggregatedAfter = parseInt(runSql(TEMP_DB, "SELECT count(*) FROM public.campaign_events WHERE aggregated_at IS NOT NULL;"), 10);

  record(2, 'Backfill exitoso: 9.787 procesados, 0 pendientes, todos marcados aggregated_at',
    consolidateRes.success === true && consolidateRes.processed === 9787 && pendingAfter === 0 && aggregatedAfter === 9787,
    { consolidateResult: consolidateRes, pendingAfter, aggregatedAfter }
  );

  // ---------------------------------------------------------------------------
  // PRUEBA 3: Total de Impresiones Conservado
  // ---------------------------------------------------------------------------
  const aggImpressions = parseInt(runSql(TEMP_DB, "SELECT coalesce(sum(event_count), 0) FROM public.campaign_daily_aggregates WHERE event_type = 'impression';"), 10);
  record(3, `Total de impresiones conservado con exactitud matematica (${rawImpressionsBefore})`,
    aggImpressions === rawImpressionsBefore,
    { rawImpressionsBefore, aggImpressions }
  );

  // ---------------------------------------------------------------------------
  // PRUEBA 4: Total de Clics y Aperturas Conservado (offer_open + whatsapp_click)
  // ---------------------------------------------------------------------------
  const aggOfferOpens = parseInt(runSql(TEMP_DB, "SELECT coalesce(sum(event_count), 0) FROM public.campaign_daily_aggregates WHERE event_type = 'offer_open';"), 10);
  const aggWhatsappClicks = parseInt(runSql(TEMP_DB, "SELECT coalesce(sum(event_count), 0) FROM public.campaign_daily_aggregates WHERE event_type = 'whatsapp_click';"), 10);
  const clicksMatch = aggOfferOpens === rawOfferOpensBefore && aggWhatsappClicks === rawWhatsappClicksBefore;

  record(4, `Total de interacciones y clics conservado (aperturas: ${rawOfferOpensBefore}, clics: ${rawWhatsappClicksBefore})`,
    clicksMatch,
    { rawOfferOpensBefore, aggOfferOpens, rawWhatsappClicksBefore, aggWhatsappClicks }
  );

  // ---------------------------------------------------------------------------
  // PRUEBA 5: Agrupación 4D y Conciliación Estricta FULL OUTER JOIN (Cero Discrepancias)
  // ---------------------------------------------------------------------------
  console.log('\n--- Ejecutando conciliacion estricta FULL OUTER JOIN ---');
  const reconSql = `
    WITH raw AS (
      SELECT 
        campaign_id, 
        (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS event_date, 
        event_type, 
        merchant_id, 
        count(*)::bigint AS raw_count
      FROM public.campaign_events
      WHERE campaign_id IS NOT NULL
      GROUP BY 1, 2, 3, 4
    ),
    agg AS (
      SELECT 
        campaign_id, 
        event_date, 
        event_type, 
        merchant_id, 
        event_count::bigint AS agg_count
      FROM public.campaign_daily_aggregates
    )
    SELECT 
      COALESCE(raw.campaign_id, agg.campaign_id) AS campaign_id,
      COALESCE(raw.event_date, agg.event_date) AS event_date,
      COALESCE(raw.event_type, agg.event_type) AS event_type,
      COALESCE(raw.merchant_id, agg.merchant_id) AS merchant_id,
      raw.raw_count,
      agg.agg_count,
      CASE
        WHEN raw.raw_count IS NULL THEN 'MISSING_IN_RAW'
        WHEN agg.agg_count IS NULL THEN 'MISSING_IN_AGG'
        WHEN raw.raw_count != agg.agg_count THEN 'COUNT_MISMATCH'
        ELSE 'MATCH'
      END AS status
    FROM raw
    FULL OUTER JOIN agg ON (
      raw.campaign_id = agg.campaign_id
      AND raw.event_date = agg.event_date
      AND raw.event_type = agg.event_type
      AND raw.merchant_id = agg.merchant_id
    )
    WHERE raw.raw_count IS NULL OR agg.agg_count IS NULL OR raw.raw_count != agg.agg_count;
  `;
  const reconMismatches = runSql(TEMP_DB, reconSql);
  const totalBuckets = parseInt(runSql(TEMP_DB, "SELECT count(*) FROM public.campaign_daily_aggregates;"), 10);
  const totalSumAgg = parseInt(runSql(TEMP_DB, "SELECT sum(event_count) FROM public.campaign_daily_aggregates;"), 10);

  record(5, 'Conciliacion FULL OUTER JOIN: Cero discrepancias, 100% de buckets coinciden',
    reconMismatches === '' && totalSumAgg === 9787,
    {
      mismatchesCount: reconMismatches === '' ? 0 : reconMismatches.split('\n').length,
      totalBuckets,
      totalSumAgg,
      expected: 9787
    }
  );

  // ---------------------------------------------------------------------------
  // PRUEBA 6: Ausencia de Duplicaciones y Ejecución Repetida Idempotente
  // ---------------------------------------------------------------------------
  console.log('\n--- Ejecutando segunda pasada de consolidacion para validar idempotencia ---');
  const secondConsolidateRaw = runSql(TEMP_DB, "SELECT public.consolidate_campaign_events_batch('fase4b4-validator', 50000);");
  const secondConsolidate = JSON.parse(secondConsolidateRaw);
  const totalSumAfterRepeat = parseInt(runSql(TEMP_DB, "SELECT sum(event_count) FROM public.campaign_daily_aggregates;"), 10);

  record(6, 'Idempotencia: Ejecucion repetida no duplica estadisticas (procesados: 0, total 9.787)',
    secondConsolidate.processed === 0 && secondConsolidate.message === 'NO_PENDING_EVENTS' && totalSumAfterRepeat === 9787,
    { secondRun: secondConsolidate, totalSumAfterRepeat }
  );

  // ---------------------------------------------------------------------------
  // PRUEBA 7: Eventos con campaign_id NULL
  // ---------------------------------------------------------------------------
  const nullCampaignEvents = parseInt(runSql(TEMP_DB, "SELECT count(*) FROM public.campaign_events WHERE campaign_id IS NULL;"), 10);
  record(7, 'Comprobacion de eventos con campaign_id NULL (total detectado: 0)',
    nullCampaignEvents === 0,
    { nullCampaignEvents }
  );

  // ---------------------------------------------------------------------------
  // PRUEBA 8: Eventos Tardíos (Arrival Skew) y Vistas Unificadas
  // ---------------------------------------------------------------------------
  console.log('\n--- Simulando llegada de evento tardio y validando vista unificada ---');
  const sampleCampaign = runSql(TEMP_DB, "SELECT campaign_id FROM public.campaign_events LIMIT 1;");
  const sampleMerchant = runSql(TEMP_DB, "SELECT merchant_id FROM public.campaign_events LIMIT 1;");

  // Insertar evento crudo pendiente con fecha de hace 5 días
  runSql(TEMP_DB, `
    INSERT INTO public.campaign_events (merchant_id, campaign_id, event_type, timestamp, aggregated_at)
    VALUES ('${sampleMerchant}', '${sampleCampaign}', 'impression', now() - interval '5 days', NULL);
  `);

  // La vista combinada debe reflejar inmediatamente rawImpressionsBefore + 1 impresiones sin duplicar
  const viewImpCount = parseInt(runSql(TEMP_DB, "SELECT sum(total_count) FROM public.v_campaign_totals WHERE event_type = 'impression';"), 10);
  
  // Consolidar el evento tardío
  const lateConsolidateRaw = runSql(TEMP_DB, "SELECT public.consolidate_campaign_events_batch('late-worker', 100);");
  const lateConsolidate = JSON.parse(lateConsolidateRaw);
  const viewImpCountAfterConsolidate = parseInt(runSql(TEMP_DB, "SELECT sum(total_count) FROM public.v_campaign_totals WHERE event_type = 'impression';"), 10);

  const expectedLateTotal = rawImpressionsBefore + 1;
  record(8, 'Eventos tardios: Vista unificada computa pendiente y consolidado sin duplicar',
    viewImpCount === expectedLateTotal && lateConsolidate.processed === 1 && viewImpCountAfterConsolidate === expectedLateTotal,
    { expectedLateTotal, viewImpBeforeConsolidate: viewImpCount, lateConsolidate, viewImpAfterConsolidate: viewImpCountAfterConsolidate }
  );

  // ---------------------------------------------------------------------------
  // PRUEBA 9: Compatibilidad con Cuotas Diarias (v_campaign_daily_quotas)
  // ---------------------------------------------------------------------------
  console.log('\n--- Verificando cuotas diarias existentes ---');
  const quotasCount = parseInt(runSql(TEMP_DB, "SELECT count(*) FROM public.v_campaign_daily_quotas;"), 10);
  record(9, 'Cuotas diarias: v_campaign_daily_quotas opera sin conflictos',
    !isNaN(quotasCount) && quotasCount >= 0,
    { quotasRows: quotasCount }
  );

  // ---------------------------------------------------------------------------
  // PRUEBA 10: Integridad de Índices, RLS y Políticas
  // ---------------------------------------------------------------------------
  console.log('\n--- Auditando RLS y politicas de seguridad ---');
  const rlsEvents = runSql(TEMP_DB, "SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'campaign_events';") === 't';
  const rlsAggs = runSql(TEMP_DB, "SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'campaign_daily_aggregates';") === 't';
  const rlsLedger = runSql(TEMP_DB, "SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'purge_ledger';") === 't';
  const rlsAudit = runSql(TEMP_DB, "SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'consolidation_audit_log';") === 't';

  const policiesSql = "SELECT policyname FROM pg_policies WHERE tablename = 'campaign_events' ORDER BY policyname;";
  const policiesList = runSql(TEMP_DB, policiesSql).split('\n').map(p => p.trim());
  const hasExpectedPolicies = policiesList.includes('campaign_events_admin_select') && policiesList.includes('campaign_events_service_role');

  record(10, 'Seguridad: RLS activo en todas las tablas y politicas definitivas configuradas',
    rlsEvents && rlsAggs && rlsLedger && rlsAudit && hasExpectedPolicies,
    { rlsEvents, rlsAggs, rlsLedger, rlsAudit, policies: policiesList }
  );

} catch (err) {
  console.error('\n[ERROR FATAL]', err);
  record(99, 'Ejecucion global sin errores', false, { error: err.message });
} finally {
  // ---------------------------------------------------------------------------
  // LIMPIEZA OBLIGATORIA: Destruir base temporal efímera
  // ---------------------------------------------------------------------------
  console.log('\n--- Destruyendo base temporal efimera ---');
  try {
    execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
    console.log(`Base temporal '${TEMP_DB}' eliminada.`);
  } catch (e) {
    console.error('Error al limpiar base temporal:', e.message);
  }
}

// ---------------------------------------------------------------------------
// RESUMEN Y GUARDADO DE EVIDENCIA
// ---------------------------------------------------------------------------
const allPassed = evidence.passedChecks === evidence.totalChecks;
evidence.allPassed = allPassed;

const evidencePath = path.resolve('tests/fase4b4_commercial_consolidation_evidence.json');
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');

console.log('\n========================================================================');
console.log(`=== RESULTADO FINAL FASE 4B.4: ${evidence.passedChecks}/${evidence.totalChecks} PRUEBAS PASARON (${allPassed ? '100% EXITO' : 'FALLOS DETECTADOS'}) ===`);
console.log(`Evidencia persistida en: ${evidencePath}`);
console.log('========================================================================\n');

if (!allPassed) {
  process.exit(1);
}
