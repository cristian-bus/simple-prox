import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Polyfills para entorno Node.js
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.window = {
  crypto: global.crypto,
  addEventListener: () => {},
  removeEventListener: () => {}
};

console.log('================================================================');
console.log('TEST SUITE: INFRAESTRUCTURA DE RECUPERACIÓN ANTE CORTES (5B.2)');
console.log('================================================================\n');

// Import del servicio bajo prueba
const {
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  JOURNAL_STATUS,
  RECOVERY_AFFECTED_KEYS,
  PRESERVED_IDENTITY_KEYS,
  JOURNAL_STORAGE_KEY,
  createInternalSnapshot,
  verifySnapshotIntegrity,
  saveRecoveryJournal,
  getPendingRecoveryJournal,
  clearRecoveryJournal,
  performIdempotentRollback
} = await import('../src/services/recoveryService.js');

// Mock in-memory storage para simular localStorage de Chromium
class MockStorage {
  constructor(initialData = {}) {
    this.store = { ...initialData };
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

// 1. Estado inicial representativo de un comercio real
const initialCommerceData = {
  kioscoprox_installation_id: '061e01d5-a41f-4109-942b-e093e50cb6e2',
  kioscoprox_license_token: 'TOKEN-FIRMA-ED25519-PRO-PERMANENTE-LOCAL',
  kioscoprox_merchant_registration: JSON.stringify({ registered: true, plan: 'PRO' }),
  kioscoprox_products: JSON.stringify([
    { id: 101, name: 'Alfajor Triple', stock: 45, price: 1200 },
    { id: 102, name: 'Gaseosa Cola', stock: 20, price: 1500 }
  ]),
  kioscoprox_sales: JSON.stringify([
    { id: 1001, total: 2700, date: '2026-10-31T10:00:00Z', items: [{ id: 101, qty: 1 }] }
  ]),
  kioscoprox_caja: JSON.stringify({
    isOpen: true,
    efectivo: 15000,
    movimientos: [{ id: 1, type: 'venta', amount: 2700 }]
  }),
  kioscoprox_users: JSON.stringify([
    { id: 1, name: 'Administrador Local', role: 'Admin', pin: '8844', isActive: true },
    { id: 2, name: 'Cajero Mañana', role: 'Cajero', pin: '1122', isActive: true }
  ]),
  kioscoprox_business_config: JSON.stringify({
    storeName: 'Mi Kiosco ProX',
    licenseKey: 'CERT_ED25519_PRO_FIRMA_ADMIN',
    isOnboarded: true
  })
};

// =========================================================================
// TEST 1: Inicio Normal Sin Journal Pendiente
// =========================================================================
console.log('--- 1. Prueba: Inicio Normal Sin Journal Pendiente ---');
const storage1 = new MockStorage(initialCommerceData);
const pending1 = await getPendingRecoveryJournal(storage1);
assert.strictEqual(pending1, null, 'No debe existir journal pendiente en arranque limpio');
console.log('  ✅ PASS: Arranque normal detectado correctamente (estado IDLE)');

// =========================================================================
// TEST 2: Creación y Verificación del Snapshot Interno de Emergencia
// =========================================================================
console.log('\n--- 2. Prueba: Creación y Verificación de Snapshot Interno ---');
const snapshot2 = await createInternalSnapshot(storage1, '061e01d5-a41f-4109-942b-e093e50cb6e2');

assert.strictEqual(snapshot2.format, SNAPSHOT_FORMAT, 'Formato debe ser de snapshot interno');
assert.strictEqual(snapshot2.version, SNAPSHOT_VERSION, 'Versión de snapshot debe ser 1');
assert.ok(snapshot2.checksum && typeof snapshot2.checksum === 'string', 'Debe calcular checksum SHA-256');

// Comprobar que contiene las claves y usuarios con su PIN intacto
const parsedUsersInSnapshot = JSON.parse(snapshot2.data.kioscoprox_users);
assert.strictEqual(parsedUsersInSnapshot[0].pin, '8844', 'Snapshot interno debe preservar PIN local para emergencias');
assert.strictEqual(parsedUsersInSnapshot[1].pin, '1122', 'Snapshot interno debe preservar PIN de cajero para emergencias');

const verify2 = await verifySnapshotIntegrity(snapshot2);
assert.strictEqual(verify2.valid, true, 'Snapshot generado debe ser criptográficamente íntegro');
console.log('  ✅ PASS: Snapshot interno generado con suma SHA-256 y credenciales preservadas');

// =========================================================================
// TEST 3: Detección de Restauración Interrumpida y Bloqueo de POS
// =========================================================================
console.log('\n--- 3. Prueba: Detección de Restauración Interrumpida y Bloqueo ---');
const storage3 = new MockStorage(initialCommerceData);

// Simular que el sistema inició una restauración y ocurrió un corte en estado APPLYING
const interruptedJournal = {
  journalId: 'jrn_test_corte_123',
  status: JOURNAL_STATUS.APPLYING,
  startedAt: '2026-10-31T18:30:00Z',
  targetBackupId: 'spx-bkp-999',
  snapshotData: snapshot2
};
await saveRecoveryJournal(interruptedJournal, storage3);

const detected3 = await getPendingRecoveryJournal(storage3);
assert.ok(detected3 !== null, 'Debe detectar journal pendiente');
assert.strictEqual(detected3.status, JOURNAL_STATUS.APPLYING, 'Estado debe indicar interrupción en APPLYING');
console.log('  ✅ PASS: Restauración interrumpida detectada; el guardia bloquea la entrada al POS');

// =========================================================================
// TEST 4: Simulación de Corrupción Parcial y Recuperación Exacta (Rollback)
// =========================================================================
console.log('\n--- 4. Prueba: Recuperación Exacta tras Corrupción Parcial ---');
// Simular que el corte dejó datos a medio camino: productos nuevos pero caja rota
storage3.setItem('kioscoprox_products', JSON.stringify([{ id: 999, name: 'Producto Corrupto Incompleto', stock: 0 }]));
storage3.setItem('kioscoprox_caja', JSON.stringify({ isOpen: false, efectivo: 0 }));

const rollbackRes4 = await performIdempotentRollback(snapshot2, storage3);
assert.strictEqual(rollbackRes4.success, true, 'Rollback debe ejecutarse con éxito');

// Verificar que los datos volvieron EXACTAMENTE al estado del snapshot
const restoredProducts = JSON.parse(storage3.getItem('kioscoprox_products'));
assert.strictEqual(restoredProducts.length, 2, 'Productos deben haber vuelto a los 2 originales');
assert.strictEqual(restoredProducts[0].name, 'Alfajor Triple');
assert.strictEqual(restoredProducts[0].stock, 45);

const restoredCaja = JSON.parse(storage3.getItem('kioscoprox_caja'));
assert.strictEqual(restoredCaja.efectivo, 15000, 'Efectivo en caja debe volver al valor exacto previo');
assert.strictEqual(restoredCaja.isOpen, true, 'Estado de apertura debe coincidir');

console.log('  ✅ PASS: Estado anterior recuperado con exactitud absoluta (productos, stock y caja)');

// =========================================================================
// TEST 5: Idempotencia: Rollback Repetido Sin Duplicaciones
// =========================================================================
console.log('\n--- 5. Prueba: Idempotencia (Rollback Repetido Sin Duplicar Datos) ---');
// Ejecutar el rollback por segunda vez sobre el mismo almacenamiento
const rollbackRes5 = await performIdempotentRollback(snapshot2, storage3);
assert.strictEqual(rollbackRes5.success, true, 'Segundo rollback debe ser exitoso');

const doubleRestoredSales = JSON.parse(storage3.getItem('kioscoprox_sales'));
assert.strictEqual(doubleRestoredSales.length, 1, 'No debe duplicar ventas');
assert.strictEqual(doubleRestoredSales[0].id, 1001, 'Venta debe ser la original');

const doubleRestoredCaja = JSON.parse(storage3.getItem('kioscoprox_caja'));
assert.strictEqual(doubleRestoredCaja.movimientos.length, 1, 'No debe duplicar movimientos de caja');
assert.strictEqual(doubleRestoredCaja.efectivo, 15000, 'Efectivo no debe incrementarse');
console.log('  ✅ PASS: Idempotencia comprobada: 0 duplicaciones de ventas, stock ni movimientos');

// =========================================================================
// TEST 6: Rechazo Seguro de Snapshot Dañado o Inexistente
// =========================================================================
console.log('\n--- 6. Prueba: Rechazo Seguro de Snapshot Dañado ---');
const corruptedSnapshot = JSON.parse(JSON.stringify(snapshot2));
corruptedSnapshot.data.kioscoprox_products = 'DATOS_ALTERADOS_FUERA_DE_CHECKSUM';

const corruptedRollback = await performIdempotentRollback(corruptedSnapshot, storage3);
assert.strictEqual(corruptedRollback.success, false, 'Debe abortar si el snapshot está dañado');
assert.ok(corruptedRollback.error.includes('Integridad SHA-256'), 'Error debe advertir violación de integridad');

const nullRollback = await performIdempotentRollback(null, storage3);
assert.strictEqual(nullRollback.success, false, 'Snapshot nulo debe ser rechazado');
console.log('  ✅ PASS: Snapshot dañado rechazado de inmediato antes de tocar almacenamiento');

// =========================================================================
// TEST 7: Preservación de Usuarios, PINs y Licencias Locales
// =========================================================================
console.log('\n--- 7. Prueba: Preservación de Credenciales, PINs y Licencias ---');
// Ejecutar rollback limpio
await performIdempotentRollback(snapshot2, storage3);

const usersAfter = JSON.parse(storage3.getItem('kioscoprox_users'));
assert.strictEqual(usersAfter[0].name, 'Administrador Local');
assert.strictEqual(usersAfter[0].pin, '8844', 'PIN de administrador preservado');
assert.strictEqual(usersAfter[1].name, 'Cajero Mañana');
assert.strictEqual(usersAfter[1].pin, '1122', 'PIN de cajero preservado');

// Verificar que las claves de identidad y licencias locales no fueron mutadas
assert.strictEqual(storage3.getItem('kioscoprox_installation_id'), '061e01d5-a41f-4109-942b-e093e50cb6e2');
assert.strictEqual(storage3.getItem('kioscoprox_license_token'), 'TOKEN-FIRMA-ED25519-PRO-PERMANENTE-LOCAL');
assert.strictEqual(storage3.getItem('kioscoprox_merchant_registration'), JSON.stringify({ registered: true, plan: 'PRO' }));

const bizConfig = JSON.parse(storage3.getItem('kioscoprox_business_config'));
assert.strictEqual(bizConfig.licenseKey, 'CERT_ED25519_PRO_FIRMA_ADMIN');
console.log('  ✅ PASS: 100% de usuarios, PINs locales y licencias Pro preservados sin alteraciones');

// =========================================================================
// TEST 8: Recuperación Interrumpida por Segunda Vez
// =========================================================================
console.log('\n--- 8. Prueba: Recuperación Interrumpida por Segunda Vez ---');
// Simular que el rollback arrancó (RECOVERING) y se cortó la luz otra vez
const secondInterruptedJournal = {
  ...interruptedJournal,
  status: JOURNAL_STATUS.RECOVERING,
  snapshotData: snapshot2
};
await saveRecoveryJournal(secondInterruptedJournal, storage3);

const detected8 = await getPendingRecoveryJournal(storage3);
assert.strictEqual(detected8.status, JOURNAL_STATUS.RECOVERING, 'Detecta interrupción durante el intento de recuperación');

// Reintentar el rollback nuevamente
const recoveryReattempt = await performIdempotentRollback(detected8.snapshotData, storage3);
assert.strictEqual(recoveryReattempt.success, true, 'El reintento de rollback debe culminar con éxito');
console.log('  ✅ PASS: Recuperación ante segunda interrupción superada con éxito');

// =========================================================================
// TEST 9: Cierre Limpio del Journal tras Verificación
// =========================================================================
console.log('\n--- 9. Prueba: Cierre Limpio del Journal (COMMITTED) ---');
await saveRecoveryJournal({ ...secondInterruptedJournal, status: JOURNAL_STATUS.COMMITTED }, storage3);
await clearRecoveryJournal(storage3);

const pendingAfterClear = await getPendingRecoveryJournal(storage3);
assert.strictEqual(pendingAfterClear, null, 'No debe quedar journal pendiente tras completar recuperación');
console.log('  ✅ PASS: Journal marcado como COMMITTED y limpiado limpiamente');

// =========================================================================
// TEST 10: Invarianza Operacional: Cero Efectos Secundarios en Operación Normal
// =========================================================================
console.log('\n--- 10. Prueba: Invarianza en Operación Normal ---');
const cleanStorage = new MockStorage(initialCommerceData);
const checkNormal = await getPendingRecoveryJournal(cleanStorage);
assert.strictEqual(checkNormal, null);

// Comprobar que ninguna entidad fue alterada por el servicio
assert.strictEqual(cleanStorage.getItem('kioscoprox_products'), initialCommerceData.kioscoprox_products);
assert.strictEqual(cleanStorage.getItem('kioscoprox_sales'), initialCommerceData.kioscoprox_sales);
assert.strictEqual(cleanStorage.getItem('kioscoprox_caja'), initialCommerceData.kioscoprox_caja);
console.log('  ✅ PASS: Cero modificaciones en datos comerciales durante operación normal');

console.log('\n================================================================');
console.log('RESULTADO: TODAS LAS PRUEBAS DE LA ETAPA 5B.2 PASARON (10/10 PASS)');
console.log('================================================================\n');

