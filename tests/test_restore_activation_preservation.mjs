import assert from 'node:assert';
import * as crypto from 'node:crypto';
import { generateTestKeyPair, generateLicenseToken } from '../admin-tools/licenseGenerator.js';

// Polyfills para entorno de pruebas Node.js
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.window = { crypto: global.crypto };

console.log('================================================================');
console.log('TEST SUITE: PRESERVACIÓN DE ACTIVACIÓN EN RESTAURACIÓN (FASE 5B.13)');
console.log('================================================================\n');

// 1. Configurar par de llaves Ed25519 para Básico y Pro
const basicKeyPair = generateTestKeyPair();
const basicPublicKeyJwk = basicKeyPair.publicKey.export({ format: 'jwk' });
const proKeyPair = generateTestKeyPair();
const proPublicKeyJwk = proKeyPair.publicKey.export({ format: 'jwk' });

globalThis.__TEST_BASIC_PUBLIC_KEY_JWK__ = basicPublicKeyJwk;
globalThis.__TEST_PUBLIC_KEY_JWK__ = proPublicKeyJwk;
process.env.NODE_ENV = 'test';

const { restoreCommercialBackup, generateBackupPayload } = await import('../src/services/backupService.js');
const { verifyBasicActivationCertificate } = await import('../src/utils/licenseCrypto.js');

// Mock in-memory storage para simular localStorage
class MockStorage {
  constructor(initial = {}) {
    this.store = { ...initial };
  }
  getItem(k) { return this.store[k] ?? null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
  get length() { return Object.keys(this.store).length; }
  key(i) { return Object.keys(this.store)[i] || null; }
}

// Helper para emitir certificado básico Ed25519 válido
function createBasicToken(privateKey, installationId) {
  const payload = {
    version: 1,
    type: 'initial_activation',
    plan: 'Básico',
    installationId,
    issuedAt: new Date().toISOString(),
    installationData: { negocio: 'Kiosco Test', instalador: 'Tester' }
  };
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const signatureBytes = crypto.sign(null, payloadBytes, privateKey);
  return `${global.btoa(payloadBytes.toString('binary'))}.${global.btoa(signatureBytes.toString('binary'))}`;
}

const localId = 'LOCAL-RECEIVING-TERMINAL-123';
const foreignId = 'FOREIGN-DONOR-TERMINAL-999';

// Construir un respaldo origen (ficticio o de otra terminal)
const donorBackupPayload = await generateBackupPayload({
  products: [{ id: 'p1', name: 'Caramelo Donado', price: 100, stock: 10 }],
  sales: [],
  purchases: [],
  clients: [],
  caja: { isOpen: false, efectivo: 0 },
  shifts: [],
  categoryTree: {},
  suppliers: [],
  reservations: [],
  users: [{ id: 1, name: 'Admin Donante', role: 'Admin', pin: '9999', isActive: true }],
  businessConfig: {
    installationId: foreignId,
    storeName: 'Kiosco Donante Foráneo',
    isActivated: true, // El respaldo donante tenía su propia activación
    activationData: { negocio: 'Kiosco Donante', instalador: 'Foráneo' },
    plan: 'Básico'
  }
});

// =========================================================================
// PRUEBA A: Terminal activada con certificado válido conserva su activación
// =========================================================================
console.log('--- Prueba A: Terminal Activada Conserva su Activación tras Restaurar ---');
const validToken = createBasicToken(basicKeyPair.privateKey, localId);
const localActivationData = { negocio: 'Mi Kiosco Local', instalador: 'Técnico Autorizado' };

const storageA = new MockStorage({
  'kioscoprox_installation_id': localId,
  'kioscoprox_license_token': validToken,
  'kioscoprox_business_config': JSON.stringify({
    installationId: localId,
    isActivated: true,
    activationData: localActivationData,
    plan: 'Básico',
    isOnboarded: true
  }),
  'kioscoprox_users': JSON.stringify([{ id: 1, name: 'Admin Local', role: 'Admin', pin: '1234', isActive: true }])
});

const resA = await restoreCommercialBackup({
  backup: donorBackupPayload,
  storage: storageA
});

assert.strictEqual(resA.success, true, 'La restauración debe ser exitosa');
const restoredBizA = JSON.parse(storageA.getItem('kioscoprox_business_config'));
assert.strictEqual(restoredBizA.isActivated, true, 'isActivated DEBE permanecer en true');
assert.strictEqual(restoredBizA.installationId, localId, 'installationId debe ser el local');
assert.deepStrictEqual(restoredBizA.activationData, localActivationData, 'activationData local debe conservarse');
assert.strictEqual(storageA.getItem('kioscoprox_license_token'), validToken, 'El token Ed25519 debe permanecer intacto');
console.log('  ✅ PASS: Terminal activada conserva isActivated: true, su installationId y su token');

// =========================================================================
// PRUEBA B: Terminal no activada: la restauración no puede activarla
// =========================================================================
console.log('--- Prueba B: Terminal No Activada Permanece No Activada (Sin Auto-Activación) ---');
const storageB = new MockStorage({
  'kioscoprox_installation_id': localId,
  // Sin token
  'kioscoprox_business_config': JSON.stringify({
    installationId: localId,
    isActivated: false,
    plan: 'Básico'
  }),
  'kioscoprox_users': JSON.stringify([{ id: 1, name: 'Admin', role: 'Admin', pin: '1234', isActive: true }])
});

const resB = await restoreCommercialBackup({
  backup: donorBackupPayload,
  storage: storageB
});

assert.strictEqual(resB.success, true);
const restoredBizB = JSON.parse(storageB.getItem('kioscoprox_business_config'));
assert.strictEqual(restoredBizB.isActivated, false, 'isActivated DEBE permanecer en false si originalmente era false');
assert.strictEqual(restoredBizB.activationData, null, 'activationData debe ser null');
console.log('  ✅ PASS: Terminal no activada NO es activada por restaurar un respaldo');

// =========================================================================
// PRUEBA C: Terminal con isActivated ausente: no asigna true automáticamente
// =========================================================================
console.log('--- Prueba C: Terminal con isActivated Ausente Permanece No Activada ---');
const storageC = new MockStorage({
  'kioscoprox_installation_id': localId,
  // isActivated ni siquiera existe en el objeto
  'kioscoprox_business_config': JSON.stringify({
    installationId: localId,
    storeName: 'Terminal Virgen',
    plan: 'Básico'
  }),
  'kioscoprox_users': JSON.stringify([{ id: 1, name: 'Admin', role: 'Admin', pin: '1234', isActive: true }])
});

const resC = await restoreCommercialBackup({
  backup: donorBackupPayload,
  storage: storageC
});

assert.strictEqual(resC.success, true);
const restoredBizC = JSON.parse(storageC.getItem('kioscoprox_business_config'));
assert.strictEqual(restoredBizC.isActivated, false, 'isActivated DEBE ser false si la terminal no tenía activación previa');
console.log('  ✅ PASS: Terminal con isActivated ausente evaluada estrictamente como no activada');

// =========================================================================
// PRUEBA D: Respaldo de otra terminal: conserva exclusivamente identidad receptora
// =========================================================================
console.log('--- Prueba D: Preservación Estricta de Identidad Frente a Respaldo Foráneo ---');
assert.strictEqual(restoredBizA.installationId, localId, 'Nunca debe adoptar el installationId del donante');
assert.notStrictEqual(restoredBizA.installationId, foreignId, 'installationId foráneo rechazado');
console.log('  ✅ PASS: Identidad local preservada, installationId foráneo descartado');

// =========================================================================
// PRUEBA E: Certificado inválido o de otra máquina: acceso denegado en verificación
// =========================================================================
console.log('--- Prueba E: Certificado de Otra Terminal Rechazado Criptográficamente ---');
const foreignToken = createBasicToken(basicKeyPair.privateKey, foreignId);
const verifyForeign = await verifyBasicActivationCertificate(foreignToken, localId);
assert.strictEqual(verifyForeign.valid, false, 'El certificado de otra máquina no debe ser válido en este equipo');
console.log('  ✅ PASS: Certificado foráneo rechazado por falta de coincidencia con installationId');

// =========================================================================
// PRUEBA F: Preservación de activationData legítimo
// =========================================================================
console.log('--- Prueba F: Preservación Íntegra de activationData Legítimo ---');
assert.strictEqual(restoredBizA.activationData.negocio, 'Mi Kiosco Local');
assert.strictEqual(restoredBizA.activationData.instalador, 'Técnico Autorizado');
console.log('  ✅ PASS: activationData legítimo previo conservado con exactitud');

// =========================================================================
// PRUEBA G: Simulación de Recarga/Reinicio post-restauración
// =========================================================================
console.log('--- Prueba G: Simulación de Ciclo de Reinicio Post-Restauración ---');
// Simular lo que hace useKiosco.js al reiniciar
const defaultsUseKiosco = { isActivated: false, isOnboarded: false, plan: 'Básico' };
const savedFromStorage = JSON.parse(storageA.getItem('kioscoprox_business_config'));
const reloadedConfig = { ...defaultsUseKiosco, ...savedFromStorage };

assert.strictEqual(reloadedConfig.isActivated, true, 'Tras el reinicio, reloadedConfig.isActivated DEBE ser true');

// Simular lo que hace App.jsx checkLicense()
let isAccessGranted = false;
if (reloadedConfig.isActivated) {
  const tokenInStorage = storageA.getItem('kioscoprox_license_token');
  if (tokenInStorage) {
    const certCheck = await verifyBasicActivationCertificate(tokenInStorage, reloadedConfig.installationId);
    if (certCheck.valid) {
      isAccessGranted = true;
    }
  }
}
assert.strictEqual(isAccessGranted, true, 'El acceso al POS debe concederse sin pedir activación tras el reinicio');
console.log('  ✅ PASS: Reinicio simulado entra directo al POS sin volver a pedir activación');

console.log('\n================================================================');
console.log('RESULTADO: TODAS LAS PRUEBAS DE PRESERVACIÓN PASARON (7/7 PASS)');
console.log('================================================================\n');
