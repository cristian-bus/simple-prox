/**
 * SIMPLE PROX — PRUEBA DE ESTRUCTURA Y SINTAXIS DE VINCULACIÓN FASE 5D.10
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================');
console.log('FASE 5D.10: AUDITORÍA DE SCRIPTS Y RESPALDO DE VINCULACIÓN');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertTest(desc, condition, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${desc}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${desc} ${detail ? '-> ' + detail : ''}`);
  }
}

// 1. Respaldo
const backupPath = path.resolve(__dirname, '../backups/campaigns_pre_link_backup_20261103.json');
assertTest('Respaldo JSON existe en backups/', fs.existsSync(backupPath));

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
assertTest('Respaldo contiene exactamente 17 campañas', backup.campaigns.length === 17);
assertTest('Todas las campañas en el respaldo tienen distributor_id = null', backup.campaigns.every(c => c.distributor_id === null));

// 2. Script de vinculación
const sqlPath = path.resolve(__dirname, 'sql/vincular_distributor_id_fase5d10.sql');
assertTest('Script SQL vincular_distributor_id_fase5d10.sql existe', fs.existsSync(sqlPath));

const sql = fs.readFileSync(sqlPath, 'utf8');
assertTest('Script SQL abre con BEGIN y cierra con COMMIT', sql.includes('BEGIN;') && sql.includes('COMMIT;'));
assertTest('Script SQL fija lock_timeout = 3s', sql.includes("lock_timeout = '3s'"));
assertTest('Script SQL valida existencia de los 7 distribuidores', sql.includes('v_distributors_count != 7'));
assertTest('Script SQL valida 17 campañas en NULL previas', sql.includes('v_null_dist_count != 17'));
assertTest('Script SQL comprueba supplier_name coincidente antes de actualizar', sql.includes("supplier_name != 'Mayorista El Triunfo'"));
assertTest('Script SQL comprueba 17 vinculadas post-update', sql.includes('v_updated_count != 17'));
assertTest('Script SQL comprueba individualmente las 17 relaciones exactas con IS DISTINCT FROM', sql.includes('v_exact_mismatch_count') && sql.includes('IS DISTINCT FROM'));
assertTest('Script SQL garantiza 0 campañas para Mayorista Andino QA', sql.includes('v_andino_campaigns != 0'));

// 3. Script de rollback
const rollbackPath = path.resolve(__dirname, 'sql/rollback_vincular_distributor_id_fase5d10.sql');
assertTest('Script SQL rollback_vincular_distributor_id_fase5d10.sql existe', fs.existsSync(rollbackPath));

const rollback = fs.readFileSync(rollbackPath, 'utf8');
assertTest('Script Rollback valida 17 vinculadas antes de revertir', rollback.includes('v_linked_count != 17'));
assertTest('Script Rollback restaura distributor_id = NULL', rollback.includes('SET distributor_id = NULL'));
assertTest('Script Rollback valida 17 en NULL post-reversión', rollback.includes('v_null_after != 17'));

console.log('\n================================================================');
console.log(`TOTAL PRUEBAS: ${totalTests} | APROBADAS: ${passedTests} | FALLIDAS: ${failedTests}`);
console.log('================================================================');

if (failedTests > 0) process.exit(1);

