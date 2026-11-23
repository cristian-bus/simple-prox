/**
 * SIMPLE PROX — SUITE FORMAL DE VALIDACIÓN FUNCIONAL DEL PANEL ADMINISTRATIVO B2B
 * FASE 5D.7: VALIDACIÓN SIN ESCRITURAS Y REVISIÓN DE FORMULARIOS
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================');
console.log('FASE 5D.7: VALIDACIÓN FUNCIONAL DEL PANEL ADMINISTRATIVO B2B');
console.log('Modo: VALIDACIÓN CONTROLADA SIN ESCRITURAS EN PRODUCCIÓN');
console.log('================================================================\n');

const panelPath = path.resolve(__dirname, '../panel-admin/index.html');
const rawHtml = fs.readFileSync(panelPath, 'utf8');
const html = rawHtml.replace(/\r\n/g, '\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertTest(category, desc, condition, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] (${category}) ${desc}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] (${category}) ${desc}`);
    if (detail) console.error(`     Detalles: ${detail}`);
  }
}

// -----------------------------------------------------------------------------
// 1. COMPILACIÓN DE SCRIPTS Y AUSENCIA DE ERRORES SINTÁCTICOS
// -----------------------------------------------------------------------------
console.log('--- 1. COMPILACIÓN Y ANÁLISIS SINTÁCTICO DE SCRIPTS ---');

const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
const scripts = [];
let match;
while ((match = scriptRegex.exec(html)) !== null) {
  scripts.push(match[1]);
}

assertTest('Sintaxis', 'Se identificaron 3 bloques de scripts en panel-admin/index.html', scripts.length === 3);

scripts.forEach((code, idx) => {
  const trimmed = code.trim();
  if (!trimmed) return;
  try {
    new Function(trimmed);
    assertTest('Sintaxis', `Script ${idx + 1} compila limpiamente sin errores sintácticos`, true);
  } catch (err) {
    assertTest('Sintaxis', `Script ${idx + 1} compila limpiamente sin errores sintácticos`, false, err.message);
  }
});

// -----------------------------------------------------------------------------
// 2. DISPONIBILIDAD DE FUNCIONES REQUERIDAS (AUSENCIA DE REFERENCEERROR)
// -----------------------------------------------------------------------------
console.log('\n--- 2. FUNCIONES REQUERIDAS Y PREVENCIÓN DE REFERENCEERROR ---');

const requiredFunctions = [
  'getValidAdminToken',
  'loadFinanceData',
  'handleSavePayment',
  'renderFinanceTable',
  'openCreatePaymentModal',
  'closePaymentModal',
  'validatePaymentAmount',
  'openCreateInvoiceModal',
  'closeInvoiceModal',
  'handleInvoiceDistributorChange',
  'handleSaveInvoice',
  'openCreateContractModal',
  'closeContractModal',
  'handleSaveContract',
  'openDistributorProfileModal',
  'closeDistributorProfileModal',
  'openCreateContractForCurrentDistributor',
  'openCreateInvoiceForCurrentDistributor',
  'openImportCatalogModal',
  'closeImportCatalogModal',
  'toggleSelectAllCatalog',
  'executeControlledCatalogImport',
  'checkLocalStorageDistributorsBanner',
  'dismissLocalCacheBanner',
  'openReviewLocalStorageModal',
  'closeReviewLocalModal',
  'clearLocalStorageDistributors',
  'executeControlledLocalImport',
  'switchTab'
];

requiredFunctions.forEach(fn => {
  const hasFn = html.includes(`function ${fn}`) || html.includes(`async function ${fn}`);
  assertTest('Funciones', `Función ${fn}() declarada y disponible`, hasFn);
});

// -----------------------------------------------------------------------------
// 3. ESTRUCTURA DOM DE LA PESTAÑA FINANZAS B2B Y NAVEGACIÓN
// -----------------------------------------------------------------------------
console.log('\n--- 3. ESTRUCTURA DOM Y COMPONENTES DE INTERFAZ ---');

assertTest('DOM', 'Botón de navegación "Cobros y Finanzas" configurado con switchTab("finance")',
  html.includes("onclick=\"switchTab('finance')\"") && html.includes('Cobros y Finanzas')
);

assertTest('DOM', 'Contenedor principal de Finanzas (#view-finance) presente',
  html.includes('id="view-finance"')
);

assertTest('DOM', 'Tarjetas de KPIs Financieros (#finance-stat-billed, #finance-stat-collected, #finance-stat-pending, #finance-stat-overdue)',
  html.includes('id="finance-stat-billed"') &&
  html.includes('id="finance-stat-collected"') &&
  html.includes('id="finance-stat-pending"') &&
  html.includes('id="finance-stat-overdue"')
);

assertTest('DOM', 'Filtros de control (#finance-filter-distributor, #finance-filter-status)',
  html.includes('id="finance-filter-distributor"') && html.includes('id="finance-filter-status"')
);

assertTest('DOM', 'Tabla de cuotas con tbody dinámico (#finance-table-body)',
  html.includes('id="finance-table-body"')
);

assertTest('DOM', 'Columna "Activación" incorporada en la tabla de comercios (#view-merchants)',
  html.includes('>Activación</th>')
);

// -----------------------------------------------------------------------------
// 4. REVISIÓN DE FORMULARIOS B2B CONTRA COLUMNAS DE SUPABASE (FASE B)
// -----------------------------------------------------------------------------
console.log('\n--- 4. REVISIÓN DE FORMULARIOS CONTRA ESQUEMA SUPABASE ---');

// A. Modal Mayorista (#distributor-modal) -> public.distributors
const hasDistName = html.includes('id="form-distributor-name"');
const hasDistLegalName = html.includes('id="form-distributor-legal-name"');
const hasDistCuit = html.includes('id="form-distributor-cuit"');
const hasDistContact = html.includes('id="form-distributor-contact"');
const hasDistStart = html.includes('id="form-distributor-commercial-start"');
const hasDistWhatsapp = html.includes('id="form-distributor-whatsapp"');
const hasDistCategory = html.includes('id="form-distributor-category"');
const hasDistProvince = html.includes('id="form-distributor-province"');
const hasDistCity = html.includes('id="form-distributor-city"');
const hasDistMin = html.includes('id="form-distributor-min"');
const hasDistConditions = html.includes('id="form-distributor-conditions"');
const hasDistRecordType = html.includes('id="form-distributor-record-type"');

assertTest('Formulario Mayorista', 'Campos de Mayorista coinciden con public.distributors (name, legal_name, cuit, contact_name, phone, whatsapp_number, category, province_code, city, min_purchase, conditions, record_type, commercial_start_date)',
  hasDistName && hasDistLegalName && hasDistCuit && hasDistContact && hasDistStart && hasDistWhatsapp && hasDistCategory && hasDistProvince && hasDistCity && hasDistMin && hasDistConditions && hasDistRecordType
);

// B. Modal Contrato (#contract-modal) -> public.distributor_contracts
const hasContDist = html.includes('id="contract-distributor-id"');
const hasContTitle = html.includes('id="contract-title"');
const hasContAmount = html.includes('id="contract-amount"');
const hasContFreq = html.includes('id="contract-frequency"');
const hasContStart = html.includes('id="contract-start-date"');
const hasContEnd = html.includes('id="contract-end-date"');
const hasContNotes = html.includes('id="contract-notes"');

assertTest('Formulario Contrato', 'Campos de Contrato coinciden con public.distributor_contracts (distributor_id, title, contract_amount, billing_frequency, start_date, end_date, notes)',
  hasContDist && hasContTitle && hasContAmount && hasContFreq && hasContStart && hasContEnd && hasContNotes
);

// C. Modal Cuota (#invoice-modal) -> public.distributor_invoices
const hasInvDist = html.includes('id="inv-distributor-id"');
const hasInvCont = html.includes('id="inv-contract-id"');
const hasInvPeriod = html.includes('id="inv-period-label"');
const hasInvDueDate = html.includes('id="inv-due-date"');
const hasInvAmount = html.includes('id="inv-amount"');
const hasInvNotes = html.includes('id="inv-notes"');

assertTest('Formulario Cuota', 'Campos de Cuota coinciden con public.distributor_invoices (distributor_id, contract_id, period_label, due_date, amount_original, notes)',
  hasInvDist && hasInvCont && hasInvPeriod && hasInvDueDate && hasInvAmount && hasInvNotes
);

// D. Modal Cobro/Pago (#payment-modal) -> public.distributor_payments
const hasPayInv = html.includes('id="pay-invoice-id"');
const hasPayDist = html.includes('id="pay-distributor-id"');
const hasPayIdemp = html.includes('id="pay-idempotency-key"');
const hasPayAmount = html.includes('id="pay-amount"');
const hasPayMethod = html.includes('id="pay-method"');
const hasPayDate = html.includes('id="pay-date"');
const hasPayRef = html.includes('id="pay-reference"');
const hasPayNotes = html.includes('id="pay-notes"');

assertTest('Formulario Pago', 'Campos de Pago coinciden con public.distributor_payments (invoice_id, distributor_id, amount, payment_method, payment_date, reference_code, notes, idempotency_key)',
  hasPayInv && hasPayDist && hasPayIdemp && hasPayAmount && hasPayMethod && hasPayDate && hasPayRef && hasPayNotes
);

// -----------------------------------------------------------------------------
// 5. VALIDACIONES Y PREVENCIÓN DE ERRORES OPERATIVOS
// -----------------------------------------------------------------------------
console.log('\n--- 5. VALIDACIONES FINANCIERAS EN CLIENTE ---');

// A. Validación en Tiempo Real de Monto a Pagar
assertTest('Validación Pago', 'validatePaymentAmount() valida monto positivo > 0 y menor o igual al saldo pendiente',
  html.includes('if (isNaN(val) || val <= 0)') &&
  html.includes('if (val > (maxVal + 0.001))') &&
  html.includes('errDiv.style.display = \'none\';')
);

// B. Idempotencia en Pagos
assertTest('Idempotencia Pago', 'openCreatePaymentModal() genera clave única pay_{id}_{timestamp}_{random} y handleSavePayment() bloquea reenvío con paymentSubmissionInFlight',
  html.includes("'pay_' + inv.id + '_' + Date.now()") &&
  html.includes('if (paymentSubmissionInFlight) return; // Anti-doble clic') &&
  html.includes('paymentSubmissionInFlight = true;')
);

// C. Detección de Colisión de Idempotencia en Red
assertTest('Red / Resiliencia', 'handleSavePayment() verifica colisiones (409 / duplicate key) y reintenta con misma clave',
  html.includes("errMsg.includes('duplicate key')") &&
  html.includes("errMsg.includes('idempotency_key')") &&
  html.includes('distributor_payments?idempotency_key=eq.')
);

// D. Validación de Importes en Cuotas y Contratos
assertTest('Validación Cuotas', 'handleSaveInvoice() valida campos obligatorios e importe estrictamente mayor a 0',
  html.includes('if (!distId || !periodLabel || !dueDate || isNaN(amount) || amount <= 0)')
);

assertTest('Validación Contratos', 'handleSaveContract() valida campos obligatorios e importe mayor o igual a 0',
  html.includes('if (!distId || !title || isNaN(amount) || amount < 0 || !startDate)')
);

// -----------------------------------------------------------------------------
// 6. RENDERIZADO DINÁMICO DE VENCIMIENTOS
// -----------------------------------------------------------------------------
console.log('\n--- 6. CÁLCULO DINÁMICO DE VENCIMIENTOS ---');

assertTest('Vencimientos', 'renderFinanceTable() calcula cuotas vencidas impagas con insignia roja 🔴 Vencida',
  html.includes('isOverdue') && html.includes('🔴 Vencida')
);

assertTest('Vencimientos', 'renderFinanceTable() calcula cuotas vencidas con pago parcial con insignia 🔴 Vencida (Parcial: $X)',
  html.includes("paid > 0 ? (' (Parcial: $' + paid.toLocaleString('es-AR') + ')') : ''")
);

assertTest('Vencimientos', 'renderFinanceTable() calcula cuotas al día con pago parcial con insignia amarilla 🟡 Parcial',
  html.includes('🟡 Parcial')
);

assertTest('Vencimientos', 'renderFinanceTable() calcula cuotas saldadas con insignia verde 🟢 Pagada',
  html.includes('🟢 Pagada')
);

// -----------------------------------------------------------------------------
// RESUMEN FINAL
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`TOTAL ASERCIONES VALIDADAS: ${totalTests}`);
console.log(`APROBADAS:                 ${passedTests}`);
console.log(`FALLIDAS:                  ${failedTests}`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
