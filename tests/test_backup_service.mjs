import assert from 'node:assert';
import * as crypto from 'node:crypto';

// Polyfills para entorno de pruebas Node.js
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.window = {
  crypto: global.crypto,
  addEventListener: () => {},
  removeEventListener: () => {}
};

console.log('====================================================');
console.log('TEST SUITE: SERVICIO DE RESPALDO COMERCIAL (ETAPA 5A)');
console.log('====================================================\n');

// Import del servicio bajo prueba
const {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  generateBackupPayload,
  verifyBackupIntegrity,
  exportBackupToFile,
  calculateDataChecksum
} = await import('../src/services/backupService.js');

// 1. Datos comerciales sintéticos representativos de un kiosco real
const mockKiosco = {
  products: [
    { id: 101, name: 'Alfajor Triple', code: '779123456789', price: 1200, cost: 700, stock: 45, category: 'Golosinas' },
    { id: 102, name: 'Gaseosa Cola 500ml', code: '779987654321', price: 1500, cost: 950, stock: 20, category: 'Bebidas' }
  ],
  sales: [
    { id: 1001, total: 2700, method: 'Efectivo', date: '2026-10-31T12:30:00.000Z', items: [{ id: 101, qty: 1 }, { id: 102, qty: 1 }] },
    { id: 1002, total: 1200, method: 'Fiado', clientId: 501, date: '2026-10-31T14:15:00.000Z', items: [{ id: 101, qty: 1 }] }
  ],
  purchases: [
    { id: 2001, total: 35000, supplierId: 301, date: '2026-10-25T10:00:00.000Z', items: [{ id: 101, qty: 50 }] }
  ],
  clients: [
    { id: 501, name: 'Juan Pérez', phone: '2664000000', cuit: '20-30400500-8', deuda: 1200 },
    { id: 502, name: 'María Gómez', phone: '2664111111', cuit: '27-25100200-4', deuda: 0 }
  ],
  caja: {
    isOpen: true,
    efectivo: 14500,
    openedAt: '2026-10-31T08:00:00.000Z',
    movimientos: [
      { id: 1, type: 'apertura', amount: 5000, date: '2026-10-31T08:00:00.000Z' },
      { id: 2, type: 'venta', amount: 2700, date: '2026-10-31T12:30:00.000Z' }
    ]
  },
  shifts: [
    { id: 901, openedAt: '2026-10-30T08:00:00.000Z', closedAt: '2026-10-30T21:00:00.000Z', totalVentas: 85000 }
  ],
  categoryTree: {
    Golosinas: ['Chocolates', 'Alfajores'],
    Bebidas: ['Gaseosas', 'Aguas']
  },
  suppliers: [
    { id: 301, name: 'Distribuidora San Luis', phone: '2664555555', contact: 'Carlos' }
  ],
  reservations: [
    { id: 701, clientName: 'Lucas', total: 5000, status: 'Pendiente' }
  ],
  users: [
    { id: 1, name: 'Admin Kiosco', role: 'Admin', pin: '1234', email: 'admin@kiosco.com', isActive: true },
    { id: 2, name: 'Cajero Tarde', role: 'Cajero', pin: '9876', email: '', isActive: true }
  ],
  businessConfig: {
    installationId: 'INST-SECRET-UUID-DO-NOT-EXPORT',
    licenseKey: 'PRO-TOKEN-DO-NOT-EXPORT-eyJhbGciOi...',
    storeName: 'Kiosco Central San Luis',
    businessType: 'kiosco',
    cuit: '20-12345678-9',
    address: 'Av. Illia 123',
    phone: '2664223344',
    ticketFooter: '¡Gracias por su compra!',
    isActivated: true,
    isOnboarded: true,
    activationData: { secretKey: 'SECRET-DO-NOT-EXPORT' }
  }
};

// =========================================================================
// TEST 1: Generación de Respaldo Completo y Estructurado
// =========================================================================
console.log('--- 1. Prueba: Generación de Respaldo Completo con Entidades Comerciales ---');
const payload1 = await generateBackupPayload(mockKiosco);

assert.strictEqual(payload1.format, BACKUP_FORMAT, 'Debe tener formato SimpleProX_Backup');
assert.strictEqual(payload1.version, BACKUP_VERSION, 'Debe tener versión 1');
assert.ok(payload1.backupId && payload1.backupId.startsWith('spx-bkp-'), 'Debe generar un backupId único');
assert.strictEqual(payload1.summary.productsCount, 2, 'Debe contar 2 productos');
assert.strictEqual(payload1.summary.salesCount, 2, 'Debe contar 2 ventas');
assert.strictEqual(payload1.summary.clientsCount, 2, 'Debe contar 2 clientes');
assert.strictEqual(payload1.summary.purchasesCount, 1, 'Debe contar 1 compra');
assert.strictEqual(payload1.summary.shiftsCount, 1, 'Debe contar 1 turno');
assert.strictEqual(payload1.summary.isCajaOpen, true, 'Debe reflejar estado de caja abierta');
assert.strictEqual(payload1.summary.efectivoEnCaja, 14500, 'Debe reflejar efectivo exacto');
console.log('  ✅ PASS: Respaldo estructurado generado con todos los contadores exactos');

// =========================================================================
// TEST 2: Verificación de Integridad Criptográfica SHA-256
// =========================================================================
console.log('\n--- 2. Prueba: Verificación de Integridad Criptográfica SHA-256 ---');
const verifyRes1 = await verifyBackupIntegrity(payload1);
assert.strictEqual(verifyRes1.valid, true, 'El respaldo legítimo debe ser 100% válido');
assert.strictEqual(verifyRes1.error, null, 'No debe tener error');
assert.strictEqual(verifyRes1.storeName, 'Kiosco Central San Luis', 'Nombre de comercio coincide');

// Verificar que como string JSON también valida
const jsonStr = JSON.stringify(payload1);
const verifyResJson = await verifyBackupIntegrity(jsonStr);
assert.strictEqual(verifyResJson.valid, true, 'Respaldo serializado en string JSON debe validar');
console.log('  ✅ PASS: Integridad SHA-256 calculada y verificada con éxito');

// =========================================================================
// TEST 3: Respaldo con Caja Cerrada
// =========================================================================
console.log('\n--- 3. Prueba: Respaldo con Caja Cerrada ---');
const mockKioscoCerrado = {
  ...mockKiosco,
  caja: { isOpen: false, efectivo: 0, openedAt: null, movimientos: [] }
};
const payloadCerrado = await generateBackupPayload(mockKioscoCerrado);
assert.strictEqual(payloadCerrado.summary.isCajaOpen, false, 'Caja debe estar cerrada');
assert.strictEqual(payloadCerrado.summary.efectivoEnCaja, 0, 'Efectivo debe ser 0');
const verifyCerrado = await verifyBackupIntegrity(payloadCerrado);
assert.strictEqual(verifyCerrado.valid, true, 'Caja cerrada debe validar');
console.log('  ✅ PASS: Estado de caja cerrada registrado y verificado correctamente');

// =========================================================================
// TEST 4: Respaldo 100% Offline (Sin red)
// =========================================================================
console.log('\n--- 4. Prueba: Operación 100% Offline (Red Bloqueada) ---');
const originalFetch = global.fetch;
global.fetch = () => {
  throw new Error('VIOLACIÓN OFFLINE: fetch() no debe ser invocado');
};

try {
  const offlinePayload = await generateBackupPayload(mockKiosco);
  const offlineVerify = await verifyBackupIntegrity(offlinePayload);
  assert.strictEqual(offlineVerify.valid, true, 'Debe operar 100% offline');
  console.log('  ✅ PASS: Respaldo y verificación operan sin requerir internet');
} finally {
  global.fetch = originalFetch;
}

// =========================================================================
// TEST 5: Detección Inmediata de Alteración de Datos (Anti-Tampering)
// =========================================================================
console.log('\n--- 5. Prueba: Detección Inmediata de Adulteración (Tampering) ---');
const tamperedPayload = JSON.parse(JSON.stringify(payload1));
// Alterar un dato comercial (ej. modificar deuda de un cliente de 1200 a 0)
tamperedPayload.data.clients[0].deuda = 0;

const tamperedVerify = await verifyBackupIntegrity(tamperedPayload);
assert.strictEqual(tamperedVerify.valid, false, 'Copia alterada debe ser rechazada');
assert.ok(tamperedVerify.error.includes('SHA-256 falló'), 'Error debe indicar falla de suma de comprobación');
console.log('  ✅ PASS: Alteración de datos detectada y rechazada');

// =========================================================================
// TEST 6: Ausencia Estricta de Secretos y Licencias en el Respaldo
// =========================================================================
console.log('\n--- 6. Prueba: Ausencia Estricta de Secretos, Licencias y PINs ---');
const fullBackupStr = JSON.stringify(payload1);

assert.strictEqual(fullBackupStr.includes('INST-SECRET-UUID-DO-NOT-EXPORT'), false, 'installationId no debe figurar en el respaldo');
assert.strictEqual(fullBackupStr.includes('PRO-TOKEN-DO-NOT-EXPORT'), false, 'licenseKey Pro no debe figurar en el respaldo');
assert.strictEqual(fullBackupStr.includes('SECRET-DO-NOT-EXPORT'), false, 'activationData no debe figurar en el respaldo');
assert.strictEqual(fullBackupStr.includes('"pin":'), false, 'PIN de usuarios no debe figurar en el respaldo');
assert.strictEqual(fullBackupStr.includes('KioscoProX_Secret_2026'), false, 'Secret salt no debe figurar');

// Verificar estructura de usuarios exportados
payload1.data.users.forEach(u => {
  assert.strictEqual(u.pin, undefined, `Usuario ${u.name} no debe contener atributo pin`);
  assert.ok(u.id && u.name && u.role, 'Usuario debe conservar campos no sensibles');
});
console.log('  ✅ PASS: Cero secretos, cero licencias, cero PINs en el archivo exportable');

// =========================================================================
// TEST 7: Inmutabilidad de los Datos Originales
// =========================================================================
console.log('\n--- 7. Prueba: Inmutabilidad de los Datos Originales (Sin Efectos Secundarios) ---');
const originalProductsLength = mockKiosco.products.length;
const originalSalesLength = mockKiosco.sales.length;
const originalCajaEfectivo = mockKiosco.caja.efectivo;

await generateBackupPayload(mockKiosco);

assert.strictEqual(mockKiosco.products.length, originalProductsLength, 'Productos no deben cambiar');
assert.strictEqual(mockKiosco.sales.length, originalSalesLength, 'Ventas no deben cambiar');
assert.strictEqual(mockKiosco.caja.efectivo, originalCajaEfectivo, 'Caja no debe cambiar');
console.log('  ✅ PASS: Los datos comerciales originales permanecen intactos');

// =========================================================================
// TEST 8: Manejo de Cancelación del Diálogo de Guardado en Electron
// =========================================================================
console.log('\n--- 8. Prueba: Manejo de Cancelación de Diálogo de Guardado ---');
// Mock de window.api con diálogo cancelado
global.window.api = {
  saveBackupFile: async () => ({ success: false, canceled: true })
};

const cancelResult = await exportBackupToFile(mockKiosco);
assert.strictEqual(cancelResult.success, false, 'No debe reportar éxito');
assert.strictEqual(cancelResult.canceled, true, 'Debe indicar canceled: true');
console.log('  ✅ PASS: Cancelación de diálogo manejada de forma limpia');

// =========================================================================
// TEST 9: Manejo de Error de Escritura en Disco en Electron
// =========================================================================
console.log('\n--- 9. Prueba: Manejo de Error de Disco Lleno / Permisos Denegados ---');
// Mock de window.api con error de filesystem
global.window.api = {
  saveBackupFile: async () => ({ success: false, error: 'ENOSPC: no space left on device, write' })
};

const errorResult = await exportBackupToFile(mockKiosco);
assert.strictEqual(errorResult.success, false, 'Debe reportar fallo');
assert.ok(errorResult.error.includes('ENOSPC'), 'Debe propagar el error de forma segura');
console.log('  ✅ PASS: Fallos de escritura reportados sin excepciones no controladas');

// =========================================================================
// TEST 10: Exportación Exitosa con Diálogo de Windows (Electron)
// =========================================================================
console.log('\n--- 10. Prueba: Exportación Exitosa en Disco ---');
let savedFileName = null;
let savedContent = null;

global.window.api = {
  saveBackupFile: async ({ defaultFileName, fileContent }) => {
    savedFileName = defaultFileName;
    savedContent = fileContent;
    return { success: true, filePath: `C:\\Users\\Kiosco\\Documents\\${defaultFileName}` };
  }
};

const successResult = await exportBackupToFile(mockKiosco);
assert.strictEqual(successResult.success, true, 'Debe reportar éxito');
assert.ok(successResult.filePath.includes('.spx'), 'Ruta debe terminar en .spx');
assert.strictEqual(typeof savedContent, 'string', 'Contenido debe ser un string JSON');

// Validar que el archivo que se guardó en disco es íntegro
const diskValidation = await verifyBackupIntegrity(savedContent);
assert.strictEqual(diskValidation.valid, true, 'El archivo escrito en disco debe ser válido y verificable');
console.log('  ✅ PASS: Archivo .spx escrito y validado exitosamente');

console.log('\n====================================================');
console.log('RESULTADO: TODAS LAS PRUEBAS DE LA ETAPA 5A PASARON (10/10 PASS)');
console.log('====================================================');

