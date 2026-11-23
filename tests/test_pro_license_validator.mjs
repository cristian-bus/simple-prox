import assert from 'node:assert';
import * as crypto from 'node:crypto';
import { generateTestKeyPair, generateLicenseToken } from '../admin-tools/licenseGenerator.js';

// Polyfills para entorno de pruebas Node.js
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.window = { crypto: global.crypto };

console.log('====================================================');
console.log('TEST SUITE: VALIDADOR QUIRÚRGICO DE LICENCIAS PRO ED25519');
console.log('====================================================\n');

// 1. Configurar par de llaves Ed25519 para Pro
const proKeyPair = generateTestKeyPair();
const proPublicKeyJwk = proKeyPair.publicKey.export({ format: 'jwk' });

// Configurar par de llaves Ed25519 para Básico (separación criptográfica estricta)
const basicKeyPair = generateTestKeyPair();
const basicPublicKeyJwk = basicKeyPair.publicKey.export({ format: 'jwk' });

globalThis.__TEST_PUBLIC_KEY_JWK__ = proPublicKeyJwk;
globalThis.__TEST_BASIC_PUBLIC_KEY_JWK__ = basicPublicKeyJwk;
process.env.NODE_ENV = 'test';

// Import dinámico de los módulos bajo prueba
const { verifyEd25519License, verifyProLicenseCertificate, verifyBasicActivationCertificate } = await import('../src/utils/licenseCrypto.js');
const { isValidProLicense } = await import('../src/services/installationService.js');

const targetInstallationId = 'KIOSCO-TERMINAL-SAN-LUIS-001';
const otherInstallationId = 'OTRO-EQUIPO-NO-AUTORIZADO-999';

// =========================================================================
// CASO 1: Certificado Pro permanente válido (exp = 0)
// =========================================================================
console.log('--- 1. Caso: Certificado Pro Permanente Válido (exp = 0) ---');
const validProToken = generateLicenseToken(proKeyPair.privateKey, targetInstallationId, 'Pro', Date.now(), 0);

const proRes1 = await verifyProLicenseCertificate(validProToken, targetInstallationId);
assert.strictEqual(proRes1.valid, true, 'El certificado Pro permanente debe ser válido');
assert.strictEqual(proRes1.payload.plan, 'Pro', 'El plan debe ser Pro');
assert.strictEqual(proRes1.payload.exp, 0, 'La expiración debe ser 0 (permanente)');
assert.strictEqual(proRes1.payload.installationId, targetInstallationId, 'El installationId debe coincidir');

const isValidPro1 = await isValidProLicense(targetInstallationId, validProToken);
assert.strictEqual(isValidPro1, true, 'isValidProLicense debe retornar true para token permanente válido');
console.log('  ✅ PASS: Certificado Pro permanente aceptado por verifyProLicenseCertificate e isValidProLicense');

// =========================================================================
// CASO 2: Certificado para otro installationId (Anti-Suplantación)
// =========================================================================
console.log('\n--- 2. Caso: Certificado para otro installationId (Anti-Suplantación) ---');
const proRes2 = await verifyProLicenseCertificate(validProToken, otherInstallationId);
assert.strictEqual(proRes2.valid, false, 'No debe ser válido para otro equipo');
assert.ok(proRes2.error.includes('no corresponde'), 'Error debe indicar no correspondencia de equipo');

const isValidPro2 = await isValidProLicense(otherInstallationId, validProToken);
assert.strictEqual(isValidPro2, false, 'isValidProLicense debe retornar false para equipo diferente');
console.log('  ✅ PASS: Certificado rechazado para terminal no autorizada');

// =========================================================================
// CASO 3: Certificado Básico intentando usarse como Pro (Separación de Planes)
// =========================================================================
console.log('\n--- 3. Caso: Certificado Básico rechazado para Plan Pro ---');
// 3a. Token básico emitido con clave básica y formato JSON
const basicPayloadObj = {
  version: 1,
  type: 'initial_activation',
  plan: 'Básico',
  installationId: targetInstallationId,
  deviceFingerprint: 'FP-TEST-001',
  issuedAt: new Date().toISOString()
};
const basicPayloadStr = JSON.stringify(basicPayloadObj);
const basicPayloadB64 = Buffer.from(basicPayloadStr, 'utf8').toString('base64');
const basicSigBytes = crypto.sign(null, Buffer.from(basicPayloadBytesUtf8(basicPayloadStr)), basicKeyPair.privateKey);
const basicSigB64 = basicSigBytes.toString('base64');
const basicToken = `${basicPayloadB64}.${basicSigB64}`;

function basicPayloadBytesUtf8(str) {
  return new TextEncoder().encode(str);
}

// Verificar que sea un certificado básico válido en su propio validador
const basicVerifyRes = await verifyBasicActivationCertificate(basicToken, targetInstallationId);
assert.strictEqual(basicVerifyRes.valid, true, 'Debe ser un certificado básico válido');

// Probar si el validador Pro lo rechaza
const proRes3 = await verifyProLicenseCertificate(basicToken, targetInstallationId);
assert.strictEqual(proRes3.valid, false, 'Certificado básico debe ser rechazado como Pro');

const isValidPro3 = await isValidProLicense(targetInstallationId, basicToken);
assert.strictEqual(isValidPro3, false, 'isValidProLicense debe rechazar certificado básico');
console.log('  ✅ PASS: Certificado Básico rechazado categóricamente para Plan Pro');

// 3b. Token firmado con clave Pro pero con plan: 'Básico'
const proSignedBasicToken = generateLicenseToken(proKeyPair.privateKey, targetInstallationId, 'Básico', Date.now(), 0);
const proRes3b = await verifyProLicenseCertificate(proSignedBasicToken, targetInstallationId);
assert.strictEqual(proRes3b.valid, false, 'Token con plan Básico debe ser rechazado por verifyProLicenseCertificate');
assert.ok(proRes3b.error.includes('no corresponde a una licencia Plan Pro'), 'Error debe indicar plan incompatible');
console.log('  ✅ PASS: Token con plan Básico firmado por clave Pro rechazado');

// =========================================================================
// CASO 4: Certificado alterado (Firma o Payload adulterado)
// =========================================================================
console.log('\n--- 4. Caso: Certificado Alterado (Integridad Criptográfica) ---');
const [origPayloadB64, origSigB64] = validProToken.split('.');
const decodedPayload = Buffer.from(origPayloadB64, 'base64').toString('utf8');
const tamperedPayload = decodedPayload.replace(targetInstallationId, otherInstallationId);
const tamperedPayloadB64 = Buffer.from(tamperedPayload, 'utf8').toString('base64');
const tamperedToken = `${tamperedPayloadB64}.${origSigB64}`;

const proRes4 = await verifyProLicenseCertificate(tamperedToken, otherInstallationId);
assert.strictEqual(proRes4.valid, false, 'Certificado con payload alterado debe fallar firma');
assert.ok(proRes4.error.includes('Firma digital inválida'), 'Error debe señalar firma inválida');

const isValidPro4 = await isValidProLicense(otherInstallationId, tamperedToken);
assert.strictEqual(isValidPro4, false, 'isValidProLicense debe rechazar token alterado');
console.log('  ✅ PASS: Certificado adulterado detectado y rechazado');

// =========================================================================
// CASO 5: Certificado Expirado (exp > 0 y fecha pasada)
// =========================================================================
console.log('\n--- 5. Caso: Certificado Expirado ---');
const expiredToken = generateLicenseToken(proKeyPair.privateKey, targetInstallationId, 'Pro', Date.now() - 100000, Date.now() - 5000);
const proRes5 = await verifyProLicenseCertificate(expiredToken, targetInstallationId);
assert.strictEqual(proRes5.valid, false, 'Token expirado debe ser inválido');
assert.ok(proRes5.error.includes('expirado'), 'Error debe indicar expiración');

const isValidPro5 = await isValidProLicense(targetInstallationId, expiredToken);
assert.strictEqual(isValidPro5, false, 'isValidProLicense debe rechazar token expirado');
console.log('  ✅ PASS: Certificado expirado rechazado');

// =========================================================================
// CASO 6: Certificados Malformados o Nulos
// =========================================================================
console.log('\n--- 6. Caso: Entradas Malformadas o Nulas ---');
const invalidInputs = [null, undefined, '', '   ', 'sin-punto', 'punto.pero.con.demasiadas.partes', 12345, {}];

for (const input of invalidInputs) {
  const res = await verifyProLicenseCertificate(input, targetInstallationId);
  assert.strictEqual(res.valid, false, `Input "${input}" debe retornar valid: false`);
  
  const isVal = await isValidProLicense(targetInstallationId, input);
  assert.strictEqual(isVal, false, `isValidProLicense con "${input}" debe retornar false`);
}
console.log('  ✅ PASS: Entradas nulas o malformadas manejadas sin excepciones');

// =========================================================================
// CASO 7: Verificación 100% Offline (Sin llamadas de red)
// =========================================================================
console.log('\n--- 7. Caso: Verificación 100% Offline ---');
// Simular entorno sin conexión: sobreescribir global.fetch para que falle si se invoca
const originalFetch = global.fetch;
global.fetch = () => {
  throw new Error('VIOLACIÓN OFFLINE: fetch() no debe ser invocado durante validación de licencias');
};

try {
  const offlineRes = await verifyProLicenseCertificate(validProToken, targetInstallationId);
  assert.strictEqual(offlineRes.valid, true, 'Debe validar exitosamente sin internet');
  
  const offlineCheck = await isValidProLicense(targetInstallationId, validProToken);
  assert.strictEqual(offlineCheck, true, 'isValidProLicense debe validar offline');
  console.log('  ✅ PASS: Verificación 100% offline completada sin llamadas de red');
} finally {
  global.fetch = originalFetch;
}

// =========================================================================
// CASO 8: Rechazo Estricto de Claves Legadas (XXXX-XXXX)
// =========================================================================
console.log('\n--- 8. Caso: Rechazo Estricto de Claves Antiguas (XXXX-XXXX) ---');
const sampleLegacyKeys = ['4B21-99FA', '1234-5678', 'LTME-I6YT', 'ABCD-EF01'];

for (const oldKey of sampleLegacyKeys) {
  const isAccepted = await isValidProLicense(targetInstallationId, oldKey);
  assert.strictEqual(isAccepted, false, `Clave legada "${oldKey}" debe ser rechazada categóricamente`);
}
console.log('  ✅ PASS: Claves antiguas de formato XXXX-XXXX son rechazadas sin excepción');

// =========================================================================
// CASO 9: Independencia de Activación Básica
// =========================================================================
console.log('\n--- 9. Caso: Independencia de Activación Básica ---');
// Un equipo con activación Básica válida mantiene su activación sin interferir con la lógica Pro
assert.strictEqual(basicVerifyRes.valid, true, 'Activación Básica funciona independientemente');
assert.strictEqual(basicVerifyRes.payload.plan, 'Básico', 'Plan de activación básica es Básico');
console.log('  ✅ PASS: Activación Básica permanece intacta e independiente');

// =========================================================================
// CASO 10: Simulación de Reinicio de Aplicación (useKiosco Integrity Check)
// =========================================================================
console.log('\n--- 10. Caso: Simulación de Reinicio de Aplicación (Persistencia Pro) ---');

// Simular la función de integridad de useKiosco
async function simulateKioscoStartupCheck(businessConfig) {
  let plan = businessConfig.plan;
  if (plan === 'Pro') {
    const isValid = await isValidProLicense(businessConfig.installationId, businessConfig.licenseKey);
    if (!isValid) {
      plan = 'Básico'; // Revertir
    }
  }
  return plan;
}

// 10a. Terminal Pro con certificado Ed25519 permanente reinicia la app
const configWithEd25519 = {
  installationId: targetInstallationId,
  plan: 'Pro',
  licenseKey: validProToken
};
const planAfterRestart1 = await simulateKioscoStartupCheck(configWithEd25519);
assert.strictEqual(planAfterRestart1, 'Pro', 'Debe mantenerse en Plan Pro tras reinicio con token Ed25519');

// 10b. Terminal con clave antigua XXXX-XXXX reinicia la app -> Se revierte a Básico
const configWithLegacy = {
  installationId: targetInstallationId,
  plan: 'Pro',
  licenseKey: '4B21-99FA'
};
const planAfterRestart2 = await simulateKioscoStartupCheck(configWithLegacy);
assert.strictEqual(planAfterRestart2, 'Básico', 'Clave antigua debe revertir a Plan Básico al reiniciar');

// 10c. Terminal con clave Pro falsa o adulterada reinicia la app -> Se revierte a Básico
const configWithTampered = {
  installationId: targetInstallationId,
  plan: 'Pro',
  licenseKey: 'CLAVE-FALSA-1234'
};
const planAfterRestart3 = await simulateKioscoStartupCheck(configWithTampered);
assert.strictEqual(planAfterRestart3, 'Básico', 'Debe revertir a Plan Básico si la clave es falsa');

console.log('  ✅ PASS: Reinicio de aplicación probado: Pro legítimo se conserva, claves falsas se revierten');

console.log('\n====================================================');
console.log('RESULTADO: TODAS LAS PRUEBAS DE LA ETAPA 2 PASARON (10/10 PASS)');
console.log('====================================================');

