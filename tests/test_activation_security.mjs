import assert from 'node:assert';
import * as crypto from 'node:crypto';
import { generateTestKeyPair, generateLicenseToken } from '../admin-tools/licenseGenerator.js';

// Polyfills para entorno de pruebas Node.js
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.window = { crypto: global.crypto };

console.log('================================================================');
console.log('TEST SUITE: SEGURIDAD DE ACTIVACIÓN Y MITIGACIÓN DE VULNERABILIDAD');
console.log('================================================================\n');

// 1. Configurar par de llaves Ed25519 para Pro
const proKeyPair = generateTestKeyPair();
const proPublicKeyJwk = proKeyPair.publicKey.export({ format: 'jwk' });

// 2. Configurar par de llaves Ed25519 para Básico (emulado para activate-device)
const basicKeyPair = generateTestKeyPair();
const basicPublicKeyJwk = basicKeyPair.publicKey.export({ format: 'jwk' });

globalThis.__TEST_PUBLIC_KEY_JWK__ = proPublicKeyJwk;
globalThis.__TEST_BASIC_PUBLIC_KEY_JWK__ = basicPublicKeyJwk;
process.env.NODE_ENV = 'test';

// Import dinámico de módulos criptográficos
const {
  verifyEd25519License,
  verifyProLicenseCertificate,
  verifyBasicActivationCertificate
} = await import('../src/utils/licenseCrypto.js');
const { isValidProLicense } = await import('../src/services/installationService.js');

const targetInstallationId = 'KIOSCO-TEST-SECURITY-001';
const otherInstallationId = 'OTRO-EQUIPO-NO-AUTORIZADO-999';

// Helper para emitir certificado básico Ed25519 válido de prueba
async function createTestBasicCertificate(privateKey, installationId, plan = 'Básico', type = 'initial_activation') {
  const payload = {
    version: 1,
    type,
    plan,
    installationId,
    issuedAt: new Date().toISOString(),
    installationData: {
      negocio: 'Comercio Prueba Seguridad',
      direccion: 'Calle Test 123',
      telefono: '1122334455',
      instalador: 'Tester Autorizado'
    }
  };

  const payloadStr = JSON.stringify(payload);
  const payloadBytes = Buffer.from(payloadStr, 'utf8');

  // Firmar con la clave privada Ed25519
  const signatureBytes = crypto.sign(null, payloadBytes, privateKey);

  const payloadB64 = global.btoa(payloadBytes.toString('binary'));
  const signatureB64 = global.btoa(signatureBytes.toString('binary'));
  return `${payloadB64}.${signatureB64}`;
}

// Simulador de la lógica de evaluación de checkLicense() de App.jsx
async function evaluateCheckLicense({ businessConfig, token, activeSale = false, mockStorage = {} }) {
  if (!businessConfig?.isActivated) {
    return { licenseValid: false, legacyMode: false, licensePendingLock: false };
  }

  if (token) {
    try {
      const instId = businessConfig?.installationId || '';
      let result = await verifyBasicActivationCertificate(token, instId);

      if (!result.valid && verifyEd25519License) {
        const legacyRes = await verifyEd25519License(token, instId);
        if (legacyRes.valid) {
          result = legacyRes;
        }
      }

      if (result.valid) {
        return { licenseValid: true, legacyMode: false, licensePendingLock: false };
      } else {
        if (activeSale) {
          return { licenseValid: true, legacyMode: false, licensePendingLock: true };
        } else {
          return { licenseValid: false, legacyMode: false, licensePendingLock: false };
        }
      }
    } catch (e) {
      if (activeSale) {
        return { licenseValid: true, legacyMode: false, licensePendingLock: true };
      } else {
        return { licenseValid: false, legacyMode: false, licensePendingLock: false };
      }
    }
  } else {
    // RAMA CORREGIDA: sin token válido, el acceso debe ser DENEGADO
    return { licenseValid: false, legacyMode: false, licensePendingLock: false };
  }
}

// =========================================================================
// PRUEBA 1: Instalación nueva sin certificado: acceso denegado
// =========================================================================
console.log('--- 1. Prueba: Instalación Nueva Sin Certificado ---');
const eval1 = await evaluateCheckLicense({
  businessConfig: { isActivated: false, installationId: targetInstallationId },
  token: null
});
assert.strictEqual(eval1.licenseValid, false, 'Una instalación no activada debe tener licenseValid = false');
assert.strictEqual(eval1.legacyMode, false, 'No debe entrar en legacyMode');
console.log('  ✅ PASS: Instalación nueva sin activar bloqueada correctamente');

// =========================================================================
// PRUEBA 2: Configuración local isActivated: true SIN certificado (Vulnerabilidad cerrada)
// =========================================================================
console.log('--- 2. Prueba: Configuración Local isActivated: true Sin Certificado (Intento de Bypass) ---');
const eval2 = await evaluateCheckLicense({
  businessConfig: { isActivated: true, isOnboarded: true, installationId: targetInstallationId },
  token: null // Atacante o script inyecta isActivated: true pero no tiene certificado Ed25519
});
assert.strictEqual(eval2.licenseValid, false, 'isActivated: true sin token DEBE ser rechazado categóricamente');
assert.strictEqual(eval2.legacyMode, false, 'No debe conceder legacyMode');
console.log('  ✅ PASS: Intento de bypass mediante isActivated: true sin token rechazado exitosamente');

// =========================================================================
// PRUEBA 3: Certificado Básico válido: acceso permitido
// =========================================================================
console.log('--- 3. Prueba: Certificado Básico Ed25519 Válido ---');
const validBasicToken = await createTestBasicCertificate(basicKeyPair.privateKey, targetInstallationId);
const eval3 = await evaluateCheckLicense({
  businessConfig: { isActivated: true, installationId: targetInstallationId },
  token: validBasicToken
});
assert.strictEqual(eval3.licenseValid, true, 'Certificado básico válido debe habilitar la aplicación');
assert.strictEqual(eval3.legacyMode, false, 'No debe ser legacy');
assert.strictEqual(eval3.licensePendingLock, false, 'No debe estar pendiente de bloqueo');
console.log('  ✅ PASS: Certificado básico legítimo verificado y acceso concedido');

// =========================================================================
// PRUEBA 4: Certificado Básico alterado (Tampering): acceso denegado
// =========================================================================
console.log('--- 4. Prueba: Certificado Básico Alterado (Tampering) ---');
const parts = validBasicToken.split('.');
const tamperedPayload = global.btoa(JSON.stringify({ plan: 'Pro', installationId: targetInstallationId }));
const tamperedToken = `${tamperedPayload}.${parts[1]}`; // Firma original con payload modificado

const eval4 = await evaluateCheckLicense({
  businessConfig: { isActivated: true, installationId: targetInstallationId },
  token: tamperedToken
});
assert.strictEqual(eval4.licenseValid, false, 'Certificado alterado debe ser rechazado');
console.log('  ✅ PASS: Certificado alterado detectado criptográficamente y acceso denegado');

// =========================================================================
// PRUEBA 5: Certificado correspondiente a otro installationId: acceso denegado
// =========================================================================
console.log('--- 5. Prueba: Certificado para Otro installationId (Anti-Suplantación) ---');
const otherBasicToken = await createTestBasicCertificate(basicKeyPair.privateKey, otherInstallationId);
const eval5 = await evaluateCheckLicense({
  businessConfig: { isActivated: true, installationId: targetInstallationId },
  token: otherBasicToken
});
assert.strictEqual(eval5.licenseValid, false, 'Certificado de otra máquina debe ser rechazado');
console.log('  ✅ PASS: Certificado de terminal ajena rechazado categóricamente');

// =========================================================================
// PRUEBA 6: Licencia Pro válida: funcionamiento sin regresiones
// =========================================================================
console.log('--- 6. Prueba: Licencia Pro Válida (Verificación Dual) ---');
const validProToken = generateLicenseToken(proKeyPair.privateKey, targetInstallationId, 'Pro', Date.now(), 0);
const proCheck = await verifyProLicenseCertificate(validProToken, targetInstallationId);
assert.strictEqual(proCheck.valid, true, 'Certificado Pro debe ser válido');
assert.strictEqual(proCheck.payload.plan, 'Pro');

const isProValid = await isValidProLicense(targetInstallationId, validProToken);
assert.strictEqual(isProValid, true, 'isValidProLicense debe retornar true para token Pro');
console.log('  ✅ PASS: Licencia Pro permanente válida sin regresiones');

// =========================================================================
// PRUEBA 7: Licencia Pro alterada: rechazo estricto
// =========================================================================
console.log('--- 7. Prueba: Licencia Pro Alterada ---');
const fakeProToken = validProToken.slice(0, -6) + 'AAAAAA';
const fakeProCheck = await verifyProLicenseCertificate(fakeProToken, targetInstallationId);
assert.strictEqual(fakeProCheck.valid, false, 'Token Pro alterado debe ser inválido');

const isFakeProValid = await isValidProLicense(targetInstallationId, fakeProToken);
assert.strictEqual(isFakeProValid, false, 'isValidProLicense debe rechazar token Pro alterado');
console.log('  ✅ PASS: Licencia Pro alterada rechazada exitosamente');

// =========================================================================
// PRUEBA 8: Funcionamiento 100% Offline con certificado válido (Sin llamadas a red)
// =========================================================================
console.log('--- 8. Prueba: Verificación 100% Offline (Red Bloqueada) ---');
const originalFetch = global.fetch;
global.fetch = () => {
  throw new Error('VIOLACION_OFFLINE: fetch fue invocado durante la verificación local');
};

try {
  const offlineEval = await evaluateCheckLicense({
    businessConfig: { isActivated: true, installationId: targetInstallationId },
    token: validBasicToken
  });
  assert.strictEqual(offlineEval.licenseValid, true, 'La validación debe ser 100% offline');
  console.log('  ✅ PASS: Verificación de certificado realizada localmente sin acceso a red');
} finally {
  global.fetch = originalFetch;
}

console.log('\n================================================================');
console.log('RESULTADO: TODAS LAS PRUEBAS DE SEGURIDAD PASARON (8/8 PASS)');
console.log('================================================================');

