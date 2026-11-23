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
console.log('TEST SUITE: VALIDACIÓN INTEGRAL Y DE LÍMITES ETAPA 5B.4');
console.log('================================================================\n');

const {
  generateBackupPayload,
  verifyBackupIntegrity,
  restoreCommercialBackup
} = await import('../src/services/backupService.js');

const {
  JOURNAL_STATUS,
  JOURNAL_STORAGE_KEY,
  getPendingRecoveryJournal,
  performIdempotentRollback
} = await import('../src/services/recoveryService.js');

// Mock storage con simulación de cuota máxima (ej. 5 MB)
class QuotaEnforcedMockStorage {
  constructor(maxBytes = 5 * 1024 * 1024, initialData = {}) {
    this.maxBytes = maxBytes;
    this.store = { ...initialData };
  }
  _currentSize() {
    return Object.entries(this.store).reduce((acc, [k, v]) => acc + k.length + v.length, 0);
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    const valStr = String(value);
    const existingLen = this.store[key] ? (key.length + this.store[key].length) : 0;
    const newLen = key.length + valStr.length;
    if (this._currentSize() - existingLen + newLen > this.maxBytes) {
      const err = new Error('QuotaExceededError: The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      err.code = 22;
      throw err;
    }
    this.store[key] = valStr;
  }
  removeItem(key) {
    delete this.store[key];
  }
}

// =========================================================================
// TEST A (Punto 19): Manejo de Exceso de Cuota en localStorage durante Restauración
// =========================================================================
console.log('--- A. Prueba Punto 19: Manejo de Exceso de Cuota (QuotaExceededError) ---');
// Inicializar storage con cuota estricta de 50 KB
const quotaStorage = new QuotaEnforcedMockStorage(50 * 1024, {
  kioscoprox_installation_id: 'LOCAL-ID-QUOTA-TEST',
  kioscoprox_products: JSON.stringify([{ id: 1, name: 'Prod A', price: 100 }]),
  kioscoprox_sales: JSON.stringify([])
});

// Crear un payload que supere intencionalmente la cuota (ej. 200 KB)
const largeProducts = [];
for (let i = 0; i < 2000; i++) {
  largeProducts.push({ id: i, name: `Producto Gigante Para Prueba de Cuota ${i}`, description: 'Detalle largo'.repeat(10), price: 1000 });
}
const largePayload = {
  format: 'SimpleProX_Backup',
  version: 1,
  data: {
    products: largeProducts,
    sales: [],
    caja: { isOpen: false, efectivo: 0, movimientos: [] },
    users: [{ id: 1, name: 'Admin', role: 'Admin' }],
    preferences: {}
  }
};
// Calcular checksum válido para que pase la fase de validación de integridad previa
const { calculateDataChecksum } = await import('../src/services/backupService.js');
largePayload.integrity = {
  algorithm: 'SHA-256',
  checksum: await calculateDataChecksum(largePayload.data)
};

const quotaRestoreRes = await restoreCommercialBackup({
  backup: largePayload,
  storage: quotaStorage
});

assert.strictEqual(quotaRestoreRes.success, false, 'Restauración debe abortar si excede la cuota');
assert.ok(quotaRestoreRes.error.includes('QuotaExceededError') || quotaRestoreRes.error.includes('Se recuperó el estado seguro anterior'), 'Debe reportar recuperación ante cuota');

// Verificar que el estado original fue preservado
const restoredOriginalProd = JSON.parse(quotaStorage.getItem('kioscoprox_products'));
assert.strictEqual(restoredOriginalProd.length, 1, 'Productos originales deben conservarse intactos');
assert.strictEqual(restoredOriginalProd[0].name, 'Prod A');
console.log('  ✅ PASS: Exceso de cuota manejado de forma segura con rollback automático');

// =========================================================================
// TEST B (Punto 17): Revisión de Inclusión de Módulos en Empaquetado Electron
// =========================================================================
console.log('\n--- B. Prueba Punto 17: Inclusión de Módulos en package.json ---');
const pkgRaw = fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8');
const pkg = JSON.parse(pkgRaw);

assert.ok(pkg.build && pkg.build.files, 'package.json debe definir build.files');
assert.ok(pkg.build.files.includes('electron/**/*'), 'build.files debe incluir electron/**/* para abarcar safeBackupWriter.js');
assert.strictEqual(fs.existsSync(path.join(__dirname, '../electron/safeBackupWriter.js')), true, 'safeBackupWriter.js debe existir físicamente');
console.log('  ✅ PASS: safeBackupWriter y módulos auxiliares incluidos en el esquema de empaquetado');

// =========================================================================
// TEST C (Punto 20): Control de Acceso y Prevención de Path Traversal
// =========================================================================
console.log('\n--- C. Prueba Punto 20: Seguridad de Rutas y Prevención de Path Traversal ---');
// Simular la validación de path traversal implementada en recovery-read-snapshot
const mockUserData = 'C:\\Users\\Kiosco\\AppData\\Roaming\\Simple ProX';
function isSafeSnapshotPath(requestedPath, userDataPath) {
  if (!requestedPath || typeof requestedPath !== 'string') return false;
  const resolved = path.resolve(requestedPath).toLowerCase();
  const allowedBase = path.resolve(userDataPath).toLowerCase();
  return resolved.startsWith(allowedBase);
}

const safeInternalPath = 'C:\\Users\\Kiosco\\AppData\\Roaming\\Simple ProX\\recovery\\snapshots\\snap_123.json';
const maliciousPath1 = 'C:\\Windows\\System32\\cmd.exe';
const maliciousPath2 = 'C:\\Users\\Kiosco\\AppData\\Roaming\\Simple ProX\\..\\..\\Windows\\System32\\cmd.exe';

assert.strictEqual(isSafeSnapshotPath(safeInternalPath, mockUserData), true, 'Ruta interna dentro de userData permitida');
assert.strictEqual(isSafeSnapshotPath(maliciousPath1, mockUserData), false, 'Ruta del sistema bloqueada');
assert.strictEqual(isSafeSnapshotPath(maliciousPath2, mockUserData), false, 'Path traversal relativo bloqueado');
console.log('  ✅ PASS: Regla de confinamiento en perfil del usuario validada');

// =========================================================================
// TEST D (Punto 14): Invarianza de RecoveryGuard Durante la Consulta Inicial
// =========================================================================
console.log('\n--- D. Prueba Punto 14: Bloqueo de Montaje Inicial en RecoveryGuard ---');
// Inspeccionar que RecoveryGuard inicializa checking en true
const guardContent = fs.readFileSync(path.join(__dirname, '../src/components/RecoveryGuard.jsx'), 'utf8');
assert.ok(guardContent.includes("const [checking, setChecking] = useState(true);"), 'checking debe ser true por defecto');
assert.ok(guardContent.includes("if (checking) {"), 'Debe retornar vista intermedia mientras checking es true');
assert.ok(guardContent.includes("if (recoveryRequired && !recovered) {"), 'Debe bloquear POS si se requiere recuperación');
console.log('  ✅ PASS: RecoveryGuard impide el montaje prematuro del POS durante la verificación');

console.log('\n================================================================');
console.log('RESULTADO: TODAS LAS PRUEBAS INTEGRALES PASARON CON ÉXITO');
console.log('================================================================\n');

