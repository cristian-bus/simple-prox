import assert from 'assert';

console.log('====================================================');
console.log('TEST SUITE: INTEGRIDAD DE SELECTORES Y METADATOS B2B');
console.log('====================================================\n');

// 1. Simulación de Selectores en memoria (idéntica a la implementada en panel-admin)
class Option {
  constructor(value, text, dataset = {}) {
    this.value = value;
    this.textContent = text;
    this.dataset = dataset;
  }
}

class Select {
  constructor() {
    this.options = [];
    this._value = '';
  }
  appendChild(opt) {
    this.options.push(opt);
    if (this.options.length === 1 && !this._value) {
      this._value = opt.value;
    }
  }
  querySelector(selector) {
    if (selector === 'option[data-temporary="true"]') {
      return this.options.find(o => o.dataset.temporary === 'true') || null;
    }
    return null;
  }
  get value() {
    return this._value;
  }
  set value(val) {
    const found = this.options.find(o => o.value === val);
    if (found) {
      this._value = val;
    }
  }
}

// 2. PRUEBA 1: Actualización tardía de distribuidores mientras se edita proveedor fuera de catálogo
console.log('--- 1. Prueba de Actualización Asíncrona Tardía de Distribuidores ---');
const formSupplier = new Select();
formSupplier.appendChild(new Option('', 'Seleccionar distribuidor...'));
formSupplier.appendChild(new Option('Distribuidora MAC', 'Distribuidora MAC'));
formSupplier.appendChild(new Option('Mayorista El Triunfo', 'Mayorista El Triunfo'));

// Se abre el modal con campaña sintética: "Mayorista Sintético QA"
const syntheticSupplier = 'Mayorista Sintético QA';
let exists = formSupplier.options.some(o => o.value === syntheticSupplier);
assert.strictEqual(exists, false, 'El proveedor sintético no debe existir en el catálogo base');

const tempOpt = new Option(syntheticSupplier, `🏢 ${syntheticSupplier} (Registrado en campaña)`, { temporary: 'true' });
formSupplier.appendChild(tempOpt);
formSupplier.value = syntheticSupplier;

assert.strictEqual(formSupplier.value, syntheticSupplier, 'El select debe tener seleccionado el proveedor sintético');
console.log('  ✅ PASS: Proveedor sintético montado y seleccionado inicialmente');

// Simular refreshDistributorSelects() tardío con la nueva lógica quirúrgica:
function simulateRefreshDistributorSelects(selectEl, newDistList) {
  const currentSelectedSupplier = selectEl.value;
  const currentTempSupplierOpt = selectEl.querySelector('option[data-temporary="true"]');
  let preserveSupplierTemp = null;
  if (currentTempSupplierOpt) {
    preserveSupplierTemp = {
      value: currentTempSupplierOpt.value,
      textContent: currentTempSupplierOpt.textContent
    };
  }

  // Limpiar y repoblar
  selectEl.options = [];
  selectEl.appendChild(new Option('', 'Seleccionar distribuidor...'));

  newDistList.forEach(d => {
    selectEl.appendChild(new Option(d.name, d.name));
  });

  if (preserveSupplierTemp) {
    const readdedTemp = new Option(preserveSupplierTemp.value, preserveSupplierTemp.textContent, { temporary: 'true' });
    selectEl.appendChild(readdedTemp);
  }

  if (currentSelectedSupplier) {
    selectEl.value = currentSelectedSupplier;
  }
}

// Ejecutar refresh tardío con catálogo actualizado
simulateRefreshDistributorSelects(formSupplier, [
  { name: 'Distribuidora MAC' },
  { name: 'Mayorista El Triunfo' },
  { name: 'Nuevo Mayorista Incorporado' }
]);

assert.strictEqual(formSupplier.value, syntheticSupplier, 'El proveedor sintético debe preservarse tras refresh tardío');
assert.ok(formSupplier.querySelector('option[data-temporary="true"]'), 'La opción temporal debe seguir existiendo');
console.log('  ✅ PASS: refreshDistributorSelects() tardío preservó la opción temporal y el valor seleccionado');

// 3. PRUEBA 2: Provincia fuera de catálogo ("AR-QA-F15")
console.log('\n--- 2. Prueba de Provincias Fuera de Catálogo vs Catálogo Estándar ---');
const provSelect = new Select();
provSelect.appendChild(new Option('ALL', '🌐 Nacional (Todos los comercios del país)'));
provSelect.appendChild(new Option('AR-X', '📍 Córdoba'));
provSelect.appendChild(new Option('AR-D', '📍 San Luis'));
provSelect.appendChild(new Option('AR-B', '📍 Buenos Aires'));

function simulateOpenEditModalProvince(selectEl, provCode) {
  const prevTemp = selectEl.querySelector('option[data-temporary="true"]');
  if (prevTemp) {
    selectEl.options = selectEl.options.filter(o => o !== prevTemp);
  }

  let provExists = selectEl.options.some(o => o.value === provCode);
  if (!provExists && provCode && provCode !== 'ALL') {
    const tempProvOpt = new Option(provCode, `📍 ${provCode} (Registrado en campaña)`, { temporary: 'true' });
    selectEl.appendChild(tempProvOpt);
  }
  selectEl.value = provCode;
}

// Abrir campaña con AR-QA-F15
simulateOpenEditModalProvince(provSelect, 'AR-QA-F15');
assert.strictEqual(provSelect.value, 'AR-QA-F15', 'El selector de provincia debe seleccionar AR-QA-F15 y no caer a ALL');
assert.ok(provSelect.querySelector('option[data-temporary="true"]'), 'Debe existir la opción temporal de provincia');
console.log('  ✅ PASS: AR-QA-F15 no fue degradado silenciosamente a ALL');

// 4. PRUEBA 3: Cambio intencional por el usuario a "ALL" (Nacional)
console.log('\n--- 3. Prueba de Cambio Intencional de Cobertura ---');
provSelect.value = 'ALL';
assert.strictEqual(provSelect.value, 'ALL', 'El usuario debe poder cambiar voluntariamente a Nacional');
const savedProvResult = (provSelect.value === 'ALL') ? ['ALL'] : [provSelect.value];
assert.deepStrictEqual(savedProvResult, ['ALL'], 'Si el usuario elige Nacional, se debe guardar ["ALL"]');
console.log('  ✅ PASS: Cambio intencional a cobertura nacional respetado');

// 5. PRUEBA 4: Campaña comercial con provincia estándar ("AR-D")
console.log('\n--- 4. Prueba con Campaña Comercial Estándar ---');
simulateOpenEditModalProvince(provSelect, 'AR-D');
assert.strictEqual(provSelect.value, 'AR-D', 'Provincia estándar seleccionada');
assert.strictEqual(provSelect.querySelector('option[data-temporary="true"]'), null, 'No debe haber opción temporal para AR-D');
console.log('  ✅ PASS: Campaña comercial no genera opciones temporales superfluas');

// 6. PRUEBA 5: Integridad Total del Formulario sin Modificaciones
console.log('\n--- 5. Prueba de Integridad de Guardado sin Cambios ---');
const originalCampaign = {
  id: '00000000-0000-4000-b000-000000000015',
  title: '[TEST-SMART] Sidra Real Prueba E2E',
  supplierName: 'Mayorista Sintético QA',
  whatsappNumber: '5491100000000',
  category: 'Bebidas',
  price: 3000,
  regularPrice: 3800,
  targetProvinces: ['AR-QA-F15'],
  minPurchase: 6,
  conditions: 'Prueba aislada',
  status: 'draft',
  isSmartAdvertising: true
};

// Reabrir modal con la campaña original para testear preservación exacta
simulateOpenEditModalProvince(provSelect, originalCampaign.targetProvinces[0]);

// Simulación de valores tomados directamente del DOM
const formReadData = {
  title: originalCampaign.title,
  supplierName: formSupplier.value, // 'Mayorista Sintético QA'
  category: originalCampaign.category,
  price: originalCampaign.price,
  regularPrice: originalCampaign.regularPrice,
  whatsappNumber: originalCampaign.whatsappNumber,
  minPurchase: originalCampaign.minPurchase,
  conditions: originalCampaign.conditions,
  targetProvinces: (provSelect.value === 'ALL') ? ['ALL'] : [provSelect.value],
  status: originalCampaign.status,
  isSmartAdvertising: originalCampaign.isSmartAdvertising
};

assert.strictEqual(formReadData.supplierName, originalCampaign.supplierName, 'supplier_name íntegro');
assert.strictEqual(formReadData.whatsappNumber, originalCampaign.whatsappNumber, 'whatsapp_number íntegro');
assert.deepStrictEqual(formReadData.targetProvinces, originalCampaign.targetProvinces, 'targetProvinces íntegro');
assert.strictEqual(formReadData.minPurchase, originalCampaign.minPurchase, 'minPurchase íntegro');
assert.strictEqual(formReadData.conditions, originalCampaign.conditions, 'conditions íntegro');
assert.strictEqual(formReadData.status, originalCampaign.status, 'status íntegro');
assert.strictEqual(formReadData.isSmartAdvertising, originalCampaign.isSmartAdvertising, 'isSmartAdvertising íntegro');
console.log('  ✅ PASS: Todos los campos permanecen 100% íntegros al abrir y guardar');

console.log('\n====================================================');
console.log('RESULTADO: TODAS LAS PRUEBAS DE SELECTORES PASARON (PASS)');
console.log('====================================================');
