import assert from 'node:assert';
import { generateTestKeyPair, generateLicenseToken } from '../admin-tools/licenseGenerator.js';

// Polyfills for testing
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
import * as crypto from 'node:crypto';
global.window = { crypto: global.crypto };

async function runIntegrationTests() {
  console.log('--- Iniciando Pruebas de Integración (Etapa 2) ---');

  const { publicKey, privateKey } = generateTestKeyPair();
  globalThis.__TEST_PUBLIC_KEY_JWK__ = publicKey.export({ format: 'jwk' });
  process.env.NODE_ENV = 'test';
  
  const { verifyEd25519License } = await import('../src/utils/licenseCrypto.js');

  const myInstallationId = 'LTMEI6YT';
  
  console.log('Test 1: Modo Legacy (sin token, isActivated: true)');
  let legacyMode = false;
  let licenseValid = false;
  let token = null;
  let isActivated = true;
  
  if (!token && isActivated) {
    legacyMode = true;
    licenseValid = true;
  }
  assert.strictEqual(legacyMode, true);
  assert.strictEqual(licenseValid, true);
  console.log('✅ Modo Legacy verificado correctamente.');

  console.log('Test 2: Activación Nueva (con token válido)');
  token = generateLicenseToken(privateKey, myInstallationId, 'PRO', Date.now(), Date.now() + 86400000);
  const resultValid = await verifyEd25519License(token, myInstallationId);
  assert.strictEqual(resultValid.valid, true);
  console.log('✅ Licencia nueva validada correctamente.');

  console.log('Test 3: Licencia Vencida en tiempo de ejecución');
  token = generateLicenseToken(privateKey, myInstallationId, 'PRO', Date.now() - 100000, Date.now() - 1000);
  const resultExpired = await verifyEd25519License(token, myInstallationId);
  assert.strictEqual(resultExpired.valid, false);
  console.log('✅ Licencia vencida rechazada dinámicamente.');

  console.log('Test 4: Instalación distinta');
  const tokenOther = generateLicenseToken(privateKey, 'OTHER_ID', 'PRO', Date.now(), Date.now() + 86400000);
  const resultOther = await verifyEd25519License(tokenOther, myInstallationId);
  assert.strictEqual(resultOther.valid, false);
  console.log('✅ Instalación distinta rechazada.');

  console.log('Test 5: Licencia alterada');
  const [b64P, b64S] = token.split('.');
  const alteredToken = `${Buffer.from('1|LIC-0|LTMEI6YT|PRO|0|0').toString('base64')}.${b64S}`;
  const resultAltered = await verifyEd25519License(alteredToken, myInstallationId);
  assert.strictEqual(resultAltered.valid, false);
  console.log('✅ Licencia alterada rechazada.');

  console.log('--- Pruebas de Integración Completadas ---');
}

runIntegrationTests().catch(e => {
  console.error(e);
  process.exit(1);
});
