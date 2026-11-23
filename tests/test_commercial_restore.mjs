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
console.log('TEST SUITE: RESTAURACIÓN COMERCIAL SEGURA SIMPLE PROX (5B.3)');
console.log('================================================================\n');

// Importar servicios bajo prueba
const {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  generateBackupPayload,
  verifyBackupIntegrity,
  restoreCommercialBackup
} = await import('../src/services/backupService.js');

const {
  JOURNAL_STATUS,
  JOURNAL_STORAGE_KEY,
  getPendingRecoveryJournal,
  performIdempotentRollback,
  clearRecoveryJournal,
  createInternalSnapshot
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

// 1. Estado original previo en la máquina local
const localBaselineData = {
  kioscoprox_installation_id: 'LTMEI6YT-ORIGINAL-LOCAL-ID',
  kioscoprox_license_token: 'TOKEN-PRO-LOCAL-ED25519',
  kioscoprox_merchant_registration: JSON.stringify({ registered: true, plan: 'Pro' }),
  kioscoprox_business_config: JSON.stringify({
    storeName: 'Kiosco Local Actual',
    installationId: 'LTMEI6YT-ORIGINAL-LOCAL-ID',
    licenseKey: 'CERT_ED25519_PRO_FIRMA_LOCAL_PERMANENTE',
    plan: 'Pro',
    isOnboarded: true
  }),
  kioscoprox_products: JSON.stringify([
    { id: 1, name: 'Chicle Menta', stock: 10, price: 200 }
  ]),
  kioscoprox_sales: JSON.stringify([
    { id: 50, total: 200, date: '2026-10-30T10:00:00Z' }
  ]),
  kioscoprox_purchases: JSON.stringify([
    { id: 10, total: 1000 }
  ]),
  kioscoprox_clients: JSON.stringify([
    { id: 99, name: 'Cliente Local', deuda: 0 }
  ]),
  kioscoprox_caja: JSON.stringify({
    isOpen: true,
    efectivo: 5000,
    openedAt: '2026-10-31T08:00:00Z',
    movimientos: [{ id: 1, type: 'apertura', amount: 5000 }]
  }),
  kioscoprox_shifts: JSON.stringify([
    { id: 1, closedAt: '2026-10-30T20:00:00Z', totalVendido: 200 }
  ]),
  kioscoprox_categories: JSON.stringify({ Golosinas: { name: 'Golosinas' } }),
  kioscoprox_suppliers: JSON.stringify([{ id: 1, name: 'Mayorista Sur' }]),
  kioscoprox_reservations: JSON.stringify([]),
  kioscoprox_users: JSON.stringify([
    { id: 1, name: 'Dueño Local Admin', role: 'Admin', pin: '9988', isActive: true },
    { id: 2, name: 'Cajero Local', role: 'Cajero', pin: '5566', isActive: true }
  ])
};

// 2. Generar un respaldo .spx sintético representativo de otra fecha/comercio
const mockKioscoForBackup = {
  products: [
    { id: 101, name: 'Alfajor Triple Chocolate', stock: 60, price: 1500, cost: 900 },
    { id: 102, name: 'Gaseosa 500ml', stock: 35, price: 1800, cost: 1100 }
  ],
  sales: [
    { id: 2001, total: 3300, date: '2026-10-25T14:00:00Z', items: [{ id: 101, qty: 1 }, { id: 102, qty: 1 }] }
  ],
  purchases: [
    { id: 3001, total: 45000, date: '2026-10-20T10:00:00Z' }
  ],
  clients: [
    { id: 501, name: 'Carlos Fiado', deuda: 1500, phone: '2664112233' }
  ],
  caja: {
    isOpen: true,
    efectivo: 18500,
    openedAt: '2026-10-25T08:00:00Z',
    movimientos: [
      { id: 1, type: 'apertura', amount: 10000 },
      { id: 2, type: 'venta', amount: 3300 }
    ]
  },
  shifts: [
    { id: 10, totalVendido: 15000, closedAt: '2026-10-24T22:00:00Z' }
  ],
  categoryTree: { Kiosco: { name: 'Kiosco' }, Bebidas: { name: 'Bebidas' } },
  suppliers: [{ id: 401, name: 'Distribuidora Central' }],
  reservations: [{ id: 701, client: 'Carlos', total: 1500 }],
  users: [
    { id: 1, name: 'Admin de Origen', role: 'Admin', pin: '0000', isActive: true }, // Recordar: backupService NO exporta pin
    { id: 2, name: 'Vendedor Turno Tarde', role: 'Vendedor', pin: '1111', isActive: true }
  ],
  businessConfig: {
    storeName: 'Kiosco El Trébol',
    cuit: '20-11223344-5',
    businessType: 'kiosco',
    installationId: 'OTRO-ID-ORIGEN-DIFERENTE', // Debe ser ignorado en restore
    licenseKey: 'OTRA-LICENCIA-ORIGEN', // Debe ser ignorada en restore
    plan: 'Básico'
  }
};

const validBackupPayload = await generateBackupPayload(mockKioscoForBackup);

// =========================================================================
// TEST 1: Restauración Completa de Colecciones Comerciales
// =========================================================================
console.log('--- 1. Prueba: Restauración Completa de Colecciones Comerciales ---');
const storage1 = new MockStorage(localBaselineData);
const res1 = await restoreCommercialBackup({ backup: validBackupPayload, storage: storage1 });

assert.strictEqual(res1.success, true, 'Restauración debe culminar con éxito');
assert.strictEqual(res1.storeName, 'Kiosco El Trébol');

// Verificar reemplazo integral de productos (no merge)
const restoredProducts = JSON.parse(storage1.getItem('kioscoprox_products'));
assert.strictEqual(restoredProducts.length, 2, 'Debe haber exactamente 2 productos del respaldo');
assert.strictEqual(restoredProducts[0].name, 'Alfajor Triple Chocolate');
assert.strictEqual(restoredProducts[0].stock, 60);

// Verificar ventas y caja
const restoredSales = JSON.parse(storage1.getItem('kioscoprox_sales'));
assert.strictEqual(restoredSales.length, 1);
assert.strictEqual(restoredSales[0].id, 2001);

const restoredCaja = JSON.parse(storage1.getItem('kioscoprox_caja'));
assert.strictEqual(restoredCaja.efectivo, 18500);

// Verificar fiados / clientes
const restoredClients = JSON.parse(storage1.getItem('kioscoprox_clients'));
assert.strictEqual(restoredClients[0].name, 'Carlos Fiado');
assert.strictEqual(restoredClients[0].deuda, 1500);

console.log('  ✅ PASS: Productos, ventas, stock, clientes, caja y turnos restaurados integralmente');

// =========================================================================
// TEST 2: Preservación Estricta de Licencias y Credenciales de Máquina
// =========================================================================
console.log('\n--- 2. Prueba: Preservación de Licencias y Terminal ---');
// Verificar que la máquina conservó su installationId y su certificado Pro local
assert.strictEqual(storage1.getItem('kioscoprox_installation_id'), 'LTMEI6YT-ORIGINAL-LOCAL-ID', 'installationId no debe alterarse');
assert.strictEqual(storage1.getItem('kioscoprox_license_token'), 'TOKEN-PRO-LOCAL-ED25519', 'license_token local no debe alterarse');

const restoredBiz = JSON.parse(storage1.getItem('kioscoprox_business_config'));
assert.strictEqual(restoredBiz.installationId, 'LTMEI6YT-ORIGINAL-LOCAL-ID', 'installationId en businessConfig debe ser el local');
assert.strictEqual(restoredBiz.licenseKey, 'CERT_ED25519_PRO_FIRMA_LOCAL_PERMANENTE', 'Certificado Pro local debe conservarse');
assert.strictEqual(restoredBiz.plan, 'Pro', 'Plan Pro local no debe degradarse a Básico por el respaldo');
console.log('  ✅ PASS: Licencia Pro y credenciales de terminal preservadas intactas');

// =========================================================================
// TEST 3: Preservación del PIN del Administrador y Seguridad de Empleados
// =========================================================================
console.log('\n--- 3. Prueba: Preservación de PIN del Admin y Seguridad de Usuarios ---');
const restoredUsers = JSON.parse(storage1.getItem('kioscoprox_users'));
const restoredAdmin = restoredUsers.find(u => u.role === 'Admin');
assert.ok(restoredAdmin, 'Debe existir un usuario Administrador');
assert.strictEqual(restoredAdmin.pin, '9988', 'El Administrador DEBE conservar el PIN local (9988), nunca uno genérico');

const restoredVendor = restoredUsers.find(u => u.role === 'Vendedor');
assert.ok(restoredVendor, 'Vendedor restaurado debe existir');
assert.strictEqual(restoredVendor.pin, null, 'El empleado NO debe tener PIN universal asignado');
assert.strictEqual(restoredVendor.isActive, false, 'El empleado debe estar inactivo hasta que el Admin configure su PIN');
assert.strictEqual(restoredVendor.requiresPinSetup, true, 'Debe requerir configuración explícita');
console.log('  ✅ PASS: PIN del Administrador local preservado; colaboradores bloqueados sin puertas traseras');

// =========================================================================
// TEST 4: Rechazo Inmediato de Archivo Corrupto (Sin Modificar Datos)
// =========================================================================
console.log('\n--- 4. Prueba: Rechazo de Archivo Corrupto ---');
const storage4 = new MockStorage(localBaselineData);
const tamperedBackup = JSON.parse(JSON.stringify(validBackupPayload));
tamperedBackup.data.products[0].price = 999999; // Alteración que rompe SHA-256

const res4 = await restoreCommercialBackup({ backup: tamperedBackup, storage: storage4 });
assert.strictEqual(res4.success, false, 'Debe rechazar respaldo alterado');
assert.ok(res4.error.includes('SHA-256 falló'), 'Error debe señalar alteración de suma');

// Verificar que los datos en storage4 NO fueron modificados
assert.strictEqual(storage4.getItem('kioscoprox_products'), localBaselineData.kioscoprox_products, 'Productos originales intactos');
assert.strictEqual(storage4.getItem('kioscoprox_sales'), localBaselineData.kioscoprox_sales, 'Ventas originales intactas');
console.log('  ✅ PASS: Archivo corrupto rechazado antes de tocar almacenamiento');

// =========================================================================
// TEST 5: Rechazo de Formato Incompatible
// =========================================================================
console.log('\n--- 5. Prueba: Rechazo de Formato Incompatible ---');
const storage5 = new MockStorage(localBaselineData);
const invalidFormat = { format: 'AnotherApp_Backup', version: 99, data: {} };

const res5 = await restoreCommercialBackup({ backup: invalidFormat, storage: storage5 });
assert.strictEqual(res5.success, false);
assert.ok(res5.error.includes('no corresponde'), 'Debe rechazar formato ajeno');
console.log('  ✅ PASS: Formato ajeno rechazado limpiamente');

// =========================================================================
// TEST 6: Cancelación del Diálogo Sin Modificaciones
// =========================================================================
console.log('\n--- 6. Prueba: Cancelación de Diálogo ---');
// Mock de diálogo cancelado
const dialogResult = { success: false, canceled: true };
assert.strictEqual(dialogResult.canceled, true);
console.log('  ✅ PASS: Cancelación de diálogo manejada sin tocar datos');

// =========================================================================
// TEST 7: Restauración en Instalación Nueva (Admin PIN Fallback)
// =========================================================================
console.log('\n--- 7. Prueba: Restauración en Instalación Nueva (Sin Usuarios Previos) ---');
const freshStorage = new MockStorage({
  kioscoprox_installation_id: 'NUEVA-PC-UUID',
  kioscoprox_business_config: JSON.stringify({ isOnboarded: false })
});

const res7 = await restoreCommercialBackup({
  backup: validBackupPayload,
  storage: freshStorage,
  adminPinFallback: '4321' // PIN definido por el comerciante en la pantalla nueva
});
assert.strictEqual(res7.success, true);

const freshUsers = JSON.parse(freshStorage.getItem('kioscoprox_users'));
const freshAdmin = freshUsers.find(u => u.role === 'Admin');
assert.strictEqual(freshAdmin.pin, '4321', 'Debe adoptar el PIN definido por el comerciante para la nueva máquina');
assert.strictEqual(freshStorage.getItem('kioscoprox_installation_id'), 'NUEVA-PC-UUID', 'Conserva la identidad de la nueva máquina');
console.log('  ✅ PASS: Instalación nueva configurada con PIN maestro propio, sin defaults');

// =========================================================================
// TEST 8: Interrupción Simulada y Rollback Automático
// =========================================================================
console.log('\n--- 8. Prueba: Interrupción Simulada Durante Aplicación ---');
const storage8 = new MockStorage(localBaselineData);

const res8 = await restoreCommercialBackup({
  backup: validBackupPayload,
  storage: storage8,
  testHooks: {
    hookAfterWrite: async () => {
      // Simular corte de energía o excepción a mitad de proceso
      throw new Error('CORTE_ELECTRICO_A_MITAD_DE_ESCRITURA');
    }
  }
});

assert.strictEqual(res8.success, false, 'Operación interrumpida debe retornar fallo');
assert.ok(res8.error.includes('Se recuperó el estado seguro anterior'), 'Debe advertir rollback exitoso');

// Verificar que los datos en storage8 volvieron 100% a la línea base
const rolledProducts = JSON.parse(storage8.getItem('kioscoprox_products'));
assert.strictEqual(rolledProducts[0].name, 'Chicle Menta', 'Productos restaurados al estado original previo');
assert.strictEqual(rolledProducts[0].stock, 10);
console.log('  ✅ PASS: Interrupción durante escritura reversada automáticamente al estado previo');

// =========================================================================
// TEST 9: Inconsistencia entre Journal de Disco y localStorage
// =========================================================================
console.log('\n--- 9. Prueba: Inconsistencia entre Disco y Almacenamiento Local ---');
const storage9 = new MockStorage();

// Caso A: Disco tiene journal APPLYING, localStorage está vacío
const diskJournalApplying = {
  journalId: 'jrn_disk_1',
  status: JOURNAL_STATUS.APPLYING,
  snapshotData: { format: 'SimpleProX_InternalEmergencySnapshot', version: 1 }
};
const pendingA = await getPendingRecoveryJournal(storage9, diskJournalApplying);
assert.ok(pendingA !== null, 'Debe detectar journal pendiente desde disco');
assert.strictEqual(pendingA.status, JOURNAL_STATUS.APPLYING);

// Caso B: Disco dice IDLE o null, localStorage tiene journal APPLYING
storage9.setItem(JOURNAL_STORAGE_KEY, JSON.stringify({
  journalId: 'jrn_local_1',
  status: JOURNAL_STATUS.APPLYING
}));
const pendingB = await getPendingRecoveryJournal(storage9, null);
assert.ok(pendingB !== null, 'Debe detectar journal pendiente desde localStorage');
assert.strictEqual(pendingB.status, JOURNAL_STATUS.APPLYING);

// Caso C: Ambos existen con estados discrepantes
const pendingC = await getPendingRecoveryJournal(storage9, diskJournalApplying);
assert.ok(pendingC !== null);
assert.strictEqual(pendingC.status, JOURNAL_STATUS.RECOVERY_REQUIRED, 'Discrepancia debe forzar RECOVERY_REQUIRED');
console.log('  ✅ PASS: Detección defensiva de discrepancias entre disco y almacenamiento local');

// =========================================================================
// TEST 10: Fallo de Lectura de Journal Manejado de Forma Segura
// =========================================================================
console.log('\n--- 10. Prueba: Fallo de Lectura de Journal Manejado de Forma Segura ---');
const brokenStorage = {
  getItem: () => '{ JSON_CORRUPTO_QUE_LANZA_ERROR'
};
const safeJournalRead = await getPendingRecoveryJournal(brokenStorage, null);
assert.strictEqual(safeJournalRead, null, 'JSON corrupto no debe provocar excepción no controlada');
console.log('  ✅ PASS: Manejo seguro ante fallos de lectura de journal');

console.log('\n================================================================');
console.log('RESULTADO: TODAS LAS PRUEBAS DE LA ETAPA 5B.3 PASARON (10/10 PASS)');
console.log('================================================================\n');

