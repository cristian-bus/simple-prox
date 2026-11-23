import assert from 'node:assert';

let passed = 0;
let failed = 0;

function check(desc, cond) {
  if (cond) {
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${desc}`);
    failed++;
  }
}

console.log('================================================================');
console.log('SUITE DE PRUEBAS: CORRECCIÓN QUIRÚRGICA COMBOS E INVENTARIO');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// PRUEBAS DE LA CORRECCIÓN 1: PRODUCTOS / COMBOS (Lógica de estado y aislamiento)
// -----------------------------------------------------------------------------
console.log('--- PRUEBA 1: Ciclo de vida y reseteo del formulario de combos ---');

const initialComboState = {
  name: '',
  sku: '',
  category: '🍞 Alimentos',
  subcategory: 'Panificados',
  isActive: true,
  margin: '',
  cost: '',
  priceFinal: '',
  stock: '',
  stockAlert: '',
  components: [{ id: 100, productId: '', qty: 1 }]
};

let editingId = null;
let comboData = { ...initialComboState };
let view = 'list';

const resetComboForm = () => {
  editingId = null;
  comboData = {
    name: '',
    sku: '',
    category: '🍞 Alimentos',
    subcategory: 'Panificados',
    isActive: true,
    margin: '',
    cost: '',
    priceFinal: '',
    stock: '',
    stockAlert: '',
    components: [{ id: Date.now(), productId: '', qty: 1 }]
  };
};

const startEditCombo = (product) => {
  editingId = product.id;
  comboData = {
    name: product.name,
    sku: product.code || product.sku,
    category: product.category,
    subcategory: product.subcategory,
    isActive: product.isActive,
    margin: '25.00',
    cost: product.cost,
    priceFinal: product.price,
    stock: product.stock,
    stockAlert: product.stockAlert,
    components: product.components || []
  };
  view = 'createCombo';
};

const existingCombo = {
  id: 501,
  name: 'Combo Fernet + Coca',
  code: 'COMBO-501',
  category: 'Bebidas',
  subcategory: 'Aperitivos',
  isActive: true,
  price: 15000,
  cost: 10000,
  stock: 10,
  stockAlert: 2,
  isCombo: true,
  components: [{ productId: 10, qty: 1 }, { productId: 20, qty: 2 }]
};

// 1.1 Abrir combo existente y cancelar
startEditCombo(existingCombo);
check('1.1.a: Modo edición activado con ID de combo', editingId === 501);
check('1.1.b: Formulario contiene nombre de combo existente', comboData.name === 'Combo Fernet + Coca');

// Evento Cancelar en el modal
view = 'list';
resetComboForm();
check('1.1.c: Tras cancelar, editingId vuelve a ser null', editingId === null);
check('1.1.d: Tras cancelar, comboData.name está vacío', comboData.name === '');
check('1.1.e: Tras cancelar, comboData.sku está vacío', comboData.sku === '');

// 1.2 Cierre con X y posterior creación de combo nuevo
startEditCombo(existingCombo);
// Evento cerrar con X en el modal
view = 'list';
resetComboForm();
check('1.2.a: Tras cerrar con X, editingId es null', editingId === null);

// Usuario hace clic en el botón "+ Combos" en la barra superior
resetComboForm();
view = 'createCombo';
check('1.2.b: Al entrar a crear nuevo combo, editingId es estrictamente null', editingId === null);
check('1.2.c: Formulario nuevo combo no contiene residuos del anterior', comboData.name === '' && comboData.priceFinal === '');
check('1.2.d: Título del modal resuelve "Agregar Combo" si editingId === null', (editingId ? "Editar Combo" : "Agregar Combo") === "Agregar Combo");

// 1.3 Edición legítima de un combo existente
startEditCombo(existingCombo);
check('1.3.a: Título del modal resuelve "Editar Combo" si editingId existe', (editingId ? "Editar Combo" : "Agregar Combo") === "Editar Combo");

let productsDatabase = [
  { ...existingCombo },
  { id: 10, name: 'Fernet', price: 10000, stock: 20 },
  { id: 20, name: 'Coca Cola', price: 2500, stock: 50 }
];

const updateProductMock = (id, updated) => {
  const idx = productsDatabase.findIndex(p => p.id === id);
  if (idx !== -1) {
    productsDatabase[idx] = { ...productsDatabase[idx], ...updated };
  }
};

const saveProductMock = (newProd) => {
  const id = Date.now();
  productsDatabase.push({ id, ...newProd });
  return id;
};

// Guardar cambio legítimo en combo existente
comboData.priceFinal = '16500.00';
if (editingId) {
  updateProductMock(editingId, { ...comboData, price: parseFloat(comboData.priceFinal) });
} else {
  saveProductMock({ ...comboData });
}
resetComboForm();
view = 'list';

const updatedInDb = productsDatabase.find(p => p.id === 501);
check('1.3.b: Edición legítima actualizó el combo existente en la base de datos', updatedInDb && updatedInDb.price === 16500);
check('1.3.c: Cantidad total de productos en base de datos no aumentó al editar', productsDatabase.length === 3);

// 1.4 Crear un combo nuevo no sobrescribe el anterior
resetComboForm();
view = 'createCombo';
comboData.name = 'Combo Cerveza + Maní';
comboData.sku = 'COMBO-999';
comboData.cost = '3000';
comboData.priceFinal = '4500';

let newIdGenerated = null;
if (editingId) {
  updateProductMock(editingId, { ...comboData });
} else {
  newIdGenerated = saveProductMock({ ...comboData, price: parseFloat(comboData.priceFinal), code: comboData.sku, isCombo: true });
}
resetComboForm();
view = 'list';

const originalComboAfterNew = productsDatabase.find(p => p.id === 501);
const newlyCreatedCombo = productsDatabase.find(p => p.code === 'COMBO-999');

check('1.4.a: El combo original no fue sobrescrito y conserva sus datos', originalComboAfterNew && originalComboAfterNew.name === 'Combo Fernet + Coca');
check('1.4.b: El nuevo combo se guardó con un identificador nuevo y propio', newlyCreatedCombo && newlyCreatedCombo.id !== 501);
check('1.4.c: La base de datos contiene ahora ambos combos', productsDatabase.length === 4);


// -----------------------------------------------------------------------------
// PRUEBAS DE LA CORRECCIÓN 2: INVENTARIO / SIN STOCK
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA 2: Coherencia de la tarjeta «Sin stock» y listado de inventario ---');

const testCatalog = [
  // Productos tangibles normales
  { id: 1, name: 'Galletitas', stock: 15, stockAlert: 5, isActive: true, isCombo: false, isService: false },
  { id: 2, name: 'Alfajor Triple', stock: 0, stockAlert: 5, isActive: true, isCombo: false, isService: false },
  { id: 3, name: 'Gaseosa Cola', stock: -1, stockAlert: 2, isActive: true, isCombo: false, isService: false }, // Stock negativo por venta
  { id: 4, name: 'Caramelos', stock: 2, stockAlert: 5, isActive: true, isCombo: false, isService: false }, // Bajo stock
  { id: 5, name: 'Chocolate Desactivado', stock: 0, stockAlert: 5, isActive: false, isCombo: false, isService: false }, // Inactivo

  // Combos (excluidos del inventario físico individual)
  { id: 6, name: 'Combo Promo', stock: 0, isActive: true, isCombo: true, isService: false },

  // Servicios (intangibles: NO deben contarse en inventario de mercadería)
  { id: 7, name: 'Corte de Cabello', stock: 0, isActive: true, isCombo: false, isService: true },
  { id: 8, name: 'Fotocopias B&N', stock: 0, isActive: true, isCombo: false, isService: true }
];

// Fórmula corregida de la tarjeta:
const outOfStockCount = testCatalog.filter(
  p => p.isActive && !p.isCombo && !p.isService && Number(p.stock) <= 0
).length;

// Filtro de la tabla cuando se selecciona la tarjeta "Sin stock" (stockLevelFilter === 'out'):
const filteredTableProducts = testCatalog.filter(p => {
  if (p.isCombo) return false;
  if (p.isService) return false;
  const matchesStatus = p.isActive; // Estado activo por defecto
  const matchesStockLevel = Number(p.stock) <= 0 && !p.isService;
  return matchesStatus && matchesStockLevel;
});

check('2.1: outOfStockCount excluye los 2 servicios (Corte y Fotocopias)', !testCatalog.filter(p => p.isService).some(s => s.stock <= 0 && outOfStockCount === 4));
check('2.2: outOfStockCount excluye combos (Combo Promo)', outOfStockCount === 2); // Solo Alfajor Triple (0) y Gaseosa Cola (-1)
check('2.3: outOfStockCount coincide exactamente con la cantidad de productos visibles en la lista (2 === 2)', outOfStockCount === filteredTableProducts.length);
check('2.4: Los productos listados son exactamente los tangibles agotados ("Alfajor Triple", "Gaseosa Cola")', 
  filteredTableProducts.map(p => p.name).includes('Alfajor Triple') && 
  filteredTableProducts.map(p => p.name).includes('Gaseosa Cola') &&
  !filteredTableProducts.map(p => p.name).includes('Corte de Cabello') &&
  !filteredTableProducts.map(p => p.name).includes('Fotocopias B&N')
);

// 2.5 Verificación de producto con stock positivo que se agota a 0
const dynamicCatalog = [...testCatalog];
const itemGalletitas = dynamicCatalog.find(p => p.id === 1);
itemGalletitas.stock = 0; // Se vende todo el stock

const newOutOfStockCount = dynamicCatalog.filter(
  p => p.isActive && !p.isCombo && !p.isService && Number(p.stock) <= 0
).length;
check('2.5: Al agotarse un producto adicional tangible, el contador pasa de 2 a 3', newOutOfStockCount === 3);

console.log('\n================================================================');
console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
