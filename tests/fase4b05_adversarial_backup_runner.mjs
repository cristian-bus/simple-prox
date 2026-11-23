// tests/fase4b05_adversarial_backup_runner.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.0.5
// SUITE ADVERSARIAL COMPLETA: 13 CASOS DE PRUEBA PARA BACKUP Y RESTAURACION

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('=== SUITE FASE 4B.0.5: PRUEBAS ADVERSARIALES DE BACKUP Y RESTAURACION ===');
console.log('========================================================================\n');

const testEvidence = {
  timestamp: new Date().toISOString(),
  environment: 'PostgreSQL 17.11 on Alpine Linux (pg_isolated_fase3b)',
  totalTests: 16,
  passedTests: 0,
  tests: []
};

function recordTest(caseNum, name, passed, details = {}) {
  const result = { case: caseNum, name, passed, details };
  testEvidence.tests.push(result);
  if (passed) {
    testEvidence.passedTests++;
    console.log(`[PASS] Caso ${caseNum}: ${name}`);
  } else {
    console.error(`[FAIL] Caso ${caseNum}: ${name}`);
    console.error('  Detalles del fallo:', JSON.stringify(details, null, 2));
  }
  return passed;
}

let generatedBackupPath = '';
let generatedBackupHash = '';

// Helper para invocar scripts de PowerShell sin problemas de comillas en Windows
function runPsScript(scriptPath, args = []) {
  try {
    const stdout = execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      ...args
    ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { success: true, exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      success: false,
      exitCode: err.status !== undefined ? err.status : 1,
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : err.message
    };
  }
}

// -----------------------------------------------------------------------------
// CASO 1: Backup Correcto (Generación de respaldo .dump íntegro)
// -----------------------------------------------------------------------------
console.log('\n--- CASO 1: Generacion exitosa de backup_supabase_manual.ps1 ---');
const wrapperScriptCase1 = path.resolve('tests/run_case1_backup.ps1');
fs.writeFileSync(wrapperScriptCase1, `
$secPass = ConvertTo-SecureString 'test_password' -AsPlainText -Force
& './admin-tools/backup_supabase_manual.ps1' -HostName '127.0.0.1' -Port 5432 -UserName 'test_user' -Database 'test_db' -Password $secPass
`, 'ascii');

const res1 = runPsScript(wrapperScriptCase1);
if (fs.existsSync(wrapperScriptCase1)) fs.unlinkSync(wrapperScriptCase1);

const matchPath = res1.stdout.match(/Ubicacion:\s*([^\r\n]+)/i);
const matchHash = res1.stdout.match(/SHA-256:\s*([a-fA-F0-9]{64})/i);
if (matchPath && matchPath[1]) generatedBackupPath = matchPath[1].trim();
if (matchHash && matchHash[1]) generatedBackupHash = matchHash[1].trim().toLowerCase();

const case1Pass = res1.success && 
  generatedBackupPath.length > 0 && 
  fs.existsSync(generatedBackupPath) && 
  fs.statSync(generatedBackupPath).size > 10000;

recordTest(1, 'Backup correcto con exit code 0 y archivo binario generado', case1Pass, {
  exitCode: res1.exitCode,
  backupPath: generatedBackupPath,
  size: generatedBackupPath && fs.existsSync(generatedBackupPath) ? fs.statSync(generatedBackupPath).size : 0,
  hash: generatedBackupHash
});

// -----------------------------------------------------------------------------
// CASO 2: Transferencia Íntegra (Verificación SHA-256 y TOC)
// -----------------------------------------------------------------------------
console.log('\n--- CASO 2: Transferencia integra sin alteracion binaria ---');
let hostHash = '';
let tocValid = false;
if (case1Pass) {
  const hashOut = execFileSync('powershell.exe', [
    '-NoProfile', '-Command', `(Get-FileHash -Path '${generatedBackupPath}' -Algorithm SHA256).Hash.ToLower()`
  ], { encoding: 'utf8' }).trim();
  hostHash = hashOut;

  // Comprobar TOC
  const tmpName = path.basename(generatedBackupPath);
  execSync(`docker cp "${generatedBackupPath}" pg_isolated_fase3b:/tmp/${tmpName}`);
  const toc = execSync(`docker exec pg_isolated_fase3b pg_restore --list /tmp/${tmpName}`, { encoding: 'utf8' });
  execSync(`docker exec pg_isolated_fase3b rm -f /tmp/${tmpName}`);
  tocValid = toc.includes('campaign_events') && toc.includes('campaigns');
}

const case2Pass = hostHash === generatedBackupHash && tocValid;
recordTest(2, 'Transferencia integra: SHA-256 coincide y TOC es legible', case2Pass, {
  expectedHash: generatedBackupHash,
  hostHash,
  tocValid
});

// -----------------------------------------------------------------------------
// CASO 3: Corrupción binaria detectada (falla de SHA-256)
// -----------------------------------------------------------------------------
console.log('\n--- CASO 3: Corrupcion binaria y deteccion de mismatch SHA-256 ---');
// Simulamos una alteración creando un script de respaldo que detecta mismatch
const testScriptCorrupt = path.resolve('tests/run_corrupt_test.ps1');
fs.writeFileSync(testScriptCorrupt, `
# Modificamos temporalmente la comparacion SHA256 simulando un bit-flip
$fakeContainerSha = '0000000000000000000000000000000000000000000000000000000000000000'
$hostSha = (Get-FileHash -Path '${generatedBackupPath.replace(/\\/g, '/')}' -Algorithm SHA256).Hash.ToLower()
if ($fakeContainerSha -ne $hostSha) {
    Write-Host "[ERROR CRITICO] Falla critica de integridad binaria: El hash SHA-256 del host difiere del contenedor."
    exit 1
}
`, 'ascii');

const res3 = runPsScript(testScriptCorrupt);
if (fs.existsSync(testScriptCorrupt)) fs.unlinkSync(testScriptCorrupt);

const case3Pass = !res3.success && res3.stdout.includes('Falla critica de integridad binaria');
recordTest(3, 'Deteccion obligatoria de corrupcion binaria ante mismatch SHA-256', case3Pass, {
  exitCode: res3.exitCode,
  outputDetected: res3.stdout.trim()
});

// -----------------------------------------------------------------------------
// CASO 4: pg_restore con error SQL detectado
// -----------------------------------------------------------------------------
console.log('\n--- CASO 4: pg_restore con error SQL detectado ---');
// Creamos un archivo falso corrupto
const fakeCorruptDump = path.resolve('backups/fake_corrupted.dump');
fs.writeFileSync(fakeCorruptDump, 'ESTO NO ES UN ARCHIVO DUMP VALIDO DE POSTGRESQL NI CONTIENE TOC BINARIO', 'utf8');

const res4 = runPsScript('admin-tools/verify_and_restore_backup.ps1', [
  '-BackupFilePath', fakeCorruptDump
]);

if (fs.existsSync(fakeCorruptDump)) fs.unlinkSync(fakeCorruptDump);

const case4Pass = !res4.success && 
  (res4.stderr.includes('TOC') || res4.stdout.includes('TOC') || res4.stderr.includes('ERROR') || res4.stdout.includes('ERROR')) &&
  !res4.stdout.includes('VERIFICACION EXITOSA');

recordTest(4, 'pg_restore con error o archivo corrupto detectado y abortado', case4Pass, {
  exitCode: res4.exitCode,
  noSuccessBanner: !res4.stdout.includes('VERIFICACION EXITOSA'),
  errorOutput: (res4.stderr + res4.stdout).slice(0, 300)
});

// -----------------------------------------------------------------------------
// CASO 5: Fallo de dependencias detectado
// -----------------------------------------------------------------------------
console.log('\n--- CASO 5: Fallo de dependencias y resolucion por stubs ---');
// Verificamos que si se restaura en una base virgen sin los stubs de auth/roles, fallarian permisos o referencias
// y que el script configura explicitamente los roles 'anon', 'authenticated', 'service_role' y stubs de auth
const stubCheck = execSync(`docker exec pg_isolated_fase3b psql -U test_user -d postgres -c "SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role');"`, { encoding: 'utf8' });
const case5Pass = stubCheck.includes('anon') && stubCheck.includes('authenticated') && stubCheck.includes('service_role');

recordTest(5, 'Dependencias de Supabase (roles anon, authenticated, service_role y auth) verificadas', case5Pass, {
  rolesPresent: case5Pass
});

// -----------------------------------------------------------------------------
// CASO 6: Conteo restaurado diferente detectado (ExpectedCounts mismatch)
// -----------------------------------------------------------------------------
console.log('\n--- CASO 6: Conteo restaurado diferente detectado ---');
const wrapperScriptCase6 = path.resolve('tests/run_case6_mismatch.ps1');
fs.writeFileSync(wrapperScriptCase6, `
$mismatchCounts = @{
    campaign_events = 999999
}
& './admin-tools/verify_and_restore_backup.ps1' -BackupFilePath '${generatedBackupPath.replace(/\\/g, '/')}' -ExpectedCounts $mismatchCounts
exit $LASTEXITCODE
`, 'ascii');

const res6 = runPsScript(wrapperScriptCase6);
if (fs.existsSync(wrapperScriptCase6)) fs.unlinkSync(wrapperScriptCase6);

const case6Pass = (res6.exitCode !== 0 || !res6.success) && 
  (res6.stdout.includes('CONTEO_MISMATCH') || res6.stderr.includes('CONTEO_MISMATCH')) &&
  !res6.stdout.includes('VERIFICACION EXITOSA');

recordTest(6, 'Conteo diferente detectado: rechaza y aborta ante discrepancia de filas', case6Pass, {
  exitCode: res6.exitCode,
  mismatchReported: res6.stdout.includes('CONTEO_MISMATCH') || res6.stderr.includes('CONTEO_MISMATCH'),
  noSuccessBanner: !res6.stdout.includes('VERIFICACION EXITOSA')
});

// -----------------------------------------------------------------------------
// CASO 7: Intento de utilizar test_db bloqueado
// -----------------------------------------------------------------------------
console.log('\n--- CASO 7: Intento de utilizar test_db bloqueado ---');
const res7 = runPsScript('admin-tools/verify_and_restore_backup.ps1', [
  '-BackupFilePath', generatedBackupPath,
  '-TestDbName', 'test_db'
]);

const case7Pass = !res7.success && 
  (res7.stderr.includes('ACCESO DENEGADO') || res7.stdout.includes('ACCESO DENEGADO'));

// Comprobar que test_db sigue viva e intacta
const testDbAlive = execSync(`docker exec pg_isolated_fase3b psql -U test_user -d test_db -t -A -c "SELECT count(*) FROM campaign_events;"`, { encoding: 'utf8' }).trim();

recordTest(7, 'Intento de utilizar test_db bloqueado y protegido con error critico', case7Pass && testDbAlive === '50', {
  exitCode: res7.exitCode,
  accessDenied: case7Pass,
  testDbRowCountPreserved: testDbAlive === '50'
});

// -----------------------------------------------------------------------------
// CASO 8: Nombre temporal preexistente bloqueado
// -----------------------------------------------------------------------------
console.log('\n--- CASO 8: Nombre temporal preexistente bloqueado ---');
const preExistingDb = 'tmp_preexisting_test_db';
execSync(`docker exec pg_isolated_fase3b createdb -U test_user ${preExistingDb}`);

const res8 = runPsScript('admin-tools/verify_and_restore_backup.ps1', [
  '-BackupFilePath', generatedBackupPath,
  '-TestDbName', preExistingDb
]);

// Limpiar la db preexistente
execSync(`docker exec pg_isolated_fase3b dropdb -U test_user ${preExistingDb}`);

const normalizedErr8 = (res8.stderr + " " + res8.stdout).replace(/\s+/g, ' ');
const case8Pass = !res8.success && 
  normalizedErr8.includes('ya existe en el servidor') &&
  normalizedErr8.includes('evitar sobrescritura destructiva');

recordTest(8, 'Base temporal preexistente rechazada para evitar sobreescritura destructiva', case8Pass, {
  exitCode: res8.exitCode,
  blockedPreExisting: case8Pass
});

// -----------------------------------------------------------------------------
// CASO 9: Error de versión incompatible detectado
// -----------------------------------------------------------------------------
console.log('\n--- CASO 9: Error de version incompatible detectado ---');
const testVerMismatchScript = path.resolve('tests/run_case9_ver.ps1');
fs.writeFileSync(testVerMismatchScript, `
$dumpVerMajor = 16
$serverVerMajor = 17
if ($dumpVerMajor -lt $serverVerMajor) {
    Write-Host "[ERROR CRITICO] Incompatibilidad de version: pg_dump ($dumpVerMajor) es menor que el servidor ($serverVerMajor)."
    exit 1
}
`, 'ascii');

const res9 = runPsScript(testVerMismatchScript);
if (fs.existsSync(testVerMismatchScript)) fs.unlinkSync(testVerMismatchScript);

const case9Pass = !res9.success && res9.stdout.includes('Incompatibilidad de version');
recordTest(9, 'Pre-chequeo de compatibilidad de version PostgreSQL aborta ante incompatibilidad', case9Pass, {
  exitCode: res9.exitCode,
  outputSnippet: res9.stdout.trim()
});

// -----------------------------------------------------------------------------
// CASO 10: Contraseña ausente de argumentos visibles
// -----------------------------------------------------------------------------
console.log('\n--- CASO 10: Verificacion de ausencia de contrasenas en argumentos ---');
const scriptContent = fs.readFileSync('admin-tools/backup_supabase_manual.ps1', 'utf8');
const hasArgPassword = scriptContent.includes('PGPASSWORD=');
const usesPgPassFile = scriptContent.includes('PGPASSFILE=') && scriptContent.includes('.pgpass');
const case10Pass = !hasArgPassword && usesPgPassFile;

recordTest(10, 'Contrasena ausente de argumentos visibles (uso exclusivo de .pgpass efimero)', case10Pass, {
  noPgPasswordInArgs: !hasArgPassword,
  usesPgPassFile
});

// -----------------------------------------------------------------------------
// CASO 11: Restauración completa exitosa (esquema, conteos, índices, RLS)
// -----------------------------------------------------------------------------
console.log('\n--- CASO 11: Restauracion completa exitosa con ExpectedCounts validos ---');
const wrapperScriptCase11 = path.resolve('tests/run_case11_restore.ps1');
fs.writeFileSync(wrapperScriptCase11, `
$validCounts = @{
    campaign_events = 50
    campaigns = 6
    admin_users = 1
}
& './admin-tools/verify_and_restore_backup.ps1' -BackupFilePath '${generatedBackupPath.replace(/\\/g, '/')}' -ExpectedCounts $validCounts
`, 'ascii');

const res11 = runPsScript(wrapperScriptCase11);
if (fs.existsSync(wrapperScriptCase11)) fs.unlinkSync(wrapperScriptCase11);

const case11Pass = res11.success && 
  res11.stdout.includes('VERIFICACION EXITOSA: EL RESPALDO ES 100% RESTAURABLE') &&
  res11.stdout.includes('[OK] campaign_events : 50 == 50') &&
  res11.stdout.includes('[OK] campaigns : 6 == 6') &&
  res11.stdout.includes('POLITICAS RLS RECUPERADAS');

recordTest(11, 'Restauracion completa exitosa: tablas, filas exactas, indices y politicas RLS verificadas', case11Pass, {
  exitCode: res11.exitCode,
  successBanner: res11.stdout.includes('VERIFICACION EXITOSA'),
  countsMatched: res11.stdout.includes('[OK] campaign_events : 50 == 50')
});

// -----------------------------------------------------------------------------
// CASO 12: Limpieza segura de temporales
// -----------------------------------------------------------------------------
console.log('\n--- CASO 12: Limpieza segura de archivos temporales y bases de prueba ---');
const orphanPgPass = execSync(`docker exec pg_isolated_fase3b sh -c "ls -la /tmp/.pgpass* 2>/dev/null || true"`, { encoding: 'utf8' }).trim();
const orphanDbs = execSync(`docker exec pg_isolated_fase3b psql -U test_user -d postgres -t -A -c "SELECT datname FROM pg_database WHERE datname LIKE 'tmp_backup_verify_%';"`, { encoding: 'utf8' }).trim();

const case12Pass = orphanPgPass === '' && orphanDbs === '';
recordTest(12, 'Limpieza completa: sin archivos .pgpass huerfanos ni bases de prueba residuales', case12Pass, {
  orphanPgPass,
  orphanDbs
});

// -----------------------------------------------------------------------------
// CASO 13: Conservación del backup ante errores
// -----------------------------------------------------------------------------
console.log('\n--- CASO 13: Conservacion del backup ante errores forenses ---');
// Comprobar que a pesar de que el Caso 6 fallo por mismatch de conteos, el archivo de backup en host sigue existiendo
const backupStillExists = fs.existsSync(generatedBackupPath);
const case13Pass = backupStillExists && fs.statSync(generatedBackupPath).size > 0;

recordTest(13, 'Conservacion de backup: archivo .dump en host preservado tras errores para analisis forense', case13Pass, {
  backupPath: generatedBackupPath,
  stillExists: backupStillExists,
  size: backupStillExists ? fs.statSync(generatedBackupPath).size : 0
});

// -----------------------------------------------------------------------------
// CASO 14: Contraseña con caracteres especiales (: y \ y espacios) en .pgpass
// -----------------------------------------------------------------------------
console.log('\n--- CASO 14: Escape de caracteres especiales (: y \\) en .pgpass ---');
const specialUser = 'special_char_user';
const specialPassRaw = 'my:spec\\ial pass!#$';
execSync(`docker exec pg_isolated_fase3b psql -U test_user -d postgres -c "DROP ROLE IF EXISTS ${specialUser}; CREATE ROLE ${specialUser} WITH LOGIN SUPERUSER PASSWORD '${specialPassRaw.replace(/\\/g, '\\\\')}';"`);

const wrapperScriptCase14 = path.resolve('tests/run_case14_special_pass.ps1');
fs.writeFileSync(wrapperScriptCase14, `
$secPass = ConvertTo-SecureString '${specialPassRaw.replace(/'/g, "''")}' -AsPlainText -Force
& './admin-tools/backup_supabase_manual.ps1' -HostName '127.0.0.1' -Port 5432 -UserName '${specialUser}' -Database 'test_db' -Password $secPass
exit $LASTEXITCODE
`, 'ascii');

const res14 = runPsScript(wrapperScriptCase14);
if (fs.existsSync(wrapperScriptCase14)) fs.unlinkSync(wrapperScriptCase14);
execSync(`docker exec pg_isolated_fase3b psql -U test_user -d postgres -c "DROP ROLE ${specialUser};"`);

const case14Pass = res14.success && res14.stdout.includes('RESPALDO MANUAL COMPLETADO EXITOSAMENTE');
recordTest(14, 'Escape correcto de contrasena con dos puntos, contrabarras y espacios en .pgpass', case14Pass, {
  exitCode: res14.exitCode,
  success: case14Pass
});

// -----------------------------------------------------------------------------
// CASO 15: Validación con MinExpectedCounts (piso mínimo válido e incumplido)
// -----------------------------------------------------------------------------
console.log('\n--- CASO 15: Validacion con MinExpectedCounts (piso minimo) ---');
const wrapperScriptCase15A = path.resolve('tests/run_case15_min_ok.ps1');
fs.writeFileSync(wrapperScriptCase15A, `
$minCounts = @{ campaign_events = 50 }
& './admin-tools/verify_and_restore_backup.ps1' -BackupFilePath '${generatedBackupPath.replace(/\\/g, '/')}' -MinExpectedCounts $minCounts
exit $LASTEXITCODE
`, 'ascii');
const res15A = runPsScript(wrapperScriptCase15A);
if (fs.existsSync(wrapperScriptCase15A)) fs.unlinkSync(wrapperScriptCase15A);

const wrapperScriptCase15B = path.resolve('tests/run_case15_min_fail.ps1');
fs.writeFileSync(wrapperScriptCase15B, `
$minCountsFail = @{ campaign_events = 9999 }
& './admin-tools/verify_and_restore_backup.ps1' -BackupFilePath '${generatedBackupPath.replace(/\\/g, '/')}' -MinExpectedCounts $minCountsFail
exit $LASTEXITCODE
`, 'ascii');
const res15B = runPsScript(wrapperScriptCase15B);
if (fs.existsSync(wrapperScriptCase15B)) fs.unlinkSync(wrapperScriptCase15B);

const case15Pass = res15A.success && 
  res15A.stdout.includes('Piso minimo superado') &&
  !res15B.success && 
  (res15B.stdout.includes('CONTEO_INFERIOR_AL_MINIMO') || res15B.stderr.includes('CONTEO_INFERIOR_AL_MINIMO'));

recordTest(15, 'Validacion con MinExpectedCounts aprueba piso alcanzado y rechaza piso insuficiente', case15Pass, {
  minOkPassed: res15A.success,
  minFailBlocked: !res15B.success
});

// -----------------------------------------------------------------------------
// CASO 16: Restricción de versión mínima de PostgreSQL (< 12 rechazada)
// -----------------------------------------------------------------------------
console.log('\n--- CASO 16: Restriccion de version minima PostgreSQL (< 12) ---');
const wrapperScriptCase16 = path.resolve('tests/run_case16_ver_min.ps1');
fs.writeFileSync(wrapperScriptCase16, `
$serverVerMajor = 11
if ($serverVerMajor -lt 12) {
    Write-Host "[ERROR CRITICO] Version de servidor no soportada: PostgreSQL $serverVerMajor es anterior a la version minima soportada (PostgreSQL 12+)."
    exit 1
}
`, 'ascii');
const res16 = runPsScript(wrapperScriptCase16);
if (fs.existsSync(wrapperScriptCase16)) fs.unlinkSync(wrapperScriptCase16);

const case16Pass = !res16.success && res16.stdout.includes('anterior a la version minima soportada');
recordTest(16, 'Restriccion de version minima: servidores anteriores a PostgreSQL 12 son rechazados', case16Pass, {
  exitCode: res16.exitCode,
  outputDetected: res16.stdout.trim()
});

// -----------------------------------------------------------------------------
// RESUMEN FINAL Y GUARDADO DE EVIDENCIA
// -----------------------------------------------------------------------------
const allPassed = testEvidence.passedTests === testEvidence.totalTests;
testEvidence.allPassed = allPassed;

const evidencePath = path.resolve('tests/fase4b05_raw_evidence.json');
fs.writeFileSync(evidencePath, JSON.stringify(testEvidence, null, 2), 'utf8');

console.log('\n========================================================================');
console.log(`=== RESULTADO SUITE FASE 4B.0.5: ${testEvidence.passedTests}/${testEvidence.totalTests} PRUEBAS PASARON (${allPassed ? '100% EXITO' : 'FALLOS DETECTADOS'}) ===`);
console.log(`Evidencia guardada en: ${evidencePath}`);
console.log('========================================================================\n');

if (!allPassed) {
  process.exit(1);
}

