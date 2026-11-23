import { findMatchingOfferForProduct, getLowStockReplenishmentOpportunities } from '../src/utils/stockOfferMatcher.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

console.log('====================================================');
console.log('SUITE DE PRUEBAS AISLADAS: STOCK OFFER MATCHER');
console.log('====================================================\n');

// 1. CASOS OBLIGATORIOS DE SINGULAR / PLURAL (INCLUSO CON CATEGORÍAS DIFERENTES)
console.log('--- 1. Casos obligatorios de reconocimiento singular/plural ---');
const singularPluralPairs = [
  { p: 'Sidras', c: 'Sidra' },
  { p: 'Sidra', c: 'Sidras' },
  { p: 'Sidra Real', c: 'Sidra Real' },
  { p: 'Sidra Real 750 ml', c: 'Sidra Real 750 ml' },
  { p: 'Gaseosas', c: 'Gaseosa' },
  { p: 'Alfajores', c: 'Alfajor' },
  { p: 'Chocolates', c: 'Chocolate' },
  { p: 'Yerbas', c: 'Yerba' }
];

for (const pair of singularPluralPairs) {
  const prod = { id: 1, name: pair.p, stock: 2, stockAlert: 5, category: 'Kiosco', isActive: true };
  const camp = { id: 'c1', title: pair.c, price: 3000, category: 'General', status: 'active' };
  const match = findMatchingOfferForProduct(prod, [camp]);
  assert(match !== null && match.score >= 2, `Producto "${pair.p}" ↔ Campaña "${pair.c}" (cat distintas): Match obtenido con Score ${match?.score}`);
}

// 2. OFERTAS GENÉRICAS VS ESPECÍFICAS (FAMILIA DE PRODUCTOS)
console.log('\n--- 2. Ofertas genéricas como familia válida de reposición ---');
{
  const prodSpecific = { id: 2, name: 'Sidra Real 750 ml', stock: 1, stockAlert: 5, category: 'Bebidas', isActive: true };
  const campGeneric = { id: 'c2', title: 'Sidra', price: 2500, category: 'Bebidas', status: 'active' };
  const match = findMatchingOfferForProduct(prodSpecific, [campGeneric]);
  assert(match !== null, 'Producto específico "Sidra Real 750 ml" ↔ Oferta genérica "Sidra": Reconocido como familia');
}
{
  const prodGeneric = { id: 3, name: 'Sidra', stock: 1, stockAlert: 5, category: 'Bebidas', isActive: true };
  const campSpecific = { id: 'c3', title: 'Sidra Real 750 ml', price: 3200, category: 'Bebidas', status: 'active' };
  const match = findMatchingOfferForProduct(prodGeneric, [campSpecific]);
  assert(match !== null, 'Producto genérico "Sidra" ↔ Oferta específica "Sidra Real 750 ml": Reconocido como familia');
}

// 3. PREVENCIÓN DE FALSOS POSITIVOS Y MARCAS EXCLUYENTES
console.log('\n--- 3. Prevención de falsos positivos y modificadores opuestos ---');
const falsePositiveCases = [
  { p: 'Sidra', c: 'Cerveza Quilmes', reason: 'Distintos productos (sidra vs cerveza)' },
  { p: 'Coca-Cola', c: 'Pepsi 1.5L', reason: 'Marcas competidoras distintas (coca-cola vs pepsi)' },
  { p: 'Sidra Real', c: 'Sidra 1888', reason: 'Marcas específicas excluyentes (Real vs 1888)' },
  { p: 'Aceite de girasol', c: 'Aceite de oliva', reason: 'Variedades de aceite excluyentes (girasol vs oliva)' },
  { p: 'Leche entera', c: 'Leche descremada', reason: 'Tipos de leche excluyentes (entera vs descremada)' }
];

for (const fp of falsePositiveCases) {
  const prod = { id: 4, name: fp.p, stock: 2, stockAlert: 5, category: 'Almacén', isActive: true };
  const camp = { id: 'c4', title: fp.c, price: 4000, category: 'Almacén', status: 'active' };
  const match = findMatchingOfferForProduct(prod, [camp]);
  assert(match === null, `Descarte correcto: "${fp.p}" vs "${fp.c}" (${fp.reason})`);
}

// 4. NORMALIZACIÓN DE TILDES, MAYÚSCULAS Y PUNTUACIÓN
console.log('\n--- 4. Normalización de tildes y formato ---');
{
  const prod = { id: 5, name: 'BOMBONES SUIZOS', stock: 1, stockAlert: 5, category: 'Golosinas', isActive: true };
  const camp = { id: 'c5', title: 'Bombón Suizo x 12 u.', price: 1500, category: 'Golosinas', status: 'active' };
  const match = findMatchingOfferForProduct(prod, [camp]);
  assert(match !== null && match.score >= 2, 'Mayúsculas y plural con tilde: "BOMBONES SUIZOS" ↔ "Bombón Suizo x 12 u."');
}

// 5. SEMÁNTICA DE STOCK Y REPOSICIÓN (getLowStockReplenishmentOpportunities)
console.log('\n--- 5. Semántica de stockAlert y priorización por quiebre ---');
const mockProducts = [
  { id: 101, name: 'Sidras', stock: 2, stockAlert: 5, isActive: true }, // Stock bajo (2 <= 5)
  { id: 102, name: 'Gaseosas', stock: 0, stockAlert: 10, isActive: true }, // Quiebre total (0 <= 10)
  { id: 103, name: 'Alfajores', stock: 20, stockAlert: 5, isActive: true }, // Stock normal (20 > 5) -> No debe entrar
  { id: 104, name: 'Chocolates', stock: 3, stockAlert: undefined, isActive: true }, // Default alert 5 (3 <= 5)
  { id: 105, name: 'Servicio Recarga', stock: 0, isService: true, isActive: true } // Servicio -> Excluido
];

const mockCampaigns = [
  { id: 'c-sidra', title: 'Sidra 750ml', price: 2000, status: 'active' },
  { id: 'c-gaseosa', title: 'Gaseosa Cola', price: 1800, status: 'active' },
  { id: 'c-alfajor', title: 'Alfajor Triple', price: 800, status: 'active' },
  { id: 'c-choc', title: 'Chocolate con leche', price: 1200, status: 'active' }
];

const opportunities = getLowStockReplenishmentOpportunities(mockProducts, mockCampaigns);

assert(opportunities.length === 3, `Se detectaron exactamente 3 oportunidades (encontradas: ${opportunities.length})`);
assert(opportunities[0].product.id === 102, 'El primer elemento es el quiebre de stock (stock = 0: Gaseosas)');
assert(!opportunities.some(o => o.product.id === 103), 'Alfajores (stock 20 > 5) NO fue incluido');
assert(!opportunities.some(o => o.product.id === 105), 'Servicio no inventariable NO fue incluido');

console.log('\n====================================================');
console.log(`RESUMEN: Total: ${totalTests} | Aprobadas: ${passedTests} | Fallidas: ${failedTests}`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎯 TODAS LAS PRUEBAS PASARON SATISFACTORIAMENTE.\n');
}

