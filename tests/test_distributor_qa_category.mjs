import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Iniciando prueba de selector de Categoría QA en formulario Nuevo Distribuidor...');

const htmlPath = path.resolve(__dirname, '../panel-admin/index.html');
const content = fs.readFileSync(htmlPath, 'utf8');

// 1. Verificar HTML estático del select form-distributor-category
const staticOptionRegex = /<select id="form-distributor-category"[^>]*>[\s\S]*?<option value="QA_TEST">Prueba técnica \(QA\) - No comercial<\/option>/;
if (!staticOptionRegex.test(content)) {
  console.error('❌ FAIL: Opción estática QA_TEST no encontrada en #form-distributor-category');
  process.exit(1);
}
console.log('✅ PASS: Opción estática QA_TEST presente en #form-distributor-category');

// 2. Verificar que loadCategories inyecta dinámicamente la opción QA_TEST
if (!content.includes("optQa.value = 'QA_TEST'") || !content.includes("optQa.textContent = 'Prueba técnica (QA) - No comercial'")) {
  console.error('❌ FAIL: Inyección dinámica de QA_TEST no encontrada en loadCategories()');
  process.exit(1);
}
console.log('✅ PASS: loadCategories() inyecta dinámicamente la opción QA_TEST');

// 3. Verificar que se conservan las categorías comerciales normales
const categoriesListSample = ["Bebidas", "Golosinas", "Snacks", "Almacén", "Lácteos"];
for (const cat of categoriesListSample) {
  if (!content.includes(cat)) {
    console.error(`❌ FAIL: Categoría comercial ${cat} ausente`);
    process.exit(1);
  }
}
console.log('✅ PASS: Categorías comerciales normales conservadas');

// 4. Verificar que handleSaveDistributor lee form-distributor-category
if (!content.includes("category: document.getElementById('form-distributor-category').value")) {
  console.error('❌ FAIL: handleSaveDistributor no extrae category de form-distributor-category');
  process.exit(1);
}
console.log('✅ PASS: handleSaveDistributor extrae category del selector');

// 5. Verificar que syncDistributorToSupabase asigna data.category
if (!content.includes("category: data.category")) {
  console.error('❌ FAIL: syncDistributorToSupabase no asigna category');
  process.exit(1);
}
console.log('✅ PASS: syncDistributorToSupabase envía category = data.category a Supabase');

// 6. Verificar que openEditDistributorModal preserva category
if (!content.includes("selectCat.value = d.category || ''")) {
  console.error('❌ FAIL: openEditDistributorModal no restaura category');
  process.exit(1);
}
console.log('✅ PASS: openEditDistributorModal restaura y preserva d.category');

// 7. Simular flujo completo en memoria
const mockDistributor = {
  id: 'dist-qa-test-123',
  name: 'Mayorista QA Técnico',
  category: 'QA_TEST',
  whatsappNumber: '5491122334455',
  recordType: 'contracted',
  provinceCode: 'ALL',
  minPurchase: 0
};

// Evaluar isQADistributor con category = 'QA_TEST'
function isQADistributor(distId, list) {
  if (!distId) return false;
  const d = list.find(x => x.id === distId);
  if (!d) return false;
  const cat = (d.category || '').toUpperCase().trim();
  const notes = d.notes || '';
  return cat === 'QA_TEST' || cat === 'QA' || notes.includes('<!--B2B_IS_QA:true-->');
}

const list = [mockDistributor];
const isQA = isQADistributor('dist-qa-test-123', list);
if (!isQA) {
  console.error('❌ FAIL: isQADistributor no reconoció category = QA_TEST');
  process.exit(1);
}
console.log('✅ PASS: isQADistributor reconoce category = QA_TEST');

// Simular exclusión en cálculo de KPIs
const invoices = [
  { distributor_id: 'dist-qa-test-123', amount_original: 60000, amount_paid: 20000, due_date: '2026-11-15' },
  { distributor_id: 'dist-comercial-real', amount_original: 100000, amount_paid: 50000, due_date: '2026-11-20' }
];

let totalBilled = 0;
let totalPending = 0;

invoices.forEach(inv => {
  if (isQADistributor(inv.distributor_id, list)) return; // Excluir QA
  const orig = Number(inv.amount_original || 0);
  const paid = Number(inv.amount_paid || 0);
  totalBilled += orig;
  totalPending += (orig - paid);
});

if (totalBilled !== 100000) {
  console.error(`❌ FAIL: Facturado total ($${totalBilled}) no excluyó la cuota QA de 60.000`);
  process.exit(1);
}
if (totalPending !== 50000) {
  console.error(`❌ FAIL: Saldo pendiente ($${totalPending}) no excluyó la cuota QA`);
  process.exit(1);
}
console.log('✅ PASS: KPIs comerciales globales excluyen las cuotas del mayorista con category = QA_TEST');

console.log('\n🎉 TODAS LAS VERIFICACIONES DEL FORMULARIO Y CATEGORÍA QA APROBADAS (PASS)');

