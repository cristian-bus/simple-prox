import assert from 'assert';

console.log('====================================================');
console.log('TEST SUITE: INTEGRIDAD DE DATOS EN INSTALACIONES');
console.log('====================================================\n');

// Mock localStorage
const storage = new Map();
const localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};

const KEYS = {
  PRODUCTS: 'kioscoprox_products',
  SALES: 'kioscoprox_sales',
  PURCHASES: 'kioscoprox_purchases',
  CLIENTS: 'kioscoprox_clients',
  CAJA: 'kioscoprox_caja',
  SHIFTS: 'kioscoprox_shifts',
  USERS: 'kioscoprox_users',
  CATEGORIES: 'kioscoprox_categories',
  SUPPLIERS: 'kioscoprox_suppliers',
  BUSINESS_CONFIG: 'kioscoprox_business_config',
  RESERVATIONS: 'kioscoprox_reservations'
};

// Generador de fallback demo (5 meses)
function generate5MonthsDemoData() {
  return {
    products: [{ id: 1, name: 'Prod Demo' }],
    sales: [{ id: 101, total: 5000, date: '2026-05-01' }],
    purchases: [{ id: 201, total: 3000 }],
    clients: [{ id: 1, name: 'Cliente Demo' }],
    shifts: [{ id: 301, totalVentas: 5000 }],
    categoryTree: { 'Bebidas': ['Gaseosas'] },
    suppliers: [{ id: 1, name: 'Proveedor Demo' }]
  };
}

const NICHES = {
  kiosco: {
    id: 'kiosco',
    categories: { 'Golosinas': ['Alfajores'] },
    mockProducts: [{ id: 101, name: 'Alfajor', price: 500, stock: 20 }],
    mockSuppliers: [{ id: 1, name: 'Arcor' }],
    mockClients: [{ id: 1, name: 'Consumidor Final', deuda: 0 }]
  }
};

// Simulación del Hook / Estado
function simulateKioscoLifecycle() {
  let state = {};

  function init() {
    const demoFallback = generate5MonthsDemoData();
    state.products = localStorage.getItem(KEYS.PRODUCTS) ? JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) : demoFallback.products;
    state.sales = localStorage.getItem(KEYS.SALES) ? JSON.parse(localStorage.getItem(KEYS.SALES)) : demoFallback.sales;
    state.purchases = localStorage.getItem(KEYS.PURCHASES) ? JSON.parse(localStorage.getItem(KEYS.PURCHASES)) : demoFallback.purchases;
    state.clients = localStorage.getItem(KEYS.CLIENTS) ? JSON.parse(localStorage.getItem(KEYS.CLIENTS)) : demoFallback.clients;
    state.caja = localStorage.getItem(KEYS.CAJA) ? JSON.parse(localStorage.getItem(KEYS.CAJA)) : { isOpen: false, efectivo: 0, openedAt: null };
    state.shifts = localStorage.getItem(KEYS.SHIFTS) ? JSON.parse(localStorage.getItem(KEYS.SHIFTS)) : demoFallback.shifts;
    state.categoryTree = localStorage.getItem(KEYS.CATEGORIES) ? JSON.parse(localStorage.getItem(KEYS.CATEGORIES)) : demoFallback.categoryTree;
    state.suppliers = localStorage.getItem(KEYS.SUPPLIERS) ? JSON.parse(localStorage.getItem(KEYS.SUPPLIERS)) : demoFallback.suppliers;
    state.reservations = localStorage.getItem(KEYS.RESERVATIONS) ? JSON.parse(localStorage.getItem(KEYS.RESERVATIONS)) : [];
    
    const defaults = { isOnboarded: false, storeName: '', plan: 'Básico' };
    state.businessConfig = localStorage.getItem(KEYS.BUSINESS_CONFIG) ? JSON.parse(localStorage.getItem(KEYS.BUSINESS_CONFIG)) : defaults;
  }

  function persist() {
    localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(state.products));
    localStorage.setItem(KEYS.SALES, JSON.stringify(state.sales));
    localStorage.setItem(KEYS.PURCHASES, JSON.stringify(state.purchases));
    localStorage.setItem(KEYS.CLIENTS, JSON.stringify(state.clients));
    localStorage.setItem(KEYS.CAJA, JSON.stringify(state.caja));
    localStorage.setItem(KEYS.SHIFTS, JSON.stringify(state.shifts));
    localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(state.categoryTree));
    localStorage.setItem(KEYS.SUPPLIERS, JSON.stringify(state.suppliers));
    localStorage.setItem(KEYS.RESERVATIONS, JSON.stringify(state.reservations));
    localStorage.setItem(KEYS.BUSINESS_CONFIG, JSON.stringify(state.businessConfig));
  }

  function completeOnboarding(storeName, nicheId) {
    const nicheData = NICHES[nicheId] || NICHES['kiosco'];
    state.businessConfig.isOnboarded = true;
    state.businessConfig.storeName = storeName;
    state.categoryTree = nicheData.categories;
    state.products = nicheData.mockProducts;
    state.suppliers = nicheData.mockSuppliers || [];
    state.clients = nicheData.mockClients || [{ id: 1, name: 'Consumidor Final', deuda: 0 }];

    // Lógica quirúrgica agregada:
    state.sales = [];
    state.purchases = [];
    state.shifts = [];
    state.reservations = [];
    state.caja = { isOpen: false, efectivo: 0, openedAt: null, movimientos: [] };

    persist();
  }

  function loadDemoData(demoData) {
    if (demoData.categoryTree) state.categoryTree = demoData.categoryTree;
    if (demoData.suppliers) state.suppliers = demoData.suppliers;
    if (demoData.products) state.products = demoData.products;
    if (demoData.clients) state.clients = demoData.clients;
    if (demoData.purchases) state.purchases = demoData.purchases;
    if (demoData.sales) state.sales = demoData.sales;
    if (demoData.shifts) state.shifts = demoData.shifts;
    persist();
  }

  init();

  return { state, init, persist, completeOnboarding, loadDemoData };
}

// --- TEST 1: Instalación Nueva completa Onboarding ---
console.log('--- 1. Prueba: Instalación Nueva completando Onboarding ---');
localStorage.clear();
const app1 = simulateKioscoLifecycle();
assert.strictEqual(app1.state.businessConfig.isOnboarded, false, 'Inicialmente no está onboarded');

// Usuario completa onboarding
app1.completeOnboarding('Kiosco Central San Luis', 'kiosco');

// Verificaciones estrictas
assert.strictEqual(app1.state.sales.length, 0, 'Ventas deben ser 0 en instalación nueva');
assert.strictEqual(app1.state.purchases.length, 0, 'Compras deben ser 0 en instalación nueva');
assert.strictEqual(app1.state.shifts.length, 0, 'Turnos deben ser 0 en instalación nueva');
assert.strictEqual(app1.state.reservations.length, 0, 'Reservas deben ser 0 en instalación nueva');
assert.strictEqual(app1.state.caja.isOpen, false, 'Caja debe estar cerrada');
assert.strictEqual(app1.state.caja.efectivo, 0, 'Efectivo en caja debe ser 0');
assert.ok(app1.state.products.length > 0, 'Productos de catálogo de rubro deben existir');
assert.ok(app1.state.clients.length > 0, 'Cliente Consumidor Final debe existir');
console.log('  ✅ PASS: Instalación nueva inicia estrictamente con 0 ventas, 0 compras y 0 turnos ficticios');

// --- TEST 2: Reinicio de Aplicación en Instalación Nueva ---
console.log('\n--- 2. Prueba: Reinicio de Aplicación tras Onboarding ---');
const appReboot = simulateKioscoLifecycle();
assert.strictEqual(appReboot.state.sales.length, 0, 'Ventas persisten en 0 tras reiniciar');
assert.strictEqual(appReboot.state.purchases.length, 0, 'Compras persisten en 0 tras reiniciar');
assert.strictEqual(appReboot.state.shifts.length, 0, 'Turnos persisten en 0 tras reiniciar');
assert.strictEqual(appReboot.state.businessConfig.storeName, 'Kiosco Central San Luis', 'Nombre de comercio persiste');
console.log('  ✅ PASS: Cero ventas y compras persisten tras reiniciar la app');

// --- TEST 3: Comercio Existente con Ventas Reales ---
console.log('\n--- 3. Prueba: Comercio Existente con Ventas Reales ---');
// Simular que el comercio hace 3 ventas reales y guarda arqueos
appReboot.state.sales.push({ id: 1001, total: 2500 });
appReboot.state.sales.push({ id: 1002, total: 1800 });
appReboot.state.purchases.push({ id: 2001, total: 5000 });
appReboot.state.shifts.push({ id: 3001, totalVentas: 4300 });
appReboot.persist();

// Simular reinicio del comercio existente
const appExisting = simulateKioscoLifecycle();
assert.strictEqual(appExisting.state.sales.length, 2, 'Ventas reales no deben ser tocadas');
assert.strictEqual(appExisting.state.purchases.length, 1, 'Compras reales no deben ser tocadas');
assert.strictEqual(appExisting.state.shifts.length, 1, 'Turnos reales no deben ser tocados');
console.log('  ✅ PASS: Comercio existente mantiene sus ventas y compras reales intactas');

// --- TEST 4: Botón "Cargar Datos Demo (5 Meses)" en Configuración ---
console.log('\n--- 4. Prueba: Funcionalidad Explícita de Carga de Demo ---');
const demoData = generate5MonthsDemoData();
appExisting.loadDemoData(demoData);
assert.strictEqual(appExisting.state.sales.length, 1, 'Modo demo carga sus ventas simuladas');
assert.strictEqual(appExisting.state.purchases.length, 1, 'Modo demo carga sus compras simuladas');
assert.strictEqual(appExisting.state.shifts.length, 1, 'Modo demo carga sus turnos');
console.log('  ✅ PASS: La carga voluntaria de datos demo en Configuración continúa funcionando');

console.log('\n====================================================');
console.log('RESULTADO: TODAS LAS PRUEBAS DE INTEGRIDAD PASARON (PASS)');
console.log('====================================================');

