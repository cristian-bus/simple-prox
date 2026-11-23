import assert from 'node:assert';
import { generateTestKeyPair, generateLicenseToken, buildCanonicalPayload } from '../admin-tools/licenseGenerator.js';
import * as crypto from 'node:crypto';

// Polyfills para entorno de pruebas Node.js
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.window = { crypto: global.crypto };

console.log('====================================================');
console.log('TEST SUITE: EMISOR Y VERIFICADOR DE LICENCIAS ED25519');
console.log('====================================================\n');

// 1. Generar par de llaves Ed25519 efímeras para prueba
const { publicKey, privateKey } = generateTestKeyPair();
const testPublicKeyJwk = publicKey.export({ format: 'jwk' });

globalThis.__TEST_PUBLIC_KEY_JWK__ = testPublicKeyJwk;
process.env.NODE_ENV = 'test';

// Import dinámico de licenseCrypto con las variables de prueba inyectadas
const { verifyEd25519License } = await import('../src/utils/licenseCrypto.js');

const testInstallationId = 'PC-TEST-KIOSCO-001';

// --- TEST 1: Licencia Pro Permanente Válida ---
console.log('--- 1. Prueba: Licencia Pro Permanente Válida (exp = 0) ---');
const iat1 = Date.now();
const exp1 = 0; // Permanente
const token1 = generateLicenseToken(privateKey, testInstallationId, 'Pro', iat1, exp1);

assert.ok(typeof token1 === 'string' && token1.includes('.'), 'El token debe ser un string Base64.Base64');
const res1 = await verifyEd25519License(token1, testInstallationId);
assert.strictEqual(res1.valid, true, 'Debe ser válida');
assert.strictEqual(res1.payload.installationId, testInstallationId, 'installationId coincide');
assert.strictEqual(res1.payload.plan, 'Pro', 'Plan debe ser Pro');
assert.strictEqual(res1.payload.exp, 0, 'Expiración debe ser 0 (permanente)');
console.log('  ✅ PASS: Token permanente generado y verificado con éxito');

// --- TEST 2: Licencia Pro Temporal Válida ---
console.log('\n--- 2. Prueba: Licencia Pro Temporal Válida (Futura) ---');
const iat2 = Date.now();
const exp2 = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 días
const token2 = generateLicenseToken(privateKey, testInstallationId, 'Pro', iat2, exp2);

const res2 = await verifyEd25519License(token2, testInstallationId);
assert.strictEqual(res2.valid, true, 'Debe ser válida');
assert.strictEqual(res2.payload.exp, exp2, 'Expiración coincide');
console.log('  ✅ PASS: Token temporal vigente verificado con éxito');

// --- TEST 3: Licencia Expirada (Rechazo) ---
console.log('\n--- 3. Prueba: Licencia Expirada Rechazada ---');
const iat3 = Date.now() - 60 * 1000;
const exp3 = Date.now() - 10 * 1000; // Expiró hace 10 seg
const token3 = generateLicenseToken(privateKey, testInstallationId, 'Pro', iat3, exp3);

const res3 = await verifyEd25519License(token3, testInstallationId);
assert.strictEqual(res3.valid, false, 'Debe ser inválida por vencimiento');
assert.ok(res3.error.includes('expirado'), 'Error debe indicar expiración');
console.log('  ✅ PASS: Token expirado rechazado estrictamente');

// --- TEST 4: Anti-Suplantación (installationId diferente) ---
console.log('\n--- 4. Prueba: Anti-Suplantación de Equipo ---');
const differentId = 'PC-OTRO-EQUIPO-999';
const res4 = await verifyEd25519License(token1, differentId);
assert.strictEqual(res4.valid, false, 'No debe ser válida para otra máquina');
assert.ok(res4.error.includes('no corresponde'), 'Error debe indicar no correspondencia de equipo');
console.log('  ✅ PASS: Token rechazado en equipo diferente');

// --- TEST 5: Firma Inválida o Payload Alterado ---
console.log('\n--- 5. Prueba: Alteración de Payload o Firma Falsa ---');
const [b64Payload, b64Sig] = token1.split('.');
const alteredPayloadStr = atob(b64Payload).replace('|Pro|', '|Enterprise|');
const alteredB64Payload = Buffer.from(alteredPayloadStr, 'utf8').toString('base64');
const forgedToken = `${alteredB64Payload}.${b64Sig}`;

const res5 = await verifyEd25519License(forgedToken, testInstallationId);
assert.strictEqual(res5.valid, false, 'Firma no debe coincidir');
assert.ok(res5.error.includes('Firma digital inválida'), 'Error debe indicar firma inválida');
console.log('  ✅ PASS: Token adulterado rechazado por firma inválida');

// --- TEST 6: Formato Malformado ---
console.log('\n--- 6. Prueba: Formato Malformado ---');
const res6a = await verifyEd25519License('token-sin-punto', testInstallationId);
assert.strictEqual(res6a.valid, false, 'Formato sin punto debe fallar');

const res6b = await verifyEd25519License(null, testInstallationId);
assert.strictEqual(res6b.valid, false, 'Null debe fallar');
console.log('  ✅ PASS: Entradas malformadas manejadas de forma segura');

console.log('\n====================================================');
console.log('RESULTADO: TODAS LAS PRUEBAS DE EMISIÓN/VERIFICACIÓN PASARON (PASS)');
console.log('====================================================');
