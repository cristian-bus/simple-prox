/**
 * SIMPLE PROX — PRUEBA DE BOTÓN ACTUALIZAR Y ACCESO A FICHA FINANCIERA (FASE 5D.9)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================');
console.log('FASE 5D.9: PRUEBA DE FEEDBACK ACTUALIZAR Y ACCESO A FICHA B2B');
console.log('================================================================\n');

const panelPath = path.resolve(__dirname, '../panel-admin/index.html');
const html = fs.readFileSync(panelPath, 'utf8');

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

// 1. REVISIÓN DEL IDENTIFICADOR DEL BOTÓN ACTUALIZAR
assertTest(
  'Botón Actualizar posee identificador estable "btn-finance-refresh"',
  html.includes('id="btn-finance-refresh"')
);

assertTest(
  'Botón Actualizar invoca loadFinanceData(true)',
  html.includes('id="btn-finance-refresh"') && html.includes('onclick="loadFinanceData(true)"')
);

// 2. REVISIÓN DE LA FUNCIÓN loadFinanceData()
const loadFnSnippet = html.slice(html.indexOf('async function loadFinanceData'), html.indexOf('function isQADistributor'));

assertTest(
  'loadFinanceData localiza y manipula #btn-finance-refresh',
  loadFnSnippet.includes("document.getElementById('btn-finance-refresh')")
);

assertTest(
  'loadFinanceData deshabilita el botón e indica "Actualizando..."',
  loadFnSnippet.includes('refreshBtn.disabled = true') && loadFnSnippet.includes('Actualizando...')
);

assertTest(
  'loadFinanceData refresca distribuidores cuando force === true',
  loadFnSnippet.includes('if (force || distributorsList.length === 0)') && loadFnSnippet.includes('fetchDistributorsFromSupabase()')
);

assertTest(
  'loadFinanceData consulta las 3 tablas B2B con validación de respuesta cRes.ok && iRes.ok && pRes.ok',
  loadFnSnippet.includes('!cRes.ok || !iRes.ok || !pRes.ok')
);

assertTest(
  'loadFinanceData previene sobrescritura de datos si alguna respuesta HTTP falla',
  loadFnSnippet.indexOf('!cRes.ok || !iRes.ok || !pRes.ok') < loadFnSnippet.indexOf('contractsList = await cRes.json()')
);

assertTest(
  'loadFinanceData muestra "✓ Actualizado" tras finalizar con éxito',
  loadFnSnippet.includes('✓ Actualizado')
);

assertTest(
  'loadFinanceData maneja errores y restaura el botón',
  loadFnSnippet.includes('catch (err)') && loadFnSnippet.includes('refreshBtn.disabled = false')
);

// 3. REVISIÓN DE renderFinanceTable() Y ENLACE A FICHA FINANCIERA
const renderTableSnippet = html.slice(html.indexOf('function renderFinanceTable()'), html.indexOf('function openCreatePaymentModal'));

assertTest(
  'renderFinanceTable vincula el nombre del mayorista a openDistributorProfileModal',
  renderTableSnippet.includes('openDistributorProfileModal(')
);

assertTest(
  'renderFinanceTable sanitiza ID y nombre del distribuidor antes de interpolar',
  renderTableSnippet.includes('safeDistId') && renderTableSnippet.includes('safeDistName')
);

assertTest(
  'renderFinanceTable mantiene intacto el botón Cobrar y sus parámetros',
  renderTableSnippet.includes('openCreatePaymentModal') && renderTableSnippet.includes('💵 Cobrar')
);

// 4. SIMULACIÓN DE COMPORTAMIENTO EN MEMORIA
console.log('\n--- Simulación Funcional de Exclusión y Estado ---');

const isQASnippet = html.slice(html.indexOf('function isQADistributor'), html.indexOf('function updateFinanceSummary'));
assertTest(
  'Función isQADistributor intacta y sin modificaciones no autorizadas',
  isQASnippet.includes("cat === 'QA_TEST'") && isQASnippet.includes("notes.includes('<!--B2B_IS_QA:true-->')")
);

console.log('\n================================================================');
console.log(`TOTAL PRUEBAS: ${totalTests} | APROBADAS: ${passedTests} | FALLIDAS: ${failedTests}`);
console.log('================================================================');

if (failedTests > 0) process.exit(1);

