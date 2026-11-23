import assert from 'node:assert';
import { generateTestKeyPair, generateLicenseToken, buildCanonicalPayload } from '../admin-tools/licenseGenerator.js';
import * as crypto from 'node:crypto';

// Polyfill window/global crypto and atob for Node environment testing
// Polyfill atob for Node environment testing
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
// In Node 20+, crypto is globally available and has webcrypto. 
// We mock window.crypto just for the script logic.
global.window = { crypto: global.crypto };

async function runTests() {
  console.log('--- Iniciando Pruebas de Licencias Ed25519 ---');
  
  // 1. Generate test keys
  const { publicKey, privateKey } = generateTestKeyPair();
  
  // Inject public key into verifier module as JWK using global testing variable
  const jwk = publicKey.export({ format: 'jwk' });
  globalThis.__TEST_PUBLIC_KEY_JWK__ = jwk;
  process.env.NODE_ENV = 'test';
  
  const licenseCryptoModule = await import('../src/utils/licenseCrypto.js');
  
  const myInstallationId = 'LTMEI6YT';
  const otherInstallationId = 'WG6KX8UI';
  const currentTimestamp = Date.now();
  const futureTimestamp = currentTimestamp + 86400000; // +1 day
  const pastTimestamp = currentTimestamp - 86400000; // -1 day

  // TEST 1: Licencia válida
  const tokenValid = generateLicenseToken(privateKey, myInstallationId, 'PRO', currentTimestamp, futureTimestamp);
  const result1 = await licenseCryptoModule.verifyEd25519License(tokenValid, myInstallationId);
  assert.strictEqual(result1.valid, true, 'Test 1 Falló: Licencia válida fue rechazada.');
  console.log('✅ Test 1 Pasó: Licencia válida aceptada.');

  // TEST 2: Licencia vinculada a otra instalación
  const tokenOther = generateLicenseToken(privateKey, otherInstallationId, 'PRO', currentTimestamp, futureTimestamp);
  const result2 = await licenseCryptoModule.verifyEd25519License(tokenOther, myInstallationId);
  assert.strictEqual(result2.valid, false, 'Test 2 Falló: Licencia de otro equipo fue aceptada.');
  assert.strictEqual(result2.error, 'La licencia no corresponde a este equipo.');
  console.log('✅ Test 2 Pasó: Licencia ajena rechazada.');

  // TEST 3: Licencia vencida
  const tokenExpired = generateLicenseToken(privateKey, myInstallationId, 'PRO', currentTimestamp - 172800000, pastTimestamp);
  const result3 = await licenseCryptoModule.verifyEd25519License(tokenExpired, myInstallationId);
  assert.strictEqual(result3.valid, false, 'Test 3 Falló: Licencia vencida fue aceptada.');
  assert.strictEqual(result3.error, 'La licencia ha expirado.');
  console.log('✅ Test 3 Pasó: Licencia vencida rechazada.');

  // TEST 4: Licencia alterada (Firma inválida)
  // Cambiamos el payload pero mantenemos la misma firma
  const [b64Payload, b64Signature] = tokenValid.split('.');
  const alteredPayloadStr = buildCanonicalPayload(1, 'LIC-HACKED', myInstallationId, 'PRO', currentTimestamp, futureTimestamp);
  const alteredB64Payload = Buffer.from(alteredPayloadStr, 'utf8').toString('base64');
  const tokenAltered = `${alteredB64Payload}.${b64Signature}`;
  
  const result4 = await licenseCryptoModule.verifyEd25519License(tokenAltered, myInstallationId);
  assert.strictEqual(result4.valid, false, 'Test 4 Falló: Licencia alterada fue aceptada.');
  assert.strictEqual(result4.error, 'Firma digital inválida o licencia alterada.');
  console.log('✅ Test 4 Pasó: Licencia alterada rechazada.');

  console.log('--- Todas las pruebas pasaron exitosamente ---');
}

runTests().catch(err => {
  console.error('Error durante las pruebas:', err);
  process.exit(1);
});
