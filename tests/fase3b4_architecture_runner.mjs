// tests/fase3b4_architecture_runner.mjs
// Runner de pruebas para FASE 3B.4 — Cierre de Arquitectura y Pruebas en PostgreSQL 17
import { execSync } from 'child_process';
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
      timeout: options.timeout || 30000
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
    return JSON.parse(res.stdout);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${res.stdout}\nError: ${e.message}`);
  }
}

console.log('=== INICIANDO FASE 3B.4 RUNNER EN POSTGRESQL 17 ===');

const results = {
  timestamp: new Date().toISOString(),
  engine: 'PostgreSQL 17.11',
  container: CONTAINER_NAME,
  tests: {}
};

// -----------------------------------------------------------------------------
// TEST 1: Medición Física de Deduplicación por Bigint Hash (64-bit)
// -----------------------------------------------------------------------------
console.log('\n[TEST 1] Medición física de almacenamiento: Bigint Hash (64-bit)...');
runSql(`
DROP TABLE IF EXISTS test_dedup_bigint;
CREATE TABLE test_dedup_bigint (
  id_hash bigint PRIMARY KEY,
  event_date date NOT NULL
);
`);

const hashSizes = {};
const volumeSteps = [10000, 50000, 100000, 200000];

for (const vol of volumeSteps) {
  runSql(`TRUNCATE test_dedup_bigint;`);
  runSql(`
    INSERT INTO test_dedup_bigint (id_hash, event_date)
    SELECT 
      ('x' || substr(md5(i::text), 1, 16))::bit(64)::bigint,
      CURRENT_DATE - (i % 15)
    FROM generate_series(1, ${vol}) AS i;
  `);

  const metrics = runSqlJson(`
    SELECT 
      ${vol} AS count,
      pg_relation_size('test_dedup_bigint') AS heap_bytes,
      pg_indexes_size('test_dedup_bigint') AS index_bytes,
      pg_total_relation_size('test_dedup_bigint') AS total_bytes,
      pg_size_pretty(pg_relation_size('test_dedup_bigint')) AS heap_pretty,
      pg_size_pretty(pg_indexes_size('test_dedup_bigint')) AS index_pretty,
      pg_size_pretty(pg_total_relation_size('test_dedup_bigint')) AS total_pretty,
      round(pg_total_relation_size('test_dedup_bigint')::numeric / ${vol}, 2) AS bytes_per_id
  `)[0];

  hashSizes[vol] = metrics;
  console.log(`  - ${vol} IDs: Total ${metrics.total_pretty} (${metrics.bytes_per_id} bytes/ID) [Heap: ${metrics.heap_pretty}, Index: ${metrics.index_pretty}]`);
}
results.tests.bigint_hash_measurement = hashSizes;

// -----------------------------------------------------------------------------
// TEST 2: Conciliación 4D usando FULL OUTER JOIN y COALESCE
// -----------------------------------------------------------------------------
console.log('\n[TEST 2] Conciliación 4D con FULL OUTER JOIN y COALESCE...');

// 2.1 Preparar datos limpios y balanceados
runSql(`
TRUNCATE campaign_events, campaign_daily_aggregates, consolidation_audit_log, purge_ledger RESTART IDENTITY;

-- Inserción de 300 eventos multidimensionales
INSERT INTO campaign_events (event_id, campaign_id, merchant_id, event_type, timestamp, aggregated_at)
SELECT 
  'evt-foj-' || i,
  'camp-' || (1 + (i % 3)),
  'merch-' || (1 + (i % 2)),
  CASE (i % 3) WHEN 0 THEN 'impression' WHEN 1 THEN 'offer_open' ELSE 'whatsapp_click' END,
  CURRENT_DATE - INTERVAL '1 day' * (i % 3) + INTERVAL '1 minute' * i,
  NULL
FROM generate_series(1, 300) AS i;

-- Consolidar
SELECT consolidate_campaign_events_batch('worker-foj-test', 1000);
`);

// Consulta FULL OUTER JOIN canónica con timezone exacto
const fojQuery = `
WITH raw_grouped AS (
  SELECT 
    campaign_id,
    (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS event_date,
    merchant_id,
    event_type,
    COUNT(*)::bigint AS raw_count
  FROM campaign_events
  GROUP BY campaign_id, (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, merchant_id, event_type
),
agg_grouped AS (
  SELECT 
    campaign_id,
    event_date,
    merchant_id,
    event_type,
    event_count::bigint AS agg_count
  FROM campaign_daily_aggregates
)
SELECT 
  COALESCE(r.campaign_id, a.campaign_id) AS campaign_id,
  COALESCE(r.event_date, a.event_date) AS event_date,
  COALESCE(r.merchant_id, a.merchant_id) AS merchant_id,
  COALESCE(r.event_type, a.event_type) AS event_type,
  COALESCE(r.raw_count, 0) AS raw_count,
  COALESCE(a.agg_count, 0) AS agg_count,
  CASE 
    WHEN r.campaign_id IS NULL THEN 'ORPHAN_AGGREGATE'
    WHEN a.campaign_id IS NULL THEN 'MISSING_IN_AGGREGATES'
    WHEN r.raw_count != a.agg_count THEN 'COUNT_MISMATCH'
    ELSE 'PERFECT_MATCH'
  END AS reconciliation_status
FROM raw_grouped r
FULL OUTER JOIN agg_grouped a 
  ON r.campaign_id = a.campaign_id
 AND r.event_date = a.event_date
 AND r.merchant_id = a.merchant_id
 AND r.event_type = a.event_type
`;

const balancedRecon = runSqlJson(fojQuery);
const balancedStatusCounts = balancedRecon.reduce((acc, row) => {
  acc[row.reconciliation_status] = (acc[row.reconciliation_status] || 0) + 1;
  return acc;
}, {});

console.log('  - Estado balanceado:', balancedStatusCounts);

// 2.2 Inyectar anomalías para probar que FULL OUTER JOIN detecta ambos lados
console.log('  - Inyectando anomalías deliberadas (1 huérfano en agg, 1 sin consolidar en raw)...');
runSql(`
-- Anomalía 1: Grupo huérfano en agregados (no existe en raw)
INSERT INTO campaign_daily_aggregates (campaign_id, event_date, merchant_id, event_type, event_count, updated_at)
VALUES ('camp-ghost', '2026-10-10', 'merch-ghost', 'impression', 99, NOW());

-- Anomalía 2: Grupo en raw que no se consolidó aún (aggregated_at IS NULL)
INSERT INTO campaign_events (event_id, campaign_id, merchant_id, event_type, timestamp, aggregated_at)
VALUES ('evt-unconsolidated-orphan', 'camp-orphan-raw', 'merch-raw', 'offer_open', '2026-10-11 12:00:00', NULL);
`);

const anomalyRecon = runSqlJson(fojQuery);
const anomalyStatusCounts = anomalyRecon.reduce((acc, row) => {
  acc[row.reconciliation_status] = (acc[row.reconciliation_status] || 0) + 1;
  return acc;
}, {});
console.log('  - Detección con anomalías:', anomalyStatusCounts);

const detectedGhost = anomalyRecon.find(r => r.campaign_id === 'camp-ghost');
const detectedRawOrphan = anomalyRecon.find(r => r.campaign_id === 'camp-orphan-raw');

results.tests.full_outer_join_reconciliation = {
  balanced: {
    total_groups: balancedRecon.length,
    status_summary: balancedStatusCounts,
    all_perfect: balancedStatusCounts['PERFECT_MATCH'] === balancedRecon.length
  },
  anomaly_detection: {
    total_groups: anomalyRecon.length,
    status_summary: anomalyStatusCounts,
    detected_orphan_aggregate: detectedGhost?.reconciliation_status === 'ORPHAN_AGGREGATE',
    detected_missing_in_aggregates: detectedRawOrphan?.reconciliation_status === 'MISSING_IN_AGGREGATES'
  }
};

// -----------------------------------------------------------------------------
// TEST 3: Verificación de Purga Defensiva bajo Inserción Concurrente
// -----------------------------------------------------------------------------
console.log('\n[TEST 3] Verificación de Purga Defensiva frente a eventos no consolidados...');

// Limpiar y resetear
runSql(`
TRUNCATE campaign_events, campaign_daily_aggregates, consolidation_audit_log, purge_ledger RESTART IDENTITY;

-- 1. Insertar 100 eventos de hace 10 días y consolidarlos
INSERT INTO campaign_events (event_id, campaign_id, merchant_id, event_type, timestamp, aggregated_at)
SELECT 
  'evt-old-cons-' || i,
  'camp-1',
  'merch-1',
  'impression',
  CURRENT_DATE - INTERVAL '10 days' + INTERVAL '1 minute' * i,
  NOW()
FROM generate_series(1, 100) AS i;

-- 2. Insertar 10 eventos de hace 10 días pero SIN CONSOLIDAR (aggregated_at IS NULL)
INSERT INTO campaign_events (event_id, campaign_id, merchant_id, event_type, timestamp, aggregated_at)
SELECT 
  'evt-old-uncons-' || i,
  'camp-1',
  'merch-1',
  'impression',
  CURRENT_DATE - INTERVAL '10 days' + INTERVAL '2 minutes' * i,
  NULL
FROM generate_series(1, 10) AS i;
`);

// Intentar purgar eventos mayores a 5 días con dry_run = false
const purgeAttempt = runSql(`SELECT purge_campaign_events_safe(5, 50000, false, 'test-admin-fase3b4');`);

console.log('  - Resultado de intento de purga con eventos pendientes:', purgeAttempt.stdout || purgeAttempt.stderr);

// Verificar conteos en disco
const rawCountCheck = runSqlJson(`
  SELECT 
    COUNT(*) AS total_raw,
    COUNT(*) FILTER (WHERE aggregated_at IS NOT NULL) AS consolidated_count,
    COUNT(*) FILTER (WHERE aggregated_at IS NULL) AS pending_count
  FROM campaign_events
`)[0];

console.log('  - Conteo posterior en campaign_events:', rawCountCheck);

results.tests.purge_safety_check = {
  purge_prevented_properly: purgeAttempt.stderr.includes('PURGA_CANCELADA') || purgeAttempt.stdout.includes('PURGA_CANCELADA'),
  total_raw_remaining: rawCountCheck.total_raw,
  consolidated_preserved: rawCountCheck.consolidated_count === 100,
  pending_preserved: rawCountCheck.pending_count === 10
};

// -----------------------------------------------------------------------------
// TEST 4: Efecto de Eventos Tardíos sobre Estadísticas Históricas y Topes Diarios
// -----------------------------------------------------------------------------
console.log('\n[TEST 4] Efecto de Eventos Tardíos en Estadísticas Históricas y Topes Diarios...');

runSql(`
TRUNCATE campaign_events, campaign_daily_aggregates, consolidation_audit_log, purge_ledger RESTART IDENTITY;

-- Campaña con límite diario de 50 impresiones
INSERT INTO campaigns (id, title, status, is_daily_limit_enabled, daily_limit)
VALUES ('camp-quota-test', 'Campaña Cuota', 'active', true, 50)
ON CONFLICT (id) DO UPDATE SET is_daily_limit_enabled = true, daily_limit = 50;

-- 1. Insertar 25 impresiones de HOY
INSERT INTO campaign_events (event_id, campaign_id, merchant_id, event_type, timestamp, aggregated_at)
SELECT 
  'evt-today-' || i,
  'camp-quota-test',
  'merch-1',
  'impression',
  CURRENT_TIMESTAMP - INTERVAL '10 minutes' * i,
  NULL
FROM generate_series(1, 25) AS i;

-- Consolidar las 25 de hoy
SELECT consolidate_campaign_events_batch('worker-today', 1000);
`);

const quotaBeforeLate = runSqlJson(`
  SELECT campaign_id, daily_limit, impressions_today, is_quota_exhausted
  FROM v_campaign_daily_quotas
  WHERE campaign_id = 'camp-quota-test';
`)[0];
console.log('  - Cuota antes de eventos tardíos:', quotaBeforeLate);

// 2. Inyectar 200 impresiones tardías de HACE 7 DÍAS
console.log('  - Inyectando 200 eventos tardíos de hace 7 días...');
runSql(`
INSERT INTO campaign_events (event_id, campaign_id, merchant_id, event_type, timestamp, aggregated_at)
SELECT 
  'evt-late-7d-' || i,
  'camp-quota-test',
  'merch-1',
  'impression',
  CURRENT_DATE - INTERVAL '7 days' + INTERVAL '1 minute' * i,
  NULL
FROM generate_series(1, 200) AS i;

-- Consolidar lote que incluye los 200 eventos tardíos
SELECT consolidate_campaign_events_batch('worker-late', 1000);
`);

const quotaAfterLate = runSqlJson(`
  SELECT campaign_id, daily_limit, impressions_today, is_quota_exhausted
  FROM v_campaign_daily_quotas
  WHERE campaign_id = 'camp-quota-test';
`)[0];
console.log('  - Cuota después de eventos tardíos (200 de hace 7 días):', quotaAfterLate);

// 3. Comprobar estadísticas en v_campaign_combined_metrics y en agregados por fecha
const combinedMetrics = runSqlJson(`
  SELECT 
    campaign_id,
    event_type,
    total_count
  FROM v_campaign_combined_metrics
  WHERE campaign_id = 'camp-quota-test'
`);
console.log('  - Métricas combinadas totales:', combinedMetrics);

const dailyAggMetrics = runSqlJson(`
  SELECT 
    campaign_id,
    event_date,
    event_type,
    event_count
  FROM campaign_daily_aggregates
  WHERE campaign_id = 'camp-quota-test'
  ORDER BY event_date ASC
`);
console.log('  - Agregados diarios por fecha:', dailyAggMetrics);

results.tests.late_events_effect = {
  quota_before: quotaBeforeLate,
  quota_after: quotaAfterLate,
  quota_isolated: quotaBeforeLate.impressions_today === quotaAfterLate.impressions_today && !quotaAfterLate.is_quota_exhausted,
  combined_metrics_total: combinedMetrics.find(m => m.event_type === 'impression')?.total_count === 225,
  daily_breakdown_correct: dailyAggMetrics.length === 2 && 
    dailyAggMetrics.find(m => m.event_count === 200) !== undefined &&
    dailyAggMetrics.find(m => m.event_count === 25) !== undefined
};

// Guardar evidencia JSON
const evidencePath = path.resolve('tests/fase3b4_raw_evidence.json');
fs.writeFileSync(evidencePath, JSON.stringify(results, null, 2), 'utf8');
console.log(`\n=== PRUEBAS FASE 3B.4 COMPLETADAS. Evidencia guardada en ${evidencePath} ===`);
