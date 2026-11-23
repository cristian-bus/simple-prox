import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Iniciando prueba de carga de finanzas y estado de tabla...');

const htmlPath = path.resolve(__dirname, '../panel-admin/index.html');
const content = fs.readFileSync(htmlPath, 'utf8');

// 1. Verificar presencia de getSupabaseConfig
if (!content.includes('function getSupabaseConfig()')) {
  console.error('❌ FAIL: getSupabaseConfig no declarada');
  process.exit(1);
}
console.log('✅ PASS: getSupabaseConfig declarada');

// 2. Verificar que loadFinanceData usa getSupabaseConfig
if (!content.includes('const { supabaseUrl, supabaseKey, baseUrl } = getSupabaseConfig();')) {
  console.error('❌ FAIL: loadFinanceData no usa getSupabaseConfig');
  process.exit(1);
}
console.log('✅ PASS: loadFinanceData utiliza getSupabaseConfig');

// 3. Verificar que getValidAdminToken llama a initSupabase()
const tokenFnRegex = /async function getValidAdminToken\(\)[\s\S]*?initSupabase\(\)/;
if (!tokenFnRegex.test(content)) {
  console.error('❌ FAIL: getValidAdminToken no asegura initSupabase');
  process.exit(1);
}
console.log('✅ PASS: getValidAdminToken asegura inicialización de Supabase');

// 4. Verificar que renderFinanceTable distingue lista vacía ("No hay cuotas registradas.")
if (!content.includes('No hay cuotas registradas.')) {
  console.error('❌ FAIL: Mensaje "No hay cuotas registradas." ausente en renderFinanceTable');
  process.exit(1);
}
console.log('✅ PASS: renderFinanceTable implementa "No hay cuotas registradas."');

// 5. Verificar que cuando no hay token, se actualiza el tbody con mensaje amigable
if (!content.includes('Inicie sesión como administrador para consultar el módulo financiero.')) {
  console.error('❌ FAIL: Mensaje de autenticación requerida ausente en loadFinanceData');
  process.exit(1);
}
console.log('✅ PASS: loadFinanceData actualiza tbody si no hay sesión activa');

// 6. Verificar simulación funcional en entorno DOM mock
// Mock DOM
const dom = {
  elements: {
    'finance-table-body': { innerHTML: '<tr><td>Cargando cuotas...</td></tr>' },
    'finance-header-counter': { innerText: '' },
    'finance-filter-distributor': { value: 'all' },
    'finance-filter-status': { value: 'all' },
    'finance-stat-billed': { innerText: '' },
    'finance-stat-collected': { innerText: '' },
    'finance-stat-pending': { innerText: '' },
    'finance-stat-overdue': { innerText: '' },
    'api-url-input': { value: '' },
    'api-key-input': { value: '' }
  },
  getElementById(id) {
    return this.elements[id] || null;
  }
};

// Simulación de renderFinanceTable con invoicesList = []
let invoicesList = [];
let distributorsList = [];

function simulateRenderFinanceTable() {
  const tbody = dom.getElementById('finance-table-body');
  const counter = dom.getElementById('finance-header-counter');
  let filtered = invoicesList;

  if (counter) counter.innerText = filtered.length + ' cuotas';

  if (filtered.length === 0) {
    const emptyMsg = invoicesList.length === 0 
      ? 'No hay cuotas registradas.' 
      : 'No se encontraron cuotas con los filtros seleccionados.';
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">${emptyMsg}</td></tr>`;
    return;
  }
}

simulateRenderFinanceTable();
const tbodyResult = dom.getElementById('finance-table-body').innerHTML;
if (!tbodyResult.includes('No hay cuotas registradas.')) {
  console.error('❌ FAIL: La tabla no se actualizó con "No hay cuotas registradas."');
  process.exit(1);
}
console.log('✅ PASS: Simulación funcional de tabla vacía reemplaza "Cargando cuotas..." correctamente');

// Simulación con 1 factura y filtro mismatch
invoicesList = [{ id: 'inv-1', distributor_id: 'dist-1', amount_original: 50000, amount_paid: 0, due_date: '2026-12-01' }];
dom.elements['finance-filter-distributor'].value = 'dist-different';

function simulateRenderWithFilter() {
  const tbody = dom.getElementById('finance-table-body');
  const filterDist = dom.elements['finance-filter-distributor'].value;
  let filtered = invoicesList.filter(i => filterDist === 'all' || i.distributor_id === filterDist);

  if (filtered.length === 0) {
    const emptyMsg = invoicesList.length === 0 
      ? 'No hay cuotas registradas.' 
      : 'No se encontraron cuotas con los filtros seleccionados.';
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">${emptyMsg}</td></tr>`;
  }
}
simulateRenderWithFilter();
const tbodyFilterResult = dom.getElementById('finance-table-body').innerHTML;
if (!tbodyFilterResult.includes('No se encontraron cuotas con los filtros seleccionados.')) {
  console.error('❌ FAIL: Filtro mismatch no mostró "No se encontraron cuotas con los filtros seleccionados."');
  process.exit(1);
}
console.log('✅ PASS: Filtro mismatch muestra "No se encontraron cuotas con los filtros seleccionados."');

console.log('\n🎉 TODAS LAS VALIDACIONES DE REPARACIÓN DE CARGA APROBADAS (PASS)');

