/**
 * SIMPLE PROX - Generador Seguro de Credenciales Temporales para Piloto
 * FASE 5C.4D.4B
 * 
 * Genera una identidad sintética unívoca, un token criptográfico de 256 bits
 * y su hash SHA-256. El token nunca se imprime en consola ni se versiona.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generatePilotCredentials() {
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const installationId = `spx_pilot_auth_${timestamp}_${randomSuffix}`;
  
  // Token criptográfico de 256 bits (64 hex chars con prefijo oficial spx_term_)
  const rawToken = `spx_term_${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const sqlInsert = `INSERT INTO public.terminal_identities (installation_id, token_hash, status) VALUES ('${installationId}', '${tokenHash}', 'active');`;
  
  const sqlCleanup = `DELETE FROM public.terminal_identities WHERE installation_id = '${installationId}' AND token_hash = '${tokenHash}';`;
  
  const sqlVerify = `SELECT count(*) AS remaining_count FROM public.terminal_identities WHERE installation_id = '${installationId}';`;

  return {
    installationId,
    tokenHash,
    rawToken,
    terminalToken: rawToken,
    sqlInsert,
    sqlCleanup,
    sqlVerify
  };
}

function writeActiveCredentialsFile(outputPath = path.resolve(__dirname, '.pilot_cred_active.json')) {
  const creds = generatePilotCredentials();
  const fileContent = {
    installationId: creds.installationId,
    tokenHash: creds.tokenHash,
    terminalToken: creds.rawToken,
    sqlInsert: creds.sqlInsert,
    sqlCleanup: creds.sqlCleanup,
    sqlVerify: creds.sqlVerify,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(outputPath, JSON.stringify(fileContent, null, 2), { encoding: 'utf8', mode: 0o600 });
  return creds;
}

module.exports = { generatePilotCredentials, writeActiveCredentialsFile };

if (require.main === module) {
  const shouldWrite = process.argv.includes('--write-active');
  const creds = shouldWrite 
    ? writeActiveCredentialsFile()
    : generatePilotCredentials();

  console.log('=== CREDENCIALES TEMPORALES GENERADAS (SANITIZADAS) ===');
  console.log(`Installation ID: ${creds.installationId}`);
  console.log(`Token Hash (SHA-256): ${creds.tokenHash}`);
  console.log(`Token Entropy: 256 bits (Valor en texto plano NO mostrado en consola)`);
  if (shouldWrite) {
    console.log(`Archivo de credenciales activas preparado: tests/.pilot_cred_active.json (Modo 0600, protegido en .gitignore)`);
  }
  console.log('\n--- SQL DE INSERCIÓN PREVIO A LA PRUEBA (1 FILA) ---');
  console.log(creds.sqlInsert);
  console.log('\n--- SQL DE LIMPIEZA POST-PRUEBA (EXACTO, SIN COMODINES) ---');
  console.log(creds.sqlCleanup);
  console.log('\n--- SQL DE VERIFICACIÓN DE CERO RESIDUOS ---');
  console.log(creds.sqlVerify);
}
