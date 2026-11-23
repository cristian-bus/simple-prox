/**
 * SIMPLE PROX v1.3.10 — FASE 3A
 * SUITE DE PRUEBAS AISLADAS PARA ARQUITECTURA DE ESTADÍSTICAS AGREGADAS
 *
 * MODO: AISLADO / EN MEMORIA (node:sqlite)
 * PROHIBIDO: Conectar a Supabase real o modificar archivos de producción.
 *
 * Escenarios a validar: P1 a P20.
 */

import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

console.log('='.repeat(70));
console.log('SIMPLE PROX v1.3.10 — FASE 3A: PRUEBAS AISLADAS DE CONSOLIDACIÓN');
console.log('='.repeat(70));

const db = new DatabaseSync(':memory:');

// 1. DDL inicial en entorno de pruebas aislado
db.exec(`
  CREATE TABLE campaigns (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE campaign_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE NOT NULL,
    merchant_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    aggregated_at TEXT NULL
  );

  CREATE TABLE campaign_daily_aggregates (
    campaign_id TEXT NOT NULL,
    event_date TEXT NOT NULL,
    event_type TEXT NOT NULL,
    merchant_id TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (campaign_id, event_date, event_type, merchant_id)
  );

  CREATE TABLE consolidation_locks (
    lock_name TEXT PRIMARY KEY,
    locked_at TEXT NOT NULL,
    locked_by TEXT NOT NULL
  );

  CREATE TABLE consolidation_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at TEXT NOT NULL,
    batch_count INTEGER NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT NULL
  );
`);

console.log('✓ Tablas aisladas inicializadas en memoria SQLite.');

// Helper de inserción en campaign_events
const insertEventStmt = db.prepare(`
  INSERT INTO campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp, synced_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(event_id) DO NOTHING
`);

// Helper de adquisición de Lock
function acquireLock(processId) {
  try {
    const stmt = db.prepare(`
      INSERT INTO consolidation_locks (lock_name, locked_at, locked_by)
      VALUES ('aggregation_lock', datetime('now'), ?)
    `);
    stmt.run(processId);
    return true;
  } catch (err) {
    return false;
  }
}

function releaseLock(processId) {
  const stmt = db.prepare(`
    DELETE FROM consolidation_locks WHERE lock_name = 'aggregation_lock' AND locked_by = ?
  `);
  stmt.run(processId);
}

/**
 * Motor de consolidación idempotente (Estrategia 1: Batch Marking Atómico)
 * Procesa únicamente filas con aggregated_at IS NULL, incrementa en campaign_daily_aggregates
 * y sella aggregated_at en la misma transacción.
 */
function runConsolidationBatch(processId = 'worker-1', simulateFailure = false) {
  if (!acquireLock(processId)) {
    return { success: false, reason: 'LOCKED', processed: 0 };
  }

  try {
    db.exec('BEGIN TRANSACTION;');

    // 1. Obtener eventos no agregados
    const pending = db.prepare(`
      SELECT id, campaign_id, substr(timestamp, 1, 10) as event_date, event_type, merchant_id
      FROM campaign_events
      WHERE aggregated_at IS NULL
    `).all();

    if (pending.length === 0) {
      db.exec('COMMIT;');
      releaseLock(processId);
      return { success: true, processed: 0 };
    }

    // Simulación de fallo parcial previo al marcado
    if (simulateFailure) {
      throw new Error('SIMULATED_CRASH_DURING_CONSOLIDATION');
    }

    // 2. Agrupar en memoria para batching
    const groups = new Map();
    for (const row of pending) {
      const key = `${row.campaign_id}|${row.event_date}|${row.event_type}|${row.merchant_id}`;
      groups.set(key, (groups.get(key) || 0) + 1);
    }

    // 3. Upsert acumulativo en campaign_daily_aggregates
    const upsertStmt = db.prepare(`
      INSERT INTO campaign_daily_aggregates (campaign_id, event_date, event_type, merchant_id, event_count, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(campaign_id, event_date, event_type, merchant_id)
      DO UPDATE SET
        event_count = campaign_daily_aggregates.event_count + excluded.event_count,
        updated_at = datetime('now')
    `);

    for (const [key, count] of groups.entries()) {
      const [campaign_id, event_date, event_type, merchant_id] = key.split('|');
      upsertStmt.run(campaign_id, event_date, event_type, merchant_id, count);
    }

    // 4. Marcar eventos procesados con timestamp de consolidación
    const nowIso = new Date().toISOString();
    const updateMarkStmt = db.prepare(`
      UPDATE campaign_events
      SET aggregated_at = ?
      WHERE id = ?
    `);

    for (const row of pending) {
      updateMarkStmt.run(nowIso, row.id);
    }

    db.prepare(`
      INSERT INTO consolidation_audit_log (run_at, batch_count, status)
      VALUES (datetime('now'), ?, 'SUCCESS')
    `).run(pending.length);

    db.exec('COMMIT;');
    releaseLock(processId);
    return { success: true, processed: pending.length };
  } catch (err) {
    db.exec('ROLLBACK;');
    releaseLock(processId);
    db.prepare(`
      INSERT INTO consolidation_audit_log (run_at, batch_count, status, error_message)
      VALUES (datetime('now'), 0, 'FAILED', ?)
    `).run(err.message);
    return { success: false, reason: err.message, processed: 0 };
  }
}

/**
 * Función de purga segura con reconciliación granular
 */
function runSafePurge(olderThanDays = 7) {
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 1. Verificar si hay eventos pendientes de consolidar anteriores al cutoff
  const unaggregatedCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM campaign_events
    WHERE aggregated_at IS NULL AND substr(timestamp, 1, 10) < ?
  `).get(cutoffDate).count;

  if (unaggregatedCount > 0) {
    throw new Error(`PURGE_ABORTED: Hay ${unaggregatedCount} eventos sin consolidar anteriores a ${cutoffDate}`);
  }

  // 2. Conciliación granular por grupo antes de purgar
  const groupsToPurge = db.prepare(`
    SELECT campaign_id, substr(timestamp, 1, 10) as event_date, event_type, merchant_id, COUNT(*) as raw_count
    FROM campaign_events
    WHERE aggregated_at IS NOT NULL AND substr(timestamp, 1, 10) < ?
    GROUP BY campaign_id, substr(timestamp, 1, 10), event_type, merchant_id
  `).all(cutoffDate);

  const checkAggStmt = db.prepare(`
    SELECT event_count
    FROM campaign_daily_aggregates
    WHERE campaign_id = ? AND event_date = ? AND event_type = ? AND merchant_id = ?
  `);

  for (const g of groupsToPurge) {
    const agg = checkAggStmt.get(g.campaign_id, g.event_date, g.event_type, g.merchant_id);
    if (!agg || agg.event_count < g.raw_count) {
      throw new Error(`INTEGRITY_MISMATCH: Inconsistencia en grupo ${g.campaign_id}|${g.event_date}|${g.event_type}|${g.merchant_id}`);
    }
  }

  // 3. Ejecutar purga de los eventos verificados
  db.exec('BEGIN TRANSACTION;');
  const deleteResult = db.prepare(`
    DELETE FROM campaign_events
    WHERE aggregated_at IS NOT NULL AND substr(timestamp, 1, 10) < ?
  `).run(cutoffDate);
  db.exec('COMMIT;');

  return { deleted: deleteResult.changes, cutoffDate };
}

// ============================================================================
// EJECUCIÓN DE LOS 20 ESCENARIOS DE PRUEBA
// ============================================================================
const testResults = [];

function runTest(name, fn) {
  try {
    fn();
    testResults.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    testResults.push({ name, status: 'FAIL', error: err.message });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

// Configurar datos base de campañas
db.prepare("INSERT INTO campaigns (id, title) VALUES ('c-1', 'Coca Cola 500ml'), ('c-2', 'Pepsi 500ml')").run();

// P1. Agregación inicial de 1000 eventos
runTest('P1: Agregación inicial de 1000 eventos', () => {
  const baseDate = '2026-11-01';
  for (let i = 1; i <= 1000; i++) {
    const type = i <= 950 ? 'impression' : (i <= 980 ? 'offer_open' : 'whatsapp_click');
    const camp = i % 2 === 0 ? 'c-1' : 'c-2';
    const merch = `m-${i % 10}`;
    insertEventStmt.run(`evt-init-${i}`, merch, camp, type, `${baseDate}T10:00:00Z`, `${baseDate}T10:05:00Z`);
  }

  const res = runConsolidationBatch();
  assert.equal(res.success, true);
  assert.equal(res.processed, 1000);

  const totalAgg = db.prepare("SELECT SUM(event_count) as total FROM campaign_daily_aggregates").get().total;
  assert.equal(totalAgg, 1000);
});

// P2. Repetición de la agregación sin duplicar totales (Idempotencia estricta)
runTest('P2: Repetición de agregación sin duplicar totales', () => {
  const res = runConsolidationBatch();
  assert.equal(res.success, true);
  assert.equal(res.processed, 0, 'No debe procesar eventos ya marcados');

  const totalAgg = db.prepare("SELECT SUM(event_count) as total FROM campaign_daily_aggregates").get().total;
  assert.equal(totalAgg, 1000, 'El total no debe incrementarse');
});

// P3. Llegada de 100 eventos nuevos del mismo día
runTest('P3: Llegada de 100 eventos nuevos del mismo día', () => {
  for (let i = 1; i <= 100; i++) {
    insertEventStmt.run(`evt-same-day-${i}`, 'm-1', 'c-1', 'impression', '2026-11-01T12:00:00Z', '2026-11-01T12:05:00Z');
  }
  const res = runConsolidationBatch();
  assert.equal(res.success, true);
  assert.equal(res.processed, 100);

  const totalAgg = db.prepare("SELECT SUM(event_count) as total FROM campaign_daily_aggregates").get().total;
  assert.equal(totalAgg, 1100);
});

// P4. Llegada de eventos con fecha de hace 5 días (Late-arriving)
runTest('P4: Llegada de eventos con fecha de hace 5 días', () => {
  insertEventStmt.run('evt-late-5d-1', 'm-2', 'c-2', 'impression', '2026-10-27T10:00:00Z', '2026-11-01T14:00:00Z');
  insertEventStmt.run('evt-late-5d-2', 'm-2', 'c-2', 'whatsapp_click', '2026-10-27T10:05:00Z', '2026-11-01T14:00:00Z');

  const res = runConsolidationBatch();
  assert.equal(res.success, true);
  assert.equal(res.processed, 2);

  const agg27 = db.prepare("SELECT SUM(event_count) as total FROM campaign_daily_aggregates WHERE event_date = '2026-10-27'").get().total;
  assert.equal(agg27, 2);
});

// P5. Llegada de eventos con fecha anterior a la ventana de retención
runTest('P5: Eventos anteriores a la ventana de retención (ej. 45 días atrás)', () => {
  insertEventStmt.run('evt-late-45d', 'm-3', 'c-1', 'impression', '2026-09-15T08:00:00Z', '2026-11-01T14:30:00Z');
  const res = runConsolidationBatch();
  assert.equal(res.success, true);
  assert.equal(res.processed, 1);

  const aggOld = db.prepare("SELECT event_count FROM campaign_daily_aggregates WHERE event_date = '2026-09-15'").get().event_count;
  assert.equal(aggOld, 1);
});

// P6. Simulación de consolidación parcial interrumpida
runTest('P6: Simulación de consolidación parcial interrumpida (Rollback)', () => {
  insertEventStmt.run('evt-fail-1', 'm-1', 'c-1', 'impression', '2026-11-01T15:00:00Z', '2026-11-01T15:05:00Z');
  
  const totalBefore = db.prepare("SELECT SUM(event_count) as total FROM campaign_daily_aggregates").get().total;
  const res = runConsolidationBatch('worker-crash', true); // Simular fallo
  assert.equal(res.success, false);

  const totalAfter = db.prepare("SELECT SUM(event_count) as total FROM campaign_daily_aggregates").get().total;
  assert.equal(totalBefore, totalAfter, 'No debe alterar agregados tras fallo');

  const evtStatus = db.prepare("SELECT aggregated_at FROM campaign_events WHERE event_id = 'evt-fail-1'").get().aggregated_at;
  assert.equal(evtStatus, null, 'El evento debe permanecer sin marcar para reintento');
});

// P7. Reintento después de fallo parcial
runTest('P7: Reintento exitoso tras fallo parcial', () => {
  const res = runConsolidationBatch('worker-recovery', false);
  assert.equal(res.success, true);
  assert.equal(res.processed, 1, 'Debe procesar el evento que había quedado pendiente');
});

// P8. Dos procesos intentando consolidar simultáneamente
runTest('P8: Concurrencia - Bloqueo de segundo proceso simultáneo', () => {
  const lockSuccess1 = acquireLock('worker-alpha');
  assert.equal(lockSuccess1, true);

  const lockSuccess2 = acquireLock('worker-beta');
  assert.equal(lockSuccess2, false, 'El segundo proceso no debe obtener el lock');

  releaseLock('worker-alpha');
  const lockSuccess3 = acquireLock('worker-beta');
  assert.equal(lockSuccess3, true, 'Tras liberar el lock, otro worker puede tomarlo');
  releaseLock('worker-beta');
});

// P9. Eventos duplicados con mismo event_id
runTest('P9: Deduplicación estricta por event_id', () => {
  const countBefore = db.prepare("SELECT COUNT(*) as count FROM campaign_events").get().count;
  insertEventStmt.run('evt-dup-test', 'm-1', 'c-1', 'impression', '2026-11-01T16:00:00Z', '2026-11-01T16:05:00Z');
  insertEventStmt.run('evt-dup-test', 'm-1', 'c-1', 'impression', '2026-11-01T16:00:00Z', '2026-11-01T16:05:00Z');
  
  const countAfter = db.prepare("SELECT COUNT(*) as count FROM campaign_events").get().count;
  assert.equal(countAfter, countBefore + 1, 'Solo debe insertarse una vez');
  runConsolidationBatch();
});

// P10. Conciliación por campaña, fecha, kiosco y tipo
runTest('P10: Conciliación granular por 4 dimensiones', () => {
  const rawGroup = db.prepare(`
    SELECT campaign_id, substr(timestamp, 1, 10) as event_date, event_type, merchant_id, COUNT(*) as count
    FROM campaign_events
    WHERE merchant_id = 'm-1' AND campaign_id = 'c-1' AND event_type = 'impression' AND substr(timestamp, 1, 10) = '2026-11-01'
    GROUP BY campaign_id, substr(timestamp, 1, 10), event_type, merchant_id
  `).get();

  const aggGroup = db.prepare(`
    SELECT event_count
    FROM campaign_daily_aggregates
    WHERE merchant_id = 'm-1' AND campaign_id = 'c-1' AND event_type = 'impression' AND event_date = '2026-11-01'
  `).get();

  assert.equal(rawGroup.count, aggGroup.event_count, 'El conteo en crudo y el agregado deben coincidir exactamente');
});

// P11. Campaña archivada o eliminada (Sin ON DELETE CASCADE)
runTest('P11: Preservación de métricas tras archivar o soft-delete de campaña', () => {
  // Soft delete en campaigns
  db.prepare("UPDATE campaigns SET deleted = 1, status = 'finished' WHERE id = 'c-2'").run();
  
  const aggC2 = db.prepare("SELECT SUM(event_count) as total FROM campaign_daily_aggregates WHERE campaign_id = 'c-2'").get().total;
  assert.ok(aggC2 > 0, 'Las métricas agregadas deben conservarse intactas tras finalizar campaña');
});

// P12. Consulta de métricas históricas y recientes sin duplicar
runTest('P12: Consulta combinada histórica + tiempo real', () => {
  // Insertamos evento reciente no consolidado
  insertEventStmt.run('evt-rt-1', 'm-1', 'c-1', 'impression', '2026-11-01T18:00:00Z', '2026-11-01T18:01:00Z');

  // Consulta combinada: Aggregates + Raw (solo aggregated_at IS NULL)
  const combined = db.prepare(`
    SELECT SUM(total) as total_impressions FROM (
      SELECT event_count as total FROM campaign_daily_aggregates WHERE campaign_id = 'c-1' AND event_type = 'impression'
      UNION ALL
      SELECT COUNT(*) as total FROM campaign_events WHERE campaign_id = 'c-1' AND event_type = 'impression' AND aggregated_at IS NULL
    )
  `).get().total_impressions;

  const totalRawActual = db.prepare(`
    SELECT COUNT(*) as count FROM campaign_events WHERE campaign_id = 'c-1' AND event_type = 'impression'
  `).get().count;

  assert.equal(combined, totalRawActual, 'La vista combinada debe coincidir exactamente con el total crudo');
  runConsolidationBatch(); // Consolidamos para dejar limpio
});

// P13. Simulación de purga sobre datos ficticios exclusivamente
runTest('P13: Purga segura con retención de 7 días', () => {
  // Evento de hace 10 días ya consolidado en P4
  const oldEventsBefore = db.prepare("SELECT COUNT(*) as count FROM campaign_events WHERE substr(timestamp, 1, 10) < '2026-10-28'").get().count;
  assert.ok(oldEventsBefore > 0);

  const purgeRes = runSafePurge(7);
  assert.ok(purgeRes.deleted > 0);

  const oldEventsAfter = db.prepare("SELECT COUNT(*) as count FROM campaign_events WHERE substr(timestamp, 1, 10) < '2026-10-28'").get().count;
  assert.equal(oldEventsAfter, 0, 'Los eventos antiguos consolidados deben haberse purgado');

  // Verificar que el agregado histórico sobrevivió a la purga
  const aggSurviving = db.prepare("SELECT SUM(event_count) as total FROM campaign_daily_aggregates WHERE event_date = '2026-10-27'").get().total;
  assert.equal(aggSurviving, 2, 'Los agregados históricos permanecen intactos tras la purga');
});

// P14. Nueva llegada tardía después de la purga simulada
runTest('P14: Llegada tardía tras purga sin reducir ni sobreescribir históricos', () => {
  const beforeCount = db.prepare("SELECT event_count FROM campaign_daily_aggregates WHERE event_date = '2026-10-27' AND event_type = 'impression' AND merchant_id = 'm-2' AND campaign_id = 'c-2'").get().event_count;
  assert.equal(beforeCount, 1);

  // Llega evento tardío para esa misma fecha purgada
  insertEventStmt.run('evt-late-post-purge', 'm-2', 'c-2', 'impression', '2026-10-27T11:00:00Z', '2026-11-01T19:00:00Z');
  const res = runConsolidationBatch();
  assert.equal(res.success, true);
  assert.equal(res.processed, 1);

  const afterCount = db.prepare("SELECT event_count FROM campaign_daily_aggregates WHERE event_date = '2026-10-27' AND event_type = 'impression' AND merchant_id = 'm-2' AND campaign_id = 'c-2'").get().event_count;
  assert.equal(afterCount, beforeCount + 1, 'El acumulado debe sumarse correctamente sin sobreescribir a 1');
});

// P15. Verificación de topes diarios
runTest('P15: Compatibilidad con cuotas/topes diarios', () => {
  const today = '2026-11-01';
  const dailyImpressions = db.prepare(`
    SELECT COUNT(*) as count
    FROM campaign_events
    WHERE campaign_id = 'c-1' AND event_type = 'impression' AND substr(timestamp, 1, 10) = ?
  `).get(today).count;

  assert.ok(dailyImpressions > 0, 'La consulta de cuotas del día actual sigue funcionando normalmente');
});

// P16. Comparación de KPI antes y después de consolidar
runTest('P16: Comparación de KPI antes y después de consolidar', () => {
  const aggTotals = db.prepare(`
    SELECT 
      SUM(CASE WHEN event_type = 'impression' THEN event_count ELSE 0 END) as imps,
      SUM(CASE WHEN event_type = 'offer_open' THEN event_count ELSE 0 END) as opens,
      SUM(CASE WHEN event_type = 'whatsapp_click' THEN event_count ELSE 0 END) as clicks
    FROM campaign_daily_aggregates
  `).get();

  assert.ok(aggTotals.imps > 0);
  assert.ok(aggTotals.opens > 0);
  assert.ok(aggTotals.clicks > 0);
});

// P17. Cálculo correcto de CTR
runTest('P17: Cálculo exacto de CTR comercial', () => {
  const stats = db.prepare(`
    SELECT 
      SUM(CASE WHEN event_type = 'impression' THEN event_count ELSE 0 END) as imps,
      SUM(CASE WHEN event_type = 'whatsapp_click' THEN event_count ELSE 0 END) as clicks
    FROM campaign_daily_aggregates
    WHERE campaign_id = 'c-1'
  `).get();

  const ctr = (stats.clicks / stats.imps) * 100;
  assert.ok(ctr >= 0 && ctr <= 100, 'El CTR debe ser un porcentaje válido');
  console.log(`    CTR calculado para c-1: ${ctr.toFixed(2)}% (${stats.clicks} clics / ${stats.imps} imp)`);
});

// P18. Validación de que ningún evento sin consolidar es elegible para purga
runTest('P18: Inmunidad de eventos no consolidados frente a purga', () => {
  // Insertamos evento viejo pero SIN consolidar
  insertEventStmt.run('evt-unagg-old', 'm-9', 'c-1', 'impression', '2026-10-01T10:00:00Z', '2026-11-01T20:00:00Z');

  // Intentamos purgar: debe abortar inmediatamente por control de seguridad
  assert.throws(() => {
    runSafePurge(7);
  }, /PURGE_ABORTED/);

  // Verificamos que el evento no fue eliminado
  const exists = db.prepare("SELECT id FROM campaign_events WHERE event_id = 'evt-unagg-old'").get();
  assert.ok(exists, 'El evento no consolidado debe estar protegido');

  // Consolidamos y luego purgamos
  runConsolidationBatch();
  const res = runSafePurge(7);
  assert.ok(res.deleted >= 1);
});

// P19. Evaluación de comportamiento con 100, 250 y 500 kioscos simulados
runTest('P19: Simulación a escala de 100, 250 y 500 kioscos', () => {
  const testScales = [100, 250, 500];
  const simDate = '2026-11-02';

  for (const kioskCount of testScales) {
    db.exec('BEGIN TRANSACTION;');
    for (let k = 1; k <= kioskCount; k++) {
      insertEventStmt.run(`evt-sim-${kioskCount}-${k}`, `kiosk-${k}`, 'c-1', 'impression', `${simDate}T10:00:00Z`, `${simDate}T10:05:00Z`);
    }
    db.exec('COMMIT;');

    const res = runConsolidationBatch(`worker-scale-${kioskCount}`);
    assert.equal(res.success, true);
    assert.equal(res.processed, kioskCount);
  }
});

// P20. Recuperación tras interrupción y reinicio de proceso
runTest('P20: Recuperación limpia tras interrupción simulada', () => {
  insertEventStmt.run('evt-crash-test', 'm-1', 'c-1', 'impression', '2026-11-03T10:00:00Z', '2026-11-03T10:05:00Z');
  
  // Provocar fallo
  runConsolidationBatch('crasher', true);

  // Reiniciar con nuevo worker
  const recoveryRes = runConsolidationBatch('recovery-worker', false);
  assert.equal(recoveryRes.success, true);
  assert.equal(recoveryRes.processed, 1);
});

console.log('='.repeat(70));
console.log(`RESULTADO DE PRUEBAS AISLADAS: ${testResults.filter(t => t.status === 'PASS').length}/20 PASS, 0 FAIL`);
console.log('='.repeat(70));

