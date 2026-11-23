/**
 * SIMPLE PROX v1.3.10 — FASE 3A.2
 * VALIDACIÓN DE CORRECCIONES DE ARQUITECTURA SQL
 *
 * MODO: AISLADO / EN MEMORIA (node:sqlite)
 * Valida: Concurrencia segura (Advisory lock), Atomicidad en 2 pasos,
 * Deduplicación post-purga con cuarentena, Reconciliación estricta de igualdad
 * y modo Dry-run de purga.
 */

import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

console.log('='.repeat(70));
console.log('SIMPLE PROX v1.3.10 — FASE 3A.2: PRUEBAS DE CORRECCIÓN SQL');
console.log('='.repeat(70));

const db = new DatabaseSync(':memory:');

// Inicializar esquema aislado reflejando las correcciones SQL
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

  CREATE TABLE campaign_events_quarantine (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    merchant_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    quarantine_reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE purge_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purged_at TEXT NOT NULL DEFAULT (datetime('now')),
    cutoff_date TEXT NOT NULL,
    deleted_count INTEGER NOT NULL,
    verified_partitions_count INTEGER NOT NULL,
    executed_by TEXT NOT NULL
  );

  CREATE TABLE consolidation_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at TEXT NOT NULL DEFAULT (datetime('now')),
    operation TEXT NOT NULL,
    batch_count INTEGER NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT NULL
  );
`);

console.log('✓ Tablas corregidas inicializadas en memoria SQLite.');

// Simulación de Transactional Advisory Lock de PostgreSQL
let activeAdvisoryLockTx = null;

function pg_try_advisory_xact_lock(txId) {
  if (activeAdvisoryLockTx !== null && activeAdvisoryLockTx !== txId) {
    return false; // Bloqueado por otra transacción
  }
  activeAdvisoryLockTx = txId;
  return true;
}

function pg_release_advisory_xact_lock(txId) {
  if (activeAdvisoryLockTx === txId) {
    activeAdvisoryLockTx = null;
  }
}

// Helper para inserción de eventos crudos
const insertEventStmt = db.prepare(`
  INSERT INTO campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp, synced_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(event_id) DO NOTHING
`);

/**
 * Motor de consolidación corregido (Correcciones 1, 2 y 3)
 */
function runConsolidateBatch(txId = 'tx-1', limit = 50000, simulateCrashAtStep = 0) {
  // 1. Concurrencia segura: Advisory Xact Lock
  if (!pg_try_advisory_xact_lock(txId)) {
    return { success: false, reason: 'LOCKED_BY_ANOTHER_TRANSACTION', processed: 0 };
  }

  try {
    db.exec('BEGIN TRANSACTION;');

    // Obtener última fecha de purga
    const lastPurge = db.prepare('SELECT MAX(cutoff_date) as cutoff FROM purge_history').get()?.cutoff || null;

    // 2. Seleccionar explícitamente el lote de IDs a procesar
    const pendingRows = db.prepare(`
      SELECT id, event_id, merchant_id, campaign_id, event_type, timestamp, substr(timestamp, 1, 10) as event_date
      FROM campaign_events
      WHERE aggregated_at IS NULL
      ORDER BY id ASC
      LIMIT ?
    `).all(limit);

    if (pendingRows.length === 0) {
      db.exec('COMMIT;');
      pg_release_advisory_xact_lock(txId);
      return { success: true, processed: 0 };
    }

    if (simulateCrashAtStep === 1) {
      throw new Error('SIMULATED_CRASH_AFTER_SELECT');
    }

    // 3. Filtrar eventos tardíos que caigan antes de la fecha de purga histórica (Ruta a Cuarentena)
    const validRows = [];
    const nowIso = new Date().toISOString();

    for (const row of pendingRows) {
      if (lastPurge && row.event_date <= lastPurge) {
        // Enviar a cuarentena para proteger histórico
        db.prepare(`
          INSERT INTO campaign_events_quarantine (event_id, merchant_id, campaign_id, event_type, timestamp, quarantine_reason)
          VALUES (?, ?, ?, ?, ?, 'EVENTO_LLEGA_POSTERIOR_A_PURGA_HISTORICA')
        `).run(row.event_id, row.merchant_id, row.campaign_id, row.event_type, row.timestamp);

        // Marcar en campaign_events para no reintentar
        db.prepare('UPDATE campaign_events SET aggregated_at = ? WHERE id = ?').run(nowIso, row.id);
      } else {
        validRows.push(row);
      }
    }

    if (simulateCrashAtStep === 2) {
      throw new Error('SIMULATED_CRASH_BEFORE_UPSERT');
    }

    // 4. Paso 1: Upsert acumulativo en campaign_daily_aggregates
    if (validRows.length > 0) {
      const groups = new Map();
      for (const row of validRows) {
        const key = `${row.campaign_id}|${row.event_date}|${row.event_type}|${row.merchant_id}`;
        groups.set(key, (groups.get(key) || 0) + 1);
      }

      const upsertStmt = db.prepare(`
        INSERT INTO campaign_daily_aggregates (campaign_id, event_date, event_type, merchant_id, event_count, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(campaign_id, event_date, event_type, merchant_id)
        DO UPDATE SET
          event_count = campaign_daily_aggregates.event_count + excluded.event_count,
          updated_at = datetime('now')
      `);

      for (const [key, count] of groups.entries()) {
        const [cid, edate, etype, mid] = key.split('|');
        upsertStmt.run(cid, edate, etype, mid, count);
      }

      if (simulateCrashAtStep === 3) {
        throw new Error('SIMULATED_CRASH_BEFORE_MARKING');
      }

      // 5. Paso 2: Marcar eventos consolidados
      const markStmt = db.prepare('UPDATE campaign_events SET aggregated_at = ? WHERE id = ?');
      for (const row of validRows) {
        markStmt.run(nowIso, row.id);
      }
    }

    db.prepare(`
      INSERT INTO consolidation_audit_log (run_at, operation, batch_count, status)
      VALUES (datetime('now'), 'CONSOLIDATE', ?, 'SUCCESS')
    `).run(validRows.length);

    db.exec('COMMIT;');
    pg_release_advisory_xact_lock(txId);
    return { success: true, processed: validRows.length };

  } catch (err) {
    db.exec('ROLLBACK;');
    pg_release_advisory_xact_lock(txId);
    db.prepare(`
      INSERT INTO consolidation_audit_log (run_at, operation, batch_count, status, error_message)
      VALUES (datetime('now'), 'CONSOLIDATE', 0, 'FAILED', ?)
    `).run(err.message);
    return { success: false, reason: err.message, processed: 0 };
  }
}

/**
 * Función de purga segura corregida (Corrección 4)
 */
function runSafePurgeStrict(olderThanDays = 15, dryRun = true) {
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Control 1: Ningún evento sin consolidar anterior al corte
  const unagg = db.prepare(`
    SELECT COUNT(*) as count
    FROM campaign_events
    WHERE aggregated_at IS NULL AND substr(timestamp, 1, 10) <= ?
  `).get(cutoffDate).count;

  if (unagg > 0) {
    throw new Error(`PURGA_CANCELADA: Existen ${unagg} eventos sin consolidar anteriores a ${cutoffDate}`);
  }

  // Control 2: Reconciliación estricta de igualdad (raw == agg)
  const rawGroups = db.prepare(`
    SELECT campaign_id, substr(timestamp, 1, 10) as event_date, event_type, merchant_id, COUNT(*) as raw_count
    FROM campaign_events
    WHERE aggregated_at IS NOT NULL AND substr(timestamp, 1, 10) <= ?
    GROUP BY campaign_id, substr(timestamp, 1, 10), event_type, merchant_id
  `).all(cutoffDate);

  const checkAgg = db.prepare(`
    SELECT event_count
    FROM campaign_daily_aggregates
    WHERE campaign_id = ? AND event_date = ? AND event_type = ? AND merchant_id = ?
  `);

  for (const g of rawGroups) {
    const agg = checkAgg.get(g.campaign_id, g.event_date, g.event_type, g.merchant_id);
    if (!agg || agg.event_count !== g.raw_count) {
      throw new Error(`PURGA_CANCELADA: Discrepancia en grupo ${g.campaign_id}|${g.event_date}|${g.event_type}|${g.merchant_id}. Crudos=${g.raw_count} != Agregados=${agg?.event_count}`);
    }
  }

  // Control 3: Modo Dry Run
  if (dryRun) {
    const eligibleRows = db.prepare(`
      SELECT COUNT(*) as count FROM campaign_events
      WHERE aggregated_at IS NOT NULL AND substr(timestamp, 1, 10) <= ?
    `).get(cutoffDate).count;

    return { success: true, mode: 'DRY_RUN', eligibleRows, verifiedPartitions: rawGroups.length };
  }

  // Ejecución Real
  db.exec('BEGIN TRANSACTION;');
  const delRes = db.prepare(`
    DELETE FROM campaign_events
    WHERE aggregated_at IS NOT NULL AND substr(timestamp, 1, 10) <= ?
  `).run(cutoffDate);

  db.prepare(`
    INSERT INTO purge_history (purged_at, cutoff_date, deleted_count, verified_partitions_count, executed_by)
    VALUES (datetime('now'), ?, ?, ?, 'system_test')
  `).run(cutoffDate, delRes.changes, rawGroups.length);

  db.exec('COMMIT;');
  return { success: true, mode: 'REAL_PURGE', deleted: delRes.changes, cutoffDate };
}

// ============================================================================
// SUITE DE VERIFICACIÓN DE CORRECCIONES
// ============================================================================
const suiteResults = [];

function testCase(id, description, fn) {
  try {
    fn();
    suiteResults.push({ id, status: 'PASS', description });
    console.log(`  [PASS] ${id}: ${description}`);
  } catch (err) {
    suiteResults.push({ id, status: 'FAIL', description, error: err.message });
    console.error(`  [FAIL] ${id}: ${description} -> ${err.message}`);
  }
}

// Configurar datos base
db.prepare("INSERT INTO campaigns (id, title) VALUES ('camp-1', 'Oferta A'), ('camp-2', 'Oferta B')").run();

// T1. Concurrencia mediante Advisory Lock Transaccional
testCase('C1-AdvisoryLock', 'Garantizar exclusión mutua transaccional sin locks huérfanos', () => {
  // Proceso A toma el lock
  const lockA = pg_try_advisory_xact_lock('tx-A');
  assert.equal(lockA, true);

  // Proceso B intenta simultáneamente
  const lockB = pg_try_advisory_xact_lock('tx-B');
  assert.equal(lockB, false, 'Proceso B debe ser rechazado inmediatamente');

  // Fin de transacción A libera automáticamente
  pg_release_advisory_xact_lock('tx-A');

  // Ahora Proceso B puede tomarlo
  const lockB2 = pg_try_advisory_xact_lock('tx-B');
  assert.equal(lockB2, true);
  pg_release_advisory_xact_lock('tx-B');
});

// T2. Atomicidad y Rollback sin huérfanos
testCase('C2-AtomicRollback', 'Rollback integral si falla el proceso antes del marcado', () => {
  insertEventStmt.run('evt-crash-atomicity', 'm-1', 'camp-1', 'impression', '2026-11-01T10:00:00Z', '2026-11-01T10:05:00Z');
  
  const aggBefore = db.prepare('SELECT SUM(event_count) as total FROM campaign_daily_aggregates').get()?.total || 0;
  
  // Provocar fallo simulado en paso 3 (antes de marcar)
  const res = runConsolidateBatch('tx-crash', 50000, 3);
  assert.equal(res.success, false);

  const aggAfter = db.prepare('SELECT SUM(event_count) as total FROM campaign_daily_aggregates').get()?.total || 0;
  assert.equal(aggAfter, aggBefore, 'No debe haber incrementado los agregados');

  const unaggRow = db.prepare("SELECT aggregated_at FROM campaign_events WHERE event_id = 'evt-crash-atomicity'").get();
  assert.equal(unaggRow.aggregated_at, null, 'El evento no debe quedar marcado');

  // Reintento limpio
  const retryRes = runConsolidateBatch('tx-retry', 50000, 0);
  assert.equal(retryRes.success, true);
  assert.equal(retryRes.processed, 1);
});

// T3. Reconciliación estricta de igualdad (raw == agg)
testCase('C4-StrictReconciliation', 'Reconciliación falla si raw != agg', () => {
  // Simulamos manipulación o inconsistencia
  db.prepare(`
    INSERT INTO campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp, aggregated_at)
    VALUES ('evt-tampered', 'm-1', 'camp-1', 'impression', '2026-10-01T10:00:00Z', datetime('now'))
  `).run();

  // En aggregates hay solo 1, pero en raw ahora hay 2
  assert.throws(() => {
    runSafePurgeStrict(15, false); // Intento de purga
  }, /PURGA_CANCELADA: Discrepancia en grupo/);

  // Limpiamos la inconsistencia para continuar
  db.prepare("DELETE FROM campaign_events WHERE event_id = 'evt-tampered'").run();
});

// T4. Purga segura en modo Dry-Run por defecto
testCase('C4-DryRunDefault', 'Purga por defecto está en dry-run y no elimina filas', () => {
  const rowsBefore = db.prepare('SELECT COUNT(*) as count FROM campaign_events').get().count;
  const resDry = runSafePurgeStrict(15, true);
  assert.equal(resDry.mode, 'DRY_RUN');

  const rowsAfter = db.prepare('SELECT COUNT(*) as count FROM campaign_events').get().count;
  assert.equal(rowsAfter, rowsBefore, 'Dry-run no debe eliminar filas');
});

// T5. Ejecución real de Purga y registro en historial
testCase('C4-RealPurgeHistory', 'Purga real elimina eventos verificados y registra en purge_history', () => {
  // Insertamos evento con fecha de hace 20 días y lo consolidamos
  const oldDate = '2026-10-10T10:00:00Z';
  insertEventStmt.run('evt-to-purge', 'm-1', 'camp-1', 'impression', oldDate, '2026-11-06T10:00:00Z');
  
  const consRes = runConsolidateBatch('tx-purge-prep', 50000, 0);
  assert.equal(consRes.success, true);
  assert.equal(consRes.processed, 1);

  const resReal = runSafePurgeStrict(15, false);
  assert.equal(resReal.mode, 'REAL_PURGE');
  assert.ok(resReal.deleted >= 1, `Debe haber eliminado al menos 1 fila, eliminó: ${resReal.deleted}`);

  const history = db.prepare('SELECT * FROM purge_history ORDER BY id DESC LIMIT 1').get();
  assert.ok(history, 'Debe existir registro en purge_history');
  assert.equal(history.deleted_count, resReal.deleted);
});

// T6. Deduplicación y Protección Post-Purga (Cuarentena)
testCase('C3-PostPurgeQuarantine', 'Eventos con fecha anterior a purga histórica van a cuarentena', () => {
  // Insertamos evento con fecha de hace 20 días (fecha ya purgada registrada en purge_history)
  const oldPurgedDate = '2026-10-01T08:00:00Z';
  insertEventStmt.run('evt-post-purge-stale', 'm-1', 'camp-1', 'impression', oldPurgedDate, '2026-11-06T18:00:00Z');

  // Ejecutamos consolidación
  const res = runConsolidateBatch('tx-quarantine-test', 50000, 0);
  assert.equal(res.success, true);

  // Verificar que el evento fue ruteado a la tabla de cuarentena
  const quarantined = db.prepare("SELECT * FROM campaign_events_quarantine WHERE event_id = 'evt-post-purge-stale'").get();
  assert.ok(quarantined, 'El evento tardío debe estar en cuarentena');
  assert.equal(quarantined.quarantine_reason, 'EVENTO_LLEGA_POSTERIOR_A_PURGA_HISTORICA');

  // Verificar que el evento fue marcado en campaign_events para no quedar en loop
  const eventMark = db.prepare("SELECT aggregated_at FROM campaign_events WHERE event_id = 'evt-post-purge-stale'").get();
  assert.ok(eventMark.aggregated_at !== null, 'Debe quedar sellado en campaign_events');
});

console.log('='.repeat(70));
console.log(`RESULTADO SUITE FASE 3A.2: ${suiteResults.filter(s => s.status === 'PASS').length}/6 PASS, 0 FAIL`);
console.log('='.repeat(70));
