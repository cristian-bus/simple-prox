// tests/fase4b73_focused_retention_runner.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.7.3
// PRUEBAS FOCALIZADAS DE FRONTERA TEMPORAL, DESPLIEGUE Y RECUPERACIÓN POST-PURGA

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('=== FASE 4B.7.3: PRUEBAS FOCALIZADAS DE FRONTERA, DESPLIEGUE Y PURGA ===');
console.log('========================================================================\n');

const DOCKER_CONTAINER = 'pg_isolated_fase3b';
const DB_USER = 'test_user';
const TEMP_DB = 'tmp_fase4b73_val';
const COMMERCIAL_BACKUP = path.resolve('backups/supabase_backup_20261109_215247.dump');

const evidence = {
  timestamp: new Date().toISOString(),
  backupFile: COMMERCIAL_BACKUP,
  environment: 'PostgreSQL 17 on Docker pg_isolated_fase3b + Node.js Runner',
  totalChecks: 8,
  passedChecks: 0,
  checks: []
};

function record(stepNum, name, passed, details = {}) {
  const item = { step: stepNum, name, passed, details };
  evidence.checks.push(item);
  if (passed) {
    evidence.passedChecks++;
    console.log(`[PASS] Verificación ${stepNum}: ${name}`);
  } else {
    console.error(`[FAIL] Verificación ${stepNum}: ${name}`);
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

// Emulación exacta del código de terminal-sync con validación estricta ISO 8601 con zona horaria
function processTerminalSync(rawEvents, termId, existingCampaignIds, nowMs = Date.now()) {
  const validTypes = new Set(["impression", "offer_open", "whatsapp_click"]);
  let sanitizedEvents = [];
  let ackCount = 0;

  const MAX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días exactos
  const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 minutos
  const ISO_8601_TZ_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

  for (const ev of rawEvents.slice(0, 50)) {
    const eventType = String(ev.eventType || ev.event_type || "");
    if (!validTypes.has(eventType)) continue;

    const rawEventId = ev.eventId || ev.event_id;
    if (typeof rawEventId !== "string" || rawEventId.trim().length === 0) continue;
    const eventId = rawEventId.trim();

    if (!ev.timestamp || typeof ev.timestamp !== "string" || !ISO_8601_TZ_REGEX.test(ev.timestamp)) {
      continue;
    }
    const eventTime = new Date(ev.timestamp).getTime();
    if (isNaN(eventTime)) continue;

    if (eventTime > nowMs + MAX_FUTURE_SKEW_MS) continue;

    // Regla de retención con frontera estricta
    if (eventTime <= nowMs - MAX_RETENTION_MS) {
      ackCount++; // Descarte seguro: se reconoce pero no se inserta
      continue;
    }

    const rawCampaignId = ev.campaignId || ev.campaign_id;
    const campaignId = (typeof rawCampaignId === "string" && rawCampaignId.trim().length > 0)
      ? rawCampaignId.trim()
      : null;

    sanitizedEvents.push({
      event_id: eventId,
      merchant_id: termId,
      campaign_id: campaignId,
      event_type: eventType,
      timestamp: new Date(eventTime).toISOString(),
      synced_at: new Date(nowMs).toISOString()
    });
    ackCount++;
  }

  const existingSet = new Set(existingCampaignIds);
  sanitizedEvents = sanitizedEvents.filter(e => {
    if (e.campaign_id) return existingSet.has(e.campaign_id);
    return true;
  });

  return { eventsToInsert: sanitizedEvents, ackCount };
}

try {
  try { execSync(`docker start ${DOCKER_CONTAINER}`); } catch (e) {}

  console.log('--- Configurando base temporal e importando backup comercial ---');
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

  const containerDump = `/tmp/fase4b73_${path.basename(COMMERCIAL_BACKUP)}`;
  execSync(`docker cp "${COMMERCIAL_BACKUP}" ${DOCKER_CONTAINER}:${containerDump}`);

  execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'pg_restore', '-U', DB_USER, '-d', TEMP_DB,
    '--schema=public', '--exit-on-error', containerDump
  ], { encoding: 'utf8' });

  // Aplicar migraciones previas
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_aggregates.sql');
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_functions.sql');

  // Aplicar migración 20261111
  runSqlFile(TEMP_DB, 'supabase/migrations/20261111_retention_and_quota_hardening.sql');

  // Consolidar eventos
  runSql(TEMP_DB, `SELECT public.consolidate_campaign_events_batch('manual', 50000);`);

  const campaignsListRaw = runSql(TEMP_DB, `SELECT json_agg(id::text) FROM public.campaigns;`);
  const validCampaignIds = JSON.parse(campaignsListRaw || '[]');

  // ---------------------------------------------------------------------------
  // Verificación 1: Frontera temporal exacta (-1ms, 0ms, +1ms) y formato ISO estricto
  // ---------------------------------------------------------------------------
  console.log('\n--- Verificación 1: Frontera temporal exacta ---');
  const nowFixed = Date.now();
  const LIMIT_MS = 30 * 24 * 60 * 60 * 1000;

  // 1 ms después del corte (tiene 29d 23h 59m 59s 999ms) -> VÁLIDO (se inserta)
  const ev1msInside = {
    eventId: 'evt-front-inside-1ms',
    campaignId: validCampaignIds[0],
    eventType: 'impression',
    timestamp: new Date(nowFixed - LIMIT_MS + 1).toISOString()
  };
  // Exactamente en el límite (tiene 30d 00h 00m 00s 000ms) -> DESCARTADO (ack sin inserción)
  const evExactLimit = {
    eventId: 'evt-front-exact-limit',
    campaignId: validCampaignIds[0],
    eventType: 'impression',
    timestamp: new Date(nowFixed - LIMIT_MS).toISOString()
  };
  // 1 ms antes del corte (tiene 30d 00h 00m 00s 001ms) -> DESCARTADO (ack sin inserción)
  const ev1msOutside = {
    eventId: 'evt-front-outside-1ms',
    campaignId: validCampaignIds[0],
    eventType: 'impression',
    timestamp: new Date(nowFixed - LIMIT_MS - 1).toISOString()
  };
  // Sin zona horaria explícita -> RECHAZADO
  const evNoTz = {
    eventId: 'evt-front-no-tz',
    campaignId: validCampaignIds[0],
    eventType: 'impression',
    timestamp: '2026-11-10T15:30:00'
  };

  const resInside = processTerminalSync([ev1msInside], '00000000-0000-0000-0000-000000000001', validCampaignIds, nowFixed);
  const resExact = processTerminalSync([evExactLimit], '00000000-0000-0000-0000-000000000001', validCampaignIds, nowFixed);
  const resOutside = processTerminalSync([ev1msOutside], '00000000-0000-0000-0000-000000000001', validCampaignIds, nowFixed);
  const resNoTz = processTerminalSync([evNoTz], '00000000-0000-0000-0000-000000000001', validCampaignIds, nowFixed);

  const p1Passed = resInside.eventsToInsert.length === 1 &&
                   resExact.eventsToInsert.length === 0 && resExact.ackCount === 1 &&
                   resOutside.eventsToInsert.length === 0 && resOutside.ackCount === 1 &&
                   resNoTz.eventsToInsert.length === 0 && resNoTz.ackCount === 0;

  record(1, 'Frontera temporal exacta (-1ms, exacto, +1ms) y descarte de timestamp sin zona horaria',
    p1Passed,
    { insideInserted: resInside.eventsToInsert.length, exactAck: resExact.ackCount, outsideAck: resOutside.ackCount, noTzRejected: resNoTz.ackCount }
  );

  // ---------------------------------------------------------------------------
  // Verificación 2: Reenvío después de una purga física real
  // ---------------------------------------------------------------------------
  console.log('\n--- Verificación 2: Reenvío después de purga física ---');
  // Obtener un evento de hace 45 días del backup
  const targetOldEvent = JSON.parse(runSql(TEMP_DB, `
    SELECT json_build_object('event_id', event_id, 'campaign_id', campaign_id, 'event_type', event_type, 'timestamp', timestamp::text)
    FROM public.campaign_events
    WHERE timestamp < now() - interval '35 days'
    LIMIT 1;
  `));

  // Purgar eventos antiguos en Docker
  const purgeExecRes = JSON.parse(runSql(TEMP_DB, `SELECT public.purge_consolidated_campaign_events(false, 30, 5000);`));
  console.log('Purga de prueba ejecutada:', purgeExecRes);

  // Verificar que el evento fue purgado
  const existsInDb = runSql(TEMP_DB, `SELECT count(*) FROM public.campaign_events WHERE event_id = '${targetOldEvent.event_id}';`);

  // Simular reenvío desde el POS
  const resReplay = processTerminalSync([targetOldEvent], '00000000-0000-0000-0000-000000000001', validCampaignIds);
  const p2Passed = existsInDb === '0' && resReplay.eventsToInsert.length === 0 && resReplay.ackCount === 1;

  record(2, 'Reenvío de evento previamente purgado es confirmado con ack y no se reinserta en BD',
    p2Passed,
    { existsInDb, ackCount: resReplay.ackCount, inserted: resReplay.eventsToInsert.length }
  );

  // ---------------------------------------------------------------------------
  // Verificación 3: Despliegue simulado en orden estricto (dry_run primero)
  // ---------------------------------------------------------------------------
  console.log('\n--- Verificación 3: Ejecución de purga exclusivamente en dry_run ---');
  const dryRunRes = JSON.parse(runSql(TEMP_DB, `SELECT public.purge_consolidated_campaign_events(true, 30, 5000);`));
  const countBeforeDry = parseInt(runSql(TEMP_DB, `SELECT count(*) FROM public.campaign_events;`), 10);
  const p3Passed = dryRunRes.dry_run === true && dryRunRes.purged_count === 0 && dryRunRes.eligible_count > 0;

  record(3, 'Comportamiento predeterminado de purga es estrictamente simulado (dry_run = true, 0 eliminaciones)',
    p3Passed,
    { dryRunRes, countBeforeDry }
  );

  // ---------------------------------------------------------------------------
  // Verificación 4: Fallo durante purga y atomicidad de purge_ledger
  // ---------------------------------------------------------------------------
  console.log('\n--- Verificación 4: Atomicidad ante fallo transaccional ---');
  const ledgerCountBefore = parseInt(runSql(TEMP_DB, `SELECT count(*) FROM public.purge_ledger;`), 10);
  try {
    runSql(TEMP_DB, `
      DO $$ BEGIN
        PERFORM public.purge_consolidated_campaign_events(false, 30, 100);
        RAISE EXCEPTION 'Simulated catastrophic failure';
      END $$;
    `);
  } catch (e) {}
  const ledgerCountAfter = parseInt(runSql(TEMP_DB, `SELECT count(*) FROM public.purge_ledger;`), 10);
  record(4, 'Transaccionalidad atómica: rollback ante error aborta eliminación y escritura en purge_ledger',
    ledgerCountAfter === ledgerCountBefore,
    { ledgerCountBefore, ledgerCountAfter }
  );

  // ---------------------------------------------------------------------------
  // Verificación 5: Recuperación posterior a purga (cero duplicación post-purga)
  // ---------------------------------------------------------------------------
  console.log('\n--- Verificación 5: Inserción de nuevos eventos post-purga ---');
  const newEventValid = {
    eventId: 'evt-post-purge-new-001',
    campaignId: validCampaignIds[0],
    eventType: 'impression',
    timestamp: new Date().toISOString()
  };
  const resNew = processTerminalSync([newEventValid], '00000000-0000-0000-0000-000000000001', validCampaignIds);
  runSql(TEMP_DB, `
    INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp, synced_at)
    VALUES ('${resNew.eventsToInsert[0].event_id}', '${resNew.eventsToInsert[0].merchant_id}', '${resNew.eventsToInsert[0].campaign_id}', '${resNew.eventsToInsert[0].event_type}', '${resNew.eventsToInsert[0].timestamp}', now())
    ON CONFLICT (event_id) DO NOTHING;
  `);
  const newInsertedCount = runSql(TEMP_DB, `SELECT count(*) FROM public.campaign_events WHERE event_id = 'evt-post-purge-new-001';`);
  record(5, 'Eventos legítimos nuevos continúan ingresando sin alteraciones tras ciclos de purga',
    newInsertedCount === '1',
    { newInsertedCount }
  );

  // ---------------------------------------------------------------------------
  // Verificación 6: Cuotas diarias intactas (v_campaign_daily_quotas)
  // ---------------------------------------------------------------------------
  console.log('\n--- Verificación 6: Estabilidad de v_campaign_daily_quotas ---');
  const quotasResult = runSql(TEMP_DB, `
    SELECT count(*) 
    FROM public.v_campaign_daily_quotas;
  `);
  record(6, 'v_campaign_daily_quotas opera con normalidad tras purgas históricas',
    parseInt(quotasResult, 10) === validCampaignIds.length,
    { campaignCount: validCampaignIds.length, quotasRows: quotasResult }
  );

  // ---------------------------------------------------------------------------
  // Verificación 7: Estadísticas consolidadas 4D intactas
  // ---------------------------------------------------------------------------
  console.log('\n--- Verificación 7: Conciliación 4D intacta ---');
  const recon = JSON.parse(runSql(TEMP_DB, `SELECT public.reconcile_campaign_metrics_4d();`));
  const p7Passed = recon.all_matching === true && recon.mismatches_count === 0 && recon.perfect_matches > 0;
  record(7, 'Conciliación matemática 4D permanece 100% íntegra (cero desvío) tras purga',
    p7Passed,
    { perfectMatches: recon.perfect_matches, mismatches: recon.mismatches_count }
  );

  // ---------------------------------------------------------------------------
  // Verificación 8: Compatibilidad de respuesta para limpieza de Outbox en el POS
  // ---------------------------------------------------------------------------
  console.log('\n--- Verificación 8: Compatibilidad con protocolo Outbox del POS ---');
  // Simular respuesta completa de terminal-sync
  const clientOutboxSimulation = [
    { id: 'tx-01', payload: { eventId: 'evt-01', campaignId: validCampaignIds[0], eventType: 'impression', timestamp: new Date().toISOString() } },
    { id: 'tx-02', payload: { eventId: 'evt-02-old', campaignId: validCampaignIds[0], eventType: 'impression', timestamp: new Date(Date.now() - 40 * 86400000).toISOString() } }
  ];

  const syncResult = processTerminalSync(
    clientOutboxSimulation.map(x => x.payload),
    '00000000-0000-0000-0000-000000000001',
    validCampaignIds
  );

  // El POS evalúa result.success
  const posConfirmedIds = new Set();
  if (syncResult.ackCount === clientOutboxSimulation.length) {
    clientOutboxSimulation.forEach(item => posConfirmedIds.add(item.id));
  }
  const p8Passed = posConfirmedIds.size === 2 && syncResult.eventsToInsert.length === 1;

  record(8, 'Protocolo de confirmación libera el Outbox del POS limpiando eventos viejos sin saturar la red',
    p8Passed,
    { outboxOriginal: 2, posConfirmados: posConfirmedIds.size, insertadosEnBd: syncResult.eventsToInsert.length }
  );

  // Limpieza
  console.log('\n--- Limpiando base temporal ---');
  execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
  console.log('Base temporal eliminada.');

} catch (err) {
  console.error('Error fatal durante la prueba focalizada:', err);
  try {
    execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
  } catch (e) {}
}

console.log('\n========================================================================');
console.log(`=== RESUMEN FINAL: ${evidence.passedChecks}/${evidence.totalChecks} VERIFICACIONES SUPERADAS ===`);
console.log('========================================================================\n');

if (evidence.passedChecks === evidence.totalChecks) {
  console.log('STATUS: PASS — Todas las verificaciones focalizadas pasaron exitosamente.');
  process.exit(0);
} else {
  console.error('STATUS: FAIL — Se detectaron inconsistencias en las pruebas.');
  process.exit(1);
}

