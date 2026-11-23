// tests/test_finance_kpi_qa_exclusion.mjs
// Validación en memoria de la exclusión quirúrgica de registros QA en KPIs globales B2B

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Iniciando prueba de exclusión quirúrgica de KPIs B2B...');

// 1. Extraer la lógica real de panel-admin/index.html
const htmlPath = path.resolve(__dirname, '../panel-admin/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extraer isQADistributor y updateFinanceSummary
const isQAMatch = html.match(/function isQADistributor\(distId\) \{[\s\S]*?\n    \}/);
if (!isQAMatch) {
  console.error('❌ FAIL: No se encontró isQADistributor en index.html');
  process.exit(1);
}

const updateSummaryMatch = html.match(/function updateFinanceSummary\(\) \{[\s\S]*?\n    \}/);
if (!updateSummaryMatch) {
  console.error('❌ FAIL: No se encontró updateFinanceSummary en index.html');
  process.exit(1);
}

// 2. Montar un entorno de ejecución simulado idéntico al panel
let billedText = '';
let collectedText = '';
let pendingText = '';
let overdueText = '';

const fakeDOM = {
  getElementById: (id) => {
    return {
      set innerText(val) {
        if (id === 'finance-stat-billed') billedText = val;
        if (id === 'finance-stat-collected') collectedText = val;
        if (id === 'finance-stat-pending') pendingText = val;
        if (id === 'finance-stat-overdue') overdueText = val;
      }
    };
  }
};

// 3. Crear el contexto de ejecución
const testCode = `
  ${isQAMatch[0]}

  let document = fakeDOM;
  let distributorsList = [];
  let invoicesList = [];
  let paymentsList = [];

  ${updateSummaryMatch[0]}

  return { isQADistributor, updateFinanceSummary, setDistributors: (d) => distributorsList = d, setInvoices: (i) => invoicesList = i, setPayments: (p) => paymentsList = p };
`;

const sandbox = new Function('fakeDOM', testCode)(fakeDOM);

// 4. Preparar escenarios de prueba
const currentMonth = new Date().toISOString().slice(0, 7);
const todayStr = new Date().toISOString().slice(0, 10);

// Mayorista 1: Mayorista Comercial Real A (Categoría Bebidas, Contratado)
const distCommercial = {
  id: 'dist-commercial-1',
  name: 'Distribuidora Central S.A.',
  recordType: 'contracted',
  category: 'Bebidas',
  notes: 'Cliente activo desde enero 2026'
};

// Mayorista 2: Prospecto Legítimo B (Categoría Golosinas, Prospect)
// REGLA: No debe ser excluido si tiene cuota/acuerdo comercial legítimo
const distProspect = {
  id: 'dist-prospect-1',
  name: 'Arcor Golosinas Mayorista',
  recordType: 'prospect',
  category: 'Golosinas',
  notes: 'Potencial anunciante en negociación'
};

// Mayorista 3: Mayorista de Prueba Técnica QA (Categoría QA_TEST)
const distQAByCategory = {
  id: 'dist-qa-category',
  name: 'Distribuidora Los Andes S.R.L.', // NOTA: Nombre 100% normal, no contiene "QA"
  recordType: 'contracted',
  category: 'QA_TEST', // Identificación explícita por categoría técnica
  notes: 'Registro de auditoría técnica'
};

// Mayorista 4: Mayorista de Prueba Técnica QA identificado por flag en notes
const distQAByNotes = {
  id: 'dist-qa-notes',
  name: 'Mayorista El Trébol', // Nombre normal
  recordType: 'contracted',
  category: 'Comestibles',
  notes: '<!--B2B_IS_QA:true--> Registro para pruebas de carga'
};

sandbox.setDistributors([distCommercial, distProspect, distQAByCategory, distQAByNotes]);

// Verificación 1: isQADistributor distingue inequívocamente sin usar el nombre
console.log('\n--- VERIFICACIÓN 1: Identificación explícita de registros QA ---');
const checkCommercial = sandbox.isQADistributor('dist-commercial-1');
const checkProspect = sandbox.isQADistributor('dist-prospect-1');
const checkQACat = sandbox.isQADistributor('dist-qa-category');
const checkQANotes = sandbox.isQADistributor('dist-qa-notes');

console.log('Comercial legítimo es QA?:', checkCommercial, checkCommercial === false ? '✅ PASS' : '❌ FAIL');
console.log('Prospecto legítimo es QA?:', checkProspect, checkProspect === false ? '✅ PASS' : '❌ FAIL');
console.log('QA por categoría es QA?:', checkQACat, checkQACat === true ? '✅ PASS' : '❌ FAIL');
console.log('QA por flag estructurado es QA?:', checkQANotes, checkQANotes === true ? '✅ PASS' : '❌ FAIL');

if (checkCommercial !== false || checkProspect !== false || checkQACat !== true || checkQANotes !== true) {
  console.error('❌ FAIL en la función isQADistributor');
  process.exit(1);
}

// 5. Configurar cuotas y pagos
// Cuota A: Comercial Real = $50.000 (Mes actual, pagado $30.000, saldo pendiente $20.000)
const invCommercial = {
  id: 'inv-1',
  distributor_id: 'dist-commercial-1',
  amount_original: 50000,
  amount_paid: 30000,
  due_date: `${currentMonth}-15`
};

// Pago A: Comercial Real = $30.000 (Mes actual)
const payCommercial = {
  id: 'pay-1',
  invoice_id: 'inv-1',
  distributor_id: 'dist-commercial-1',
  amount: 30000,
  payment_date: `${currentMonth}-05`
};

// Cuota B: Prospecto Legítimo = $10.000 (Mes actual, saldo pendiente $10.000)
const invProspect = {
  id: 'inv-2',
  distributor_id: 'dist-prospect-1',
  amount_original: 10000,
  amount_paid: 0,
  due_date: `${currentMonth}-20`
};

// Cuota C (QA_TEST): $60.000 (Mes actual, pagado simulado $20.000, saldo $40.000)
const invQA = {
  id: 'inv-qa-1',
  distributor_id: 'dist-qa-category',
  amount_original: 60000,
  amount_paid: 20000,
  due_date: `${currentMonth}-10`
};

// Pago C (QA_TEST): $20.000 (Mes actual)
const payQA = {
  id: 'pay-qa-1',
  invoice_id: 'inv-qa-1',
  distributor_id: 'dist-qa-category',
  amount: 20000,
  payment_date: `${currentMonth}-08`
};

sandbox.setInvoices([invCommercial, invProspect, invQA]);
sandbox.setPayments([payCommercial, payQA]);

// Ejecutar cálculo de KPIs
sandbox.updateFinanceSummary();

console.log('\n--- VERIFICACIÓN 2: Cálculo de KPIs Globales con exclusión QA ---');
console.log('KPI Facturado Mes Actual:', billedText);
console.log('KPI Cobrado Mes Actual:', collectedText);
console.log('KPI Pendiente Total:', pendingText);
console.log('KPI Vencidas:', overdueText);

// Comprobaciones esperadas:
// Facturado mes: solo Comercial ($50.000) + Prospecto ($10.000) = $60.000 (La cuota QA de $60.000 NO suma)
// Cobrado mes: solo Comercial ($30.000) (El pago QA de $20.000 NO suma)
// Pendiente total: Comercial ($20.000) + Prospecto ($10.000) = $30.000 (El saldo QA de $40.000 NO suma)
const expectedBilled = '$60.000';
const expectedCollected = '$30.000';
const expectedPending = '$30.000';

const billedOk = billedText.includes('60.000') && !billedText.includes('120.000');
const collectedOk = collectedText.includes('30.000') && !collectedText.includes('50.000');
const pendingOk = pendingText.includes('30.000') && !pendingText.includes('70.000');

console.log('Facturado Mes excluye QA ($60.000 esperado):', billedOk ? '✅ PASS' : '❌ FAIL');
console.log('Cobrado Mes excluye QA ($30.000 esperado):', collectedOk ? '✅ PASS' : '❌ FAIL');
console.log('Pendiente Total excluye QA ($30.000 esperado):', pendingOk ? '✅ PASS' : '❌ FAIL');

if (!billedOk || !collectedOk || !pendingOk) {
  console.error('❌ FAIL: Los KPIs no coinciden con los valores esperados.');
  process.exit(1);
}

console.log('\n🎉 TODAS LAS COMPROBACIONES DE EXCLUSIÓN DE KPIS APROBADAS (PASS)');

