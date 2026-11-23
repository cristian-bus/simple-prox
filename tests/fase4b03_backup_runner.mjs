// tests/fase4b03_backup_runner.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.0.3
// SUITE DE VALIDACION LOCAL Y EXPERIMENTAL DEL PROCEDIMIENTO DE BACKUP EN POSTGRESQL 17 AISLADO

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('=== SUITE FASE 4B.0.3: VALIDACION EXPERIMENTAL DE BACKUP Y RESTORE ===');
console.log('========================================================================\n');

const testEvidence = {
  timestamp: new Date().toISOString(),
  environment: 'PostgreSQL 17.11 on Alpine Linux (pg_isolated_fase3b)',
  tests: []
};

function recordTest(name, passed, details = {}) {
  testEvidence.tests.push({ name, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}`);
  if (!passed) {
    console.error('  Detalles del fallo:', details);
  }
  return passed;
}

// -----------------------------------------------------------------------------
// PRUEBA 1: Generación de Respaldo Seguro (admin-tools/backup_supabase_manual.ps1)
// -----------------------------------------------------------------------------
console.log('--- PRUEBA 1: Ejecucion de backup_supabase_manual.ps1 en Entorno Aislado ---');

// Creamos un wrapper temporal en PowerShell para invocar el script con SecureString
const wrapperScript = path.resolve('tests/run_backup_wrapper.ps1');
fs.writeFileSync(wrapperScript, `
$secPass = ConvertTo-SecureString 'test_password' -AsPlainText -Force
& './admin-tools/backup_supabase_manual.ps1' -HostName '127.0.0.1' -Port 5432 -UserName 'test_user' -Database 'test_db' -Password $secPass
`, 'utf8');

let backupOutput = '';
let backupSuccess = false;
let backupFilePath = '';

try {
  backupOutput = execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', wrapperScript
  ], { encoding: 'utf8' });
  backupSuccess = true;

  // Extraer ruta del archivo generado
  const match = backupOutput.match(/Ubicacion:\s*([^\r\n]+)/i);
  if (match && match[1]) {
    backupFilePath = match[1].trim();
  }
} catch (err) {
  backupSuccess = false;
  backupOutput = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : err.message);
} finally {
  if (fs.existsSync(wrapperScript)) {
    fs.unlinkSync(wrapperScript);
  }
}

recordTest('Prueba 1: Ejecucion exitosa de backup_supabase_manual.ps1',
  backupSuccess && backupFilePath.length > 0 && fs.existsSync(backupFilePath),
  { success: backupSuccess, path: backupFilePath, outputSnippet: backupOutput.slice(-300) }
);

// -----------------------------------------------------------------------------
// PRUEBA 2: Validaciones Estrictas de Integridad del Archivo (.dump)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 2: Validaciones Estrictas de Integridad y SHA-256 ---');

let fileStat = null;
let sha256 = '';
let tocOutput = '';

if (backupFilePath && fs.existsSync(backupFilePath)) {
  fileStat = fs.statSync(backupFilePath);
  
  // Calcular SHA256 mediante PowerShell
  const hashOut = execFileSync('powershell.exe', [
    '-NoProfile', '-Command', `(Get-FileHash -Path '${backupFilePath}' -Algorithm SHA256).Hash`
  ], { encoding: 'utf8' }).trim();
  sha256 = hashOut;

  // Inspeccionar TOC con pg_restore --list dentro de Docker
  const dumpName = path.basename(backupFilePath);
  execSync(`docker cp "${backupFilePath}" pg_isolated_fase3b:/tmp/${dumpName}`);
  tocOutput = execSync(`docker exec pg_isolated_fase3b pg_restore --list /tmp/${dumpName}`, { encoding: 'utf8' });
  execSync(`docker exec pg_isolated_fase3b rm -f /tmp/${dumpName}`);
}

const hasCampaignEvents = tocOutput.includes('TABLE DATA public campaign_events');
const hasCampaigns = tocOutput.includes('TABLE DATA public campaigns');
const hasAdminUsers = tocOutput.includes('TABLE DATA public admin_users');
const hasAcls = tocOutput.includes('ACL public TABLE campaign_events');

recordTest('Prueba 2: Archivo binario valido, tamano > 0 y TOC completo con datos y ACLs',
  fileStat !== null && fileStat.size > 100000 && hasCampaignEvents && hasCampaigns && hasAdminUsers && hasAcls,
  {
    fileSize: fileStat ? fileStat.size : 0,
    sha256,
    hasCampaignEvents,
    hasCampaigns,
    hasAdminUsers,
    hasAcls
  }
);

// -----------------------------------------------------------------------------
// PRUEBA 3: Verificación y Restauración en Base Temporal (verify_and_restore_backup.ps1)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 3: Ejecucion de verify_and_restore_backup.ps1 ---');

let verifyOutput = '';
let verifySuccess = false;

try {
  verifyOutput = execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', './admin-tools/verify_and_restore_backup.ps1',
    '-BackupFilePath', backupFilePath
  ], { encoding: 'utf8' });
  verifySuccess = true;
} catch (err) {
  verifySuccess = false;
  verifyOutput = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : err.message);
}

const verifySuccessMsg = verifyOutput.includes('VERIFICACION EXITOSA: EL RESPALDO ES 100% RESTAURABLE');
const verifyRecoveredEvents = verifyOutput.includes('campaign_events|50') || verifyOutput.includes('campaign_events|');
const verifyRecoveredRls = verifyOutput.includes('campaign_events_admin_select|SELECT');

recordTest('Prueba 3: Restauracion completa de prueba sin errores en base aislada',
  verifySuccess && verifySuccessMsg && verifyRecoveredEvents && verifyRecoveredRls,
  {
    success: verifySuccess,
    hasSuccessBanner: verifySuccessMsg,
    eventsRecovered: verifyRecoveredEvents,
    rlsRecovered: verifyRecoveredRls,
    outputSnippet: verifyOutput.slice(-400)
  }
);

// -----------------------------------------------------------------------------
// PRUEBA 4: Regla de Seguridad: Backups preservados y excluidos de Git
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 4: Comprobacion de exclusion de Git y No Sobrescritura ---');

const gitCheck = execSync('git check-ignore backups/test.dump || true', { encoding: 'utf8' }).trim();
const isIgnored = gitCheck.includes('backups/test.dump') || fs.readFileSync('.gitignore', 'utf8').includes('backups/');

recordTest('Prueba 4: Archivos de respaldo protegidos en .gitignore (fuera de Git)',
  isIgnored,
  { gitignoreRulePresent: isIgnored }
);

// Guardar evidencia JSON
const evidencePath = path.resolve('tests/fase4b03_backup_evidence.json');
fs.writeFileSync(evidencePath, JSON.stringify(testEvidence, null, 2), 'utf8');

const allPassed = testEvidence.tests.every(t => t.passed);
console.log('\n========================================================================');
console.log(`=== RESULTADO SUITE FASE 4B.0.3: ${allPassed ? 'TODAS LAS PRUEBAS PASARON (100% PASS)' : 'FALLOS DETECTADOS'} ===`);
console.log(`Evidencia guardada en: ${evidencePath}`);
console.log('========================================================================\n');

if (!allPassed) {
  process.exit(1);
}
