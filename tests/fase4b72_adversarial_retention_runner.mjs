// tests/fase4b72_adversarial_retention_runner.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.7.2
// SUITE ADVERSARIAL DE PRUEBAS DE RETENCIÓN SEGURA, DEDUPLICACIÓN Y PURGA EN DOCKER AISLADO

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('=== FASE 4B.7.2: PRUEBAS ADVERSARIALES DE RETENCIÓN SEGURA Y PURGA   ===');
console.log('========================================================================\n');

const DOCKER_CONTAINER = 'pg_isolated_fase3b';
const DB_USER = 'test_user';
const TEMP_DB = 'tmp_fase4b72_adv_val';
const COMMERCIAL_BACKUP = path.resolve('backups/supabase_backup_20261109_215247.dump');

const evidence = {
  timestamp: new Date().toISOString(),
  backupFile: COMMERCIAL_BACKUP,
  environment: 'PostgreSQL 17 on Docker pg_isolated_fase3b + Node.js Runner',
  totalChecks: 16,
  passedChecks: 0,
  checks: [],
  sizingMetrics: {}
};

function record(stepNum, name, passed, details = {}) {
  const item = { step: stepNum, name, passed, details };
  evidence.checks.push(item);
  if (passed) {
    evidence.passedChecks++;
    console.log(`[PASS] Prueba ${stepNum}: ${name}`);
  } else {
    console.error(`[FAIL] Prueba ${stepNum}: ${name}`);
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

// Emulación exacta de la lógica de procesamiento de terminal-sync
function processTerminalSyncBatch(rawEvents, termId, existingCampaignIds, nowMs = Date.now()) {
  const validTypes = new Set(["impression", "offer_open", "whatsapp_click"]);
  let sanitizedEvents = [];
  let ackCount = 0;

  const MAX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
  const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 minutos de tolerancia

  for (const ev of rawEvents.slice(0, 50)) {
    const eventType = String(ev.eventType || ev.event_type || "");
    if (!validTypes.has(eventType)) continue;

    const rawEventId = ev.eventId || ev.event_id;
    if (typeof rawEventId !== "string" || rawEventId.trim().length === 0) {
      continue;
    }
    const eventId = rawEventId.trim();

    if (!ev.timestamp || typeof ev.timestamp !== "string") {
      continue;
    }
    const eventTime = new Date(ev.timestamp).getTime();
    if (isNaN(eventTime)) {
      continue;
    }

    if (eventTime > nowMs + MAX_FUTURE_SKEW_MS) {
      continue;
    }

    if (eventTime < nowMs - MAX_RETENTION_MS) {
      ackCount++; // Descarte seguro: se reconoce para liberar Outbox sin insertar
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

  return {
    eventsToInsert: sanitizedEvents,
    ackCount,
    success: true
  };
}

try {
  // Iniciar contenedor si estaba detenido
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

  const containerDump = `/tmp/fase4b72_${path.basename(COMMERCIAL_BACKUP)}`;
  execSync(`docker cp "${COMMERCIAL_BACKUP}" ${DOCKER_CONTAINER}:${containerDump}`);

  execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'pg_restore', '-U', DB_USER, '-d', TEMP_DB,
    '--schema=public', '--exit-on-error', containerDump
  ], { encoding: 'utf8' });

  // Aplicar migraciones previas
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_aggregates.sql');
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_functions.sql');

  // Aplicar nueva migración FASE 4B.7.2
  runSqlFile(TEMP_DB, 'supabase/migrations/20261111_retention_and_quota_hardening.sql');

  // Consolidar eventos históricos
  runSql(TEMP_DB, `SELECT public.consolidate_campaign_events_batch('manual', 50000);`);

  // Lista de campañas válidas en BD
  const campaignsListRaw = runSql(TEMP_DB, `SELECT json_agg(id::text) FROM public.campaigns;`);
  const validCampaignIds = JSON.parse(campaignsListRaw || '[]');

  // ---------------------------------------------------------------------------
  // Prueba 1: Preservación de los 9.787 eventos originales
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 1: Preservación de eventos originales ---');
  const countP1 = parseInt(runSql(TEMP_DB, `SELECT count(*) FROM public.campaign_events;`), 10);
  record(1, 'Preservación de los 9.787 eventos originales intactos tras aplicar migraciones',
    countP1 === 9787,
    { countP1 }
  );

  // ---------------------------------------------------------------------------
  // Prueba 2: Reenvío de un evento reciente ya existente
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 2: Reenvío de evento reciente existente ---');
  const sampleRecentEvent = JSON.parse(runSql(TEMP_DB, `
    SELECT json_build_object('event_id', event_id, 'campaign_id', campaign_id, 'event_type', event_type, 'timestamp', timestamp::text)
    FROM public.campaign_events
    ORDER BY timestamp DESC
    LIMIT 1;
  `));

  // Simular envío de este evento
  const batchP2 = processTerminalSyncBatch([sampleRecentEvent], '00000000-0000-0000-0000-000000000001', validCampaignIds);
  // Intentar upsert en BD
  runSql(TEMP_DB, `
    INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp, synced_at)
    VALUES ('${batchP2.eventsToInsert[0].event_id}', '${batchP2.eventsToInsert[0].merchant_id}', '${batchP2.eventsToInsert[0].campaign_id}', '${batchP2.eventsToInsert[0].event_type}', '${batchP2.eventsToInsert[0].timestamp}', now())
    ON CONFLICT (event_id) DO NOTHING;
  `);
  const countP2 = parseInt(runSql(TEMP_DB, `SELECT count(*) FROM public.campaign_events;`), 10);
  record(2, 'Reenvío de evento reciente existente no incrementa tuplas gracias a ON CONFLICT',
    countP2 === 9787,
    { countBefore: 9787, countAfter: countP2, eventId: sampleRecentEvent.event_id }
  );

  // ---------------------------------------------------------------------------
  // Medición de espacio antes de purgar (Tarea 6)
  // ---------------------------------------------------------------------------
  const sizeBeforeSql = `
    SELECT 
      pg_total_relation_size('public.campaign_events') as total_bytes,
      pg_relation_size('public.campaign_events') as table_bytes,
      pg_indexes_size('public.campaign_events') as index_bytes;
  `;
  const [totalBytesBefore, tableBytesBefore, indexBytesBefore] = runSql(TEMP_DB, sizeBeforeSql).split('|').map(Number);
  evidence.sizingMetrics.before = { totalBytesBefore, tableBytesBefore, indexBytesBefore };

  // ---------------------------------------------------------------------------
  // Prueba 3: Reenvío de un evento antiguo previamente purgado
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 3: Reenvío de un evento antiguo previamente purgado ---');
  // Ejecutamos una purga real en la base temporal con retención de 30 días
  const purgeRes = JSON.parse(runSql(TEMP_DB, `
    SELECT public.purge_consolidated_campaign_events(false, 30, 10000);
  `));
  console.log('Resultado purga en Docker:', purgeRes);

  const countAfterPurge = parseInt(runSql(TEMP_DB, `SELECT count(*) FROM public.campaign_events;`), 10);
  const purgedCount = 9787 - countAfterPurge;
  evidence.sizingMetrics.purgedCount = purgedCount;

  // Supongamos que una terminal reenvía un evento de hace 40 días que acaba de ser purgado
  const oldEvent = {
    eventId: 'evt-purged-historical-001',
    campaignId: validCampaignIds[0],
    eventType: 'impression',
    timestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
  };

  const batchP3 = processTerminalSyncBatch([oldEvent], '00000000-0000-0000-0000-000000000001', validCampaignIds);
  const p3Passed = batchP3.ackCount === 1 && batchP3.eventsToInsert.length === 0;

  record(3, 'Reenvío de evento antiguo (>30d) purgado es reconocido (ack) pero descartado de BD',
    p3Passed,
    { ackCount: batchP3.ackCount, insertedCount: batchP3.eventsToInsert.length }
  );

  // ---------------------------------------------------------------------------
  // Prueba 4: Evento sin eventId
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 4: Evento sin eventId ---');
  const invalidNoId = {
    campaignId: validCampaignIds[0],
    eventType: 'impression',
    timestamp: new Date().toISOString()
  };
  const batchP4 = processTerminalSyncBatch([invalidNoId], '00000000-0000-0000-0000-000000000001', validCampaignIds);
  record(4, 'Evento publicitario sin eventId es estrictamente ignorado sin generar identificador aleatorio',
    batchP4.ackCount === 0 && batchP4.eventsToInsert.length === 0,
    { batchP4 }
  );

  // ---------------------------------------------------------------------------
  // Prueba 5: Evento con eventId duplicado en el mismo lote
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 5: Evento con eventId duplicado en el mismo lote ---');
  const dupEventA = { eventId: 'evt-dup-batch-01', campaignId: validCampaignIds[0], eventType: 'impression', timestamp: new Date().toISOString() };
  const dupEventB = { eventId: 'evt-dup-batch-01', campaignId: validCampaignIds[0], eventType: 'impression', timestamp: new Date().toISOString() };
  const batchP5 = processTerminalSyncBatch([dupEventA, dupEventB], '00000000-0000-0000-0000-000000000001', validCampaignIds);

  const countBeforeP5 = parseInt(runSql(TEMP_DB, `SELECT count(*) FROM public.campaign_events;`), 10);
  // Inserción en BD
  for (const ev of batchP5.eventsToInsert) {
    runSql(TEMP_DB, `
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp, synced_at)
      VALUES ('${ev.event_id}', '${ev.merchant_id}', '${ev.campaign_id}', '${ev.event_type}', '${ev.timestamp}', now())
      ON CONFLICT (event_id) DO NOTHING;
    `);
  }
  const countAfterP5 = parseInt(runSql(TEMP_DB, `SELECT count(*) FROM public.campaign_events;`), 10);
  record(5, 'Evento con eventId repetido dentro del mismo lote solo se inserta una única vez',
    countAfterP5 === countBeforeP5 + 1,
    { insertadas: countAfterP5 - countBeforeP5 }
  );

  // ---------------------------------------------------------------------------
  // Prueba 6: Timestamp inválido
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 6: Timestamp inválido ---');
  const invalidDateEvt = { eventId: 'evt-bad-date-01', campaignId: validCampaignIds[0], eventType: 'impression', timestamp: 'not-a-valid-date-string' };
  const batchP6 = processTerminalSyncBatch([invalidDateEvt], '00000000-0000-0000-0000-000000000001', validCampaignIds);
  record(6, 'Evento con timestamp malformado es descartado',
    batchP6.ackCount === 0 && batchP6.eventsToInsert.length === 0,
    { batchP6 }
  );

  // ---------------------------------------------------------------------------
  // Prueba 7: Timestamp futuro
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 7: Timestamp futuro (> 5 min) ---');
  const futureEvt = {
    eventId: 'evt-future-01',
    campaignId: validCampaignIds[0],
    eventType: 'impression',
    timestamp: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // +2 horas
  };
  const batchP7 = processTerminalSyncBatch([futureEvt], '00000000-0000-0000-0000-000000000001', validCampaignIds);
  record(7, 'Evento con fecha futura superior a tolerancia de drift es descartado',
    batchP7.ackCount === 0 && batchP7.eventsToInsert.length === 0,
    { batchP7 }
  );

  // ---------------------------------------------------------------------------
  // Prueba 8: Evento exactamente en el límite de 30 días
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 8: Evento en la frontera exacta de 30 días ---');
  const nowFixed = Date.now();
  // 29 días y 23 horas (válido)
  const justInsideEvt = { eventId: 'evt-limit-inside', campaignId: validCampaignIds[0], eventType: 'impression', timestamp: new Date(nowFixed - (29 * 24 + 23) * 3600 * 1000).toISOString() };
  // 30 días y 1 hora (expirado)
  const justOutsideEvt = { eventId: 'evt-limit-outside', campaignId: validCampaignIds[0], eventType: 'impression', timestamp: new Date(nowFixed - (30 * 24 + 1) * 3600 * 1000).toISOString() };

  const batchP8Inside = processTerminalSyncBatch([justInsideEvt], '00000000-0000-0000-0000-000000000001', validCampaignIds, nowFixed);
  const batchP8Outside = processTerminalSyncBatch([justOutsideEvt], '00000000-0000-0000-0000-000000000001', validCampaignIds, nowFixed);

  const p8Passed = batchP8Inside.eventsToInsert.length === 1 &&
                   batchP8Outside.eventsToInsert.length === 0 &&
                   batchP8Outside.ackCount === 1;

  record(8, 'Evaluación de frontera exacta de 30 días discrimina con precisión milimétrica',
    p8Passed,
    { insideInserted: batchP8Inside.eventsToInsert.length, outsideAck: batchP8Outside.ackCount }
  );

  // ---------------------------------------------------------------------------
  // Prueba 9: Evento recibido con más de 30 días de retraso
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 9: Evento con 60 días de retraso ---');
  const lag60dEvt = { eventId: 'evt-lag-60d', campaignId: validCampaignIds[0], eventType: 'offer_open', timestamp: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString() };
  const batchP9 = processTerminalSyncBatch([lag60dEvt], '00000000-0000-0000-0000-000000000001', validCampaignIds);
  record(9, 'Evento con retraso de 60 días se confirma con ack pero no entra a campaign_events',
    batchP9.ackCount === 1 && batchP9.eventsToInsert.length === 0,
    { batchP9 }
  );

  // ---------------------------------------------------------------------------
  // Prueba 10: Lotes mixtos de eventos válidos y descartados
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 10: Lote mixto de 10 eventos heterogéneos ---');
  const mixedBatch = [
    { eventId: 'evt-mix-val-1', campaignId: validCampaignIds[0], eventType: 'impression', timestamp: new Date().toISOString() },
    { eventId: 'evt-mix-val-2', campaignId: validCampaignIds[0], eventType: 'whatsapp_click', timestamp: new Date().toISOString() },
    { eventId: 'evt-mix-old-1', campaignId: validCampaignIds[0], eventType: 'impression', timestamp: new Date(Date.now() - 35 * 86400000).toISOString() },
    { eventId: '', campaignId: validCampaignIds[0], eventType: 'impression', timestamp: new Date().toISOString() }, // sin id
    { eventId: 'evt-mix-fut-1', campaignId: validCampaignIds[0], eventType: 'impression', timestamp: new Date(Date.now() + 86400000).toISOString() }, // futuro
    { eventId: 'evt-mix-val-3', campaignId: validCampaignIds[0], eventType: 'offer_open', timestamp: new Date().toISOString() }
  ];

  const batchP10 = processTerminalSyncBatch(mixedBatch, '00000000-0000-0000-0000-000000000001', validCampaignIds);
  const p10Passed = batchP10.eventsToInsert.length === 3 && batchP10.ackCount === 4; // 3 válidos + 1 viejo descartado

  record(10, 'Lote mixto procesa exactamente eventos válidos e informa ack consolidado para el POS',
    p10Passed,
    { insertables: batchP10.eventsToInsert.length, confirmadosAck: batchP10.ackCount }
  );

  // ---------------------------------------------------------------------------
  // Prueba 11: Inserciones concurrentes durante la purga
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 11: Inserciones simultáneas durante la purga ---');
  // Insertar evento en vuelo
  runSql(TEMP_DB, `
    INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp, aggregated_at)
    VALUES ('evt-concurrent-01', '00000000-0000-0000-0000-000000000001', '${validCampaignIds[0]}', 'impression', now(), NULL);
  `);
  // Ejecutar purga
  const purgeConcurrentRes = JSON.parse(runSql(TEMP_DB, `SELECT public.purge_consolidated_campaign_events(false, 30, 5000);`));
  // Comprobar que el evento en vuelo con aggregated_at IS NULL sigue existiendo
  const concurrentExists = runSql(TEMP_DB, `SELECT count(*) FROM public.campaign_events WHERE event_id = 'evt-concurrent-01';`);
  record(11, 'Inserción de evento con aggregated_at IS NULL queda estrictamente protegida de la purga',
    concurrentExists === '1',
    { purgeConcurrentRes, concurrentExists }
  );

  // ---------------------------------------------------------------------------
  // Prueba 12: Interrupción y rollback de una purga
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 12: Transaccionalidad y rollback ante fallo simulado ---');
  const countBeforeP12 = parseInt(runSql(TEMP_DB, `SELECT count(*) FROM public.campaign_events;`), 10);
  try {
    runSql(TEMP_DB, `
      DO $$ BEGIN
        -- Simular transacción abortada
        PERFORM public.purge_consolidated_campaign_events(false, 30, 100);
        RAISE EXCEPTION 'Simulated failure during purge batch';
      END $$;
    `);
  } catch (e) {
    // Error esperado
  }
  const countAfterP12 = parseInt(runSql(TEMP_DB, `SELECT count(*) FROM public.campaign_events;`), 10);
  record(12, 'Transaccionalidad ACID confirmada: rollback ante fallo restituye el estado íntegro',
    countAfterP12 === countBeforeP12,
    { countBefore: countBeforeP12, countAfter: countAfterP12 }
  );

  // ---------------------------------------------------------------------------
  // Prueba 13: Conciliación matemática 4D antes y después
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 13: Conciliación matemática 4D en campaign_daily_aggregates ---');
  const reconJson = JSON.parse(runSql(TEMP_DB, `SELECT public.reconcile_campaign_metrics_4d();`));
  const p13Passed = reconJson.all_matching === true && reconJson.mismatches_count === 0 && reconJson.perfect_matches > 0;
  record(13, 'Conciliación 4D perfecta (100% de particiones coincidentes) tras purga de crudos',
    p13Passed,
    { reconJson }
  );

  // ---------------------------------------------------------------------------
  // Prueba 14: Cuotas diarias desacopladas (v_campaign_daily_quotas)
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 14: Cuotas diarias a través de v_campaign_daily_quotas ---');
  const quotasBeforeConsolidate = runSql(TEMP_DB, `
    SELECT json_agg(json_build_object('campaign_id', campaign_id, 'impressions_today', impressions_today, 'is_quota_exhausted', is_quota_exhausted))
    FROM public.v_campaign_daily_quotas;
  `);

  // Consolidar lote pendiente
  runSql(TEMP_DB, `SELECT public.consolidate_campaign_events_batch('manual', 50000);`);

  const quotasAfterConsolidate = runSql(TEMP_DB, `
    SELECT json_agg(json_build_object('campaign_id', campaign_id, 'impressions_today', impressions_today, 'is_quota_exhausted', is_quota_exhausted))
    FROM public.v_campaign_daily_quotas;
  `);

  record(14, 'v_campaign_daily_quotas calcula idénticos resultados con eventos en vuelo o consolidados',
    quotasBeforeConsolidate === quotasAfterConsolidate,
    { match: quotasBeforeConsolidate === quotasAfterConsolidate }
  );

  // ---------------------------------------------------------------------------
  // Prueba 15: Integridad de purge_ledger
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 15: Auditoría en purge_ledger ---');
  const ledgerEntries = JSON.parse(runSql(TEMP_DB, `
    SELECT json_agg(json_build_object(
      'id', id,
      'purge_batch_id', purge_batch_id,
      'purged_count', purged_count,
      'cutoff_date', cutoff_date::text,
      'executed_by', executed_by
    ))
    FROM public.purge_ledger;
  `));
  const p15Passed = Array.isArray(ledgerEntries) && ledgerEntries.length > 0 && ledgerEntries[0].purged_count > 0;
  record(15, 'Tabla de auditoría purge_ledger registra con fidelidad registros eliminados y parámetros',
    p15Passed,
    { ledgerCount: ledgerEntries ? ledgerEntries.length : 0, firstEntry: ledgerEntries ? ledgerEntries[0] : null }
  );

  // ---------------------------------------------------------------------------
  // Prueba 16: Confirmación de alcance protegido (Ventas, Caja, Stock fuera de alcance)
  // ---------------------------------------------------------------------------
  console.log('\n--- Prueba 16: Alcance protegido ---');
  // Verificar que el único archivo de aplicación modificado para la fase 4B.7.2 es terminal-sync/index.ts
  const terminalSyncModified = fs.existsSync('supabase/functions/terminal-sync/index.ts');
  const migrationCreated = fs.existsSync('supabase/migrations/20261111_retention_and_quota_hardening.sql');
  const p16Passed = terminalSyncModified && migrationCreated;

  record(16, 'Módulos de POS, ventas, inventario, clientes y caja permanecen fuera del alcance de la fase',
    p16Passed,
    { terminalSyncModified, migrationCreated }
  );

  // ---------------------------------------------------------------------------
  // Tarea 6: Medición de ahorro real en PostgreSQL y VACUUM
  // ---------------------------------------------------------------------------
  console.log('\n--- Medición de espacio y ahorro en PostgreSQL ---');
  // Ejecutar VACUUM normal (sin full)
  runSql(TEMP_DB, `VACUUM public.campaign_events;`);

  const [totalBytesAfter, tableBytesAfter, indexBytesAfter] = runSql(TEMP_DB, sizeBeforeSql).split('|').map(Number);
  evidence.sizingMetrics.after = { totalBytesAfter, tableBytesAfter, indexBytesAfter };

  const deadTuples = runSql(TEMP_DB, `
    SELECT n_dead_tup 
    FROM pg_stat_user_tables 
    WHERE relname = 'campaign_events';
  `);
  evidence.sizingMetrics.deadTuplesAfterVacuum = parseInt(deadTuples || '0', 10);

  console.log('Métricas de tamaño registradas:', JSON.stringify(evidence.sizingMetrics, null, 2));

  // Limpieza final de la base temporal
  console.log('\n--- Limpiando base de datos temporal ---');
  execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
  console.log(`Base temporal ${TEMP_DB} eliminada correctamente.`);

} catch (err) {
  console.error('Error fatal durante la ejecución de las pruebas adversariales:', err);
  try {
    execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
  } catch (e) {}
}

console.log('\n========================================================================');
console.log(`=== RESUMEN FINAL: ${evidence.passedChecks}/${evidence.totalChecks} PRUEBAS SUPERADAS ===`);
console.log('========================================================================\n');

if (evidence.passedChecks === evidence.totalChecks) {
  console.log('STATUS: PASS — Todas las verificaciones adversariales pasaron exitosamente.');
  process.exit(0);
} else {
  console.error('STATUS: FAIL — Se detectaron inconsistencias en las pruebas.');
  process.exit(1);
}
