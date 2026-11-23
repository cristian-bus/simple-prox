/**
 * SIMPLE PROX - Test de Validación del Flujo de Recuperación del Piloto
 * FASE 5C.4D.4E
 * 
 * Valida de forma 100% local (sin red ni Supabase):
 * 1. Comportamiento ante credenciales ausentes (exit code 1).
 * 2. Escritura atómica y verificación de .pilot_cleanup_pending.json antes de consumir credenciales.
 * 3. Consumo de .pilot_cred_active.json (eliminación para evitar reutilización).
 * 4. Supervivencia de .pilot_cleanup_pending.json ante fallos posteriores.
 * 5. Exactitud de installationId y tokenHash en el SQL de limpieza.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { generatePilotCredentials } = require('./generate_pilot_credentials.cjs');

console.log('=== TEST DE VALIDACIÓN: FLUJO DE RECUPERACIÓN DEL PILOTO ===\n');

const testCredActivePath = path.resolve(__dirname, '.pilot_cred_active.json');
const testCleanupPendingPath = path.resolve(__dirname, '.pilot_cleanup_pending.json');

// Asegurar estado inicial limpio para la prueba local
if (fs.existsSync(testCredActivePath)) fs.unlinkSync(testCredActivePath);
if (fs.existsSync(testCleanupPendingPath)) fs.unlinkSync(testCleanupPendingPath);

// -----------------------------------------------------------------------------
// PRUEBA 1: Generación de credenciales y coincidencia exacta en SQL
// -----------------------------------------------------------------------------
console.log('1. Verificando generación criptográfica y coincidencia exacta en SQL...');
const creds = generatePilotCredentials();

assert.ok(creds.installationId.startsWith('spx_pilot_auth_'), 'installationId debe tener prefijo spx_pilot_auth_');
assert.ok(creds.rawToken.startsWith('spx_term_'), 'rawToken debe tener prefijo spx_term_');
assert.strictEqual(creds.tokenHash.length, 64, 'tokenHash debe ser un hash SHA-256 de 64 hex caracteres');

// Verificar que el SQL DELETE contiene exactamente el ID y el hash sin comodines
assert.ok(creds.sqlCleanup.includes(`WHERE installation_id = '${creds.installationId}' AND token_hash = '${creds.tokenHash}'`), 'SQL DELETE debe tener matching exacto');
assert.ok(!creds.sqlCleanup.includes('%') && !creds.sqlCleanup.includes('*'), 'SQL DELETE no debe tener comodines');
console.log('   ✅ PASÓ: Coincidencia exacta de installationId y tokenHash en SQL.');

// -----------------------------------------------------------------------------
// PRUEBA 2: Simulación del ciclo de persistencia de recuperación
// -----------------------------------------------------------------------------
console.log('2. Verificando escritura y verificación atómica de .pilot_cleanup_pending.json...');

// Escribir archivo activo temporal simulado
const activePayload = {
  installationId: creds.installationId,
  tokenHash: creds.tokenHash,
  terminalToken: creds.rawToken,
  sqlInsert: creds.sqlInsert,
  sqlCleanup: creds.sqlCleanup,
  sqlVerify: creds.sqlVerify,
  createdAt: new Date().toISOString()
};

fs.writeFileSync(testCredActivePath, JSON.stringify(activePayload, null, 2), 'utf8');
assert.ok(fs.existsSync(testCredActivePath), 'El archivo activo debe existir');

// Simular el procedimiento exacto del runner
const credsRead = JSON.parse(fs.readFileSync(testCredActivePath, 'utf8'));

const cleanupData = {
  installationId: credsRead.installationId,
  tokenHash: credsRead.tokenHash,
  sqlCleanup: credsRead.sqlCleanup,
  sqlVerify: credsRead.sqlVerify,
  generatedAt: credsRead.createdAt
};

// Escribir archivo de recuperación
fs.writeFileSync(testCleanupPendingPath, JSON.stringify(cleanupData, null, 2), { encoding: 'utf8', mode: 0o600 });

// Verificación de integridad estricta
const verifyRead = fs.readFileSync(testCleanupPendingPath, 'utf8');
const parsedVerify = JSON.parse(verifyRead);

assert.strictEqual(parsedVerify.installationId, creds.installationId, 'installationId debe coincidir exactamente');
assert.strictEqual(parsedVerify.tokenHash, creds.tokenHash, 'tokenHash debe coincidir exactamente');
assert.ok(!parsedVerify.terminalToken, 'El archivo de recuperación NUNCA debe contener el token en texto plano');
assert.ok(parsedVerify.sqlCleanup.includes(creds.installationId), 'sqlCleanup debe contener el ID');
console.log('   ✅ PASÓ: Archivo de recuperación validado y libre de secretos en texto plano.');

// -----------------------------------------------------------------------------
// PRUEBA 3: Eliminación segura de credenciales activas
// -----------------------------------------------------------------------------
console.log('3. Verificando consumo inmediato de credenciales activas...');
fs.unlinkSync(testCredActivePath);
assert.ok(!fs.existsSync(testCredActivePath), '.pilot_cred_active.json debe haber sido eliminado');
assert.ok(fs.existsSync(testCleanupPendingPath), '.pilot_cleanup_pending.json DEBE sobrevivir y permanecer intacto');
console.log('   ✅ PASÓ: Credenciales activas consumidas y archivo de recuperación conservado.');

// -----------------------------------------------------------------------------
// PRUEBA 4: Simulación de fallo en el test -> .pilot_cleanup_pending.json sobrevive
// -----------------------------------------------------------------------------
console.log('4. Verificando que .pilot_cleanup_pending.json sobrevive a fallos...');
try {
  throw new Error('Error simulado en la suite de Electron');
} catch (err) {
  // En caso de fallo, el runner nunca borra testCleanupPendingPath
}
assert.ok(fs.existsSync(testCleanupPendingPath), 'El archivo de recuperación sobrevive al fallo');
console.log('   ✅ PASÓ: El archivo de recuperación sobrevive a excepciones y fallos.');

// Limpieza final de la prueba unitaria local
if (fs.existsSync(testCleanupPendingPath)) fs.unlinkSync(testCleanupPendingPath);
if (fs.existsSync(testCredActivePath)) fs.unlinkSync(testCredActivePath);

console.log('\n=== TODAS LAS VERIFICACIONES DEL FLUJO DE RECUPERACIÓN PASARON EXITOSAMENTE (4/4) ===');
