import { extractB2BMetadata } from '../src/utils/b2bUtils.js';

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
console.log('SUITE DE PRUEBAS AISLADAS: METADATOS PUBLICIDAD PREMIUM');
console.log('====================================================\n');

// Función idéntica a embedB2BMetadata del Panel Administrador
function embedB2BMetadata(rawDescription, meta = {}) {
  const cleanDesc = (rawDescription || '').replace(/\n?<!--B2B_META:[\s\S]*?-->/g, '').trim();
  const validMeta = {};
  if (meta.minPurchase !== undefined) validMeta.minPurchase = meta.minPurchase ? Number(meta.minPurchase) : null;
  if (meta.minPurchaseType !== undefined) validMeta.minPurchaseType = meta.minPurchaseType ? String(meta.minPurchaseType) : null;
  if (meta.conditions !== undefined) validMeta.conditions = meta.conditions ? String(meta.conditions).trim() : null;
  if (meta.startDate !== undefined) validMeta.startDate = meta.startDate ? String(meta.startDate).trim() : null;
  if (meta.endDate !== undefined) validMeta.endDate = meta.endDate ? String(meta.endDate).trim() : null;
  if (meta.targetProvinces !== undefined) validMeta.targetProvinces = Array.isArray(meta.targetProvinces) ? meta.targetProvinces : (meta.targetProvinces ? [meta.targetProvinces] : null);
  if (meta.targetCities !== undefined) validMeta.targetCities = Array.isArray(meta.targetCities) ? meta.targetCities : (meta.targetCities ? [meta.targetCities] : null);
  if (meta.isSmartAdvertising !== undefined) validMeta.isSmartAdvertising = Boolean(meta.isSmartAdvertising);

  if (Object.keys(validMeta).length === 0) return cleanDesc;
  const metaStr = JSON.stringify(validMeta);
  return cleanDesc ? `${cleanDesc}\n<!--B2B_META:${metaStr}-->` : `<!--B2B_META:${metaStr}-->`;
}

// 1. CAMPAÑA NUEVA SIN PREMIUM (DESACTIVADO POR DEFECTO)
console.log('--- 1. Campaña nueva sin premium (default false) ---');
{
  const rawDesc = 'Pack de galletitas surtidas x 12 unidades';
  const embedded = embedB2BMetadata(rawDesc, { isSmartAdvertising: false });
  const { cleanDescription, meta } = extractB2BMetadata(embedded);
  const isSmart = Boolean(meta.isSmartAdvertising);

  assert(isSmart === false, 'Campaña nueva sin premium evalúa a false');
  assert(cleanDescription === rawDesc, 'Descripción visible permanece limpia sin metadatos técnicos');
}

// 2. CAMPAÑA CON PREMIUM ACTIVADO
console.log('\n--- 2. Campaña con premium activado ---');
{
  const rawDesc = 'Sidra artesanal del valle 750ml';
  const embedded = embedB2BMetadata(rawDesc, { 
    isSmartAdvertising: true,
    minPurchase: 10,
    minPurchaseType: 'u'
  });
  const { cleanDescription, meta } = extractB2BMetadata(embedded);
  const isSmart = Boolean(meta.isSmartAdvertising);

  assert(isSmart === true, 'Campaña con premium activado evalúa a true');
  assert(meta.minPurchase === 10, 'Otros metadatos (minPurchase) se preservan');
  assert(!cleanDescription.includes('<!--B2B_META:'), 'La etiqueta B2B_META no contamina la descripción visible');
}

// 3. EDICIÓN DE CAMPAÑA: CONSERVA ESTADO PREMIUM
console.log('\n--- 3. Edición de campaña premium existente ---');
{
  const originalDesc = 'Sidra artesanal del valle\n<!--B2B_META:{"minPurchase":10,"isSmartAdvertising":true}-->';
  const { meta: currentMeta, cleanDescription } = extractB2BMetadata(originalDesc);

  // Simular edición: cambia precio/texto pero conserva premium
  const newText = cleanDescription + ' - Nueva presentación';
  const updatedDesc = embedB2BMetadata(newText, {
    ...currentMeta,
    isSmartAdvertising: currentMeta.isSmartAdvertising
  });

  const reExtracted = extractB2BMetadata(updatedDesc);
  assert(reExtracted.meta.isSmartAdvertising === true, 'Edición conserva isSmartAdvertising === true');
  assert(reExtracted.meta.minPurchase === 10, 'Edición conserva los demás metadatos');
}

// 4. DESACTIVACIÓN DE SERVICIO PREMIUM
console.log('\n--- 4. Desactivación de servicio premium ---');
{
  const originalDesc = 'Sidra artesanal del valle\n<!--B2B_META:{"isSmartAdvertising":true}-->';
  const { meta: currentMeta, cleanDescription } = extractB2BMetadata(originalDesc);

  // Administrador desmarca el checkbox: pasa a false
  const updatedDesc = embedB2BMetadata(cleanDescription, {
    ...currentMeta,
    isSmartAdvertising: false
  });

  const reExtracted = extractB2BMetadata(updatedDesc);
  assert(Boolean(reExtracted.meta.isSmartAdvertising) === false, 'Desactivación almacena y evalúa a false');
}

// 5. CAMPAÑAS HISTÓRICAS / COMERCIALES EXISTENTES (SIN METADATO)
console.log('\n--- 5. Compatibilidad retroactiva con 21 campañas existentes ---');
const legacyCampaigns = [
  { id: 'c1', title: 'Coca Cola 2.25L', description: 'Pack x 6 botellas retornables' },
  { id: 'c2', title: 'Galletitas Oreo', description: 'Caja x 24 unidades\n<!--B2B_META:{"minPurchase":2}-->' },
  { id: 'c3', title: 'Yerba Playadito', description: null },
  { id: 'c4', title: 'Alfajor Jorgito', description: '' }
];

for (const camp of legacyCampaigns) {
  const { meta } = extractB2BMetadata(camp.description);
  const isSmart = Boolean(camp.is_smart_advertising_enabled || camp.isSmartAdvertising || meta.isSmartAdvertising);
  assert(isSmart === false, `Campaña existente "${camp.title}" evalúa estrictamente a false (modalidad normal)`);
}

// 6. PRESERVACIÓN INTEGRAL DE TODOS LOS METADATOS B2B
console.log('\n--- 6. Preservación integral de metadatos B2B extendidos ---');
{
  const fullMetaInput = {
    minPurchase: 50000,
    minPurchaseType: '$',
    conditions: 'Entrega en 24hs pago contra entrega',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    targetProvinces: ['AR-X', 'AR-D'],
    targetCities: ['X-CBA'],
    isSmartAdvertising: true
  };

  const embedded = embedB2BMetadata('Oferta Mayorista Completa', fullMetaInput);
  const { cleanDescription, meta: outputMeta } = extractB2BMetadata(embedded);

  assert(outputMeta.minPurchase === 50000, 'minPurchase preservado');
  assert(outputMeta.minPurchaseType === '$', 'minPurchaseType preservado');
  assert(outputMeta.conditions === 'Entrega en 24hs pago contra entrega', 'conditions preservadas');
  assert(outputMeta.startDate === '2026-11-01', 'startDate preservada');
  assert(outputMeta.endDate === '2026-11-30', 'endDate preservada');
  assert(Array.isArray(outputMeta.targetProvinces) && outputMeta.targetProvinces.length === 2, 'targetProvinces preservadas');
  assert(outputMeta.isSmartAdvertising === true, 'isSmartAdvertising preservado');
  assert(cleanDescription === 'Oferta Mayorista Completa', 'cleanDescription libre de tags');
}

// 7. SIMULACIÓN DE SINCRONIZACIÓN Y CACHÉ OFFLINE (adSyncEngine)
console.log('\n--- 7. Simulación de sincronización y persistencia en caché offline ---');
{
  const mockApiRawCampaign = {
    id: 'camp-test-01',
    title: 'Sidra Especial Fiestas',
    description: 'Bulto x 12 botellas\n<!--B2B_META:{"isSmartAdvertising":true}-->',
    price: 3500,
    status: 'active'
  };

  const { cleanDescription, meta } = extractB2BMetadata(mockApiRawCampaign.description);
  const mapped = {
    id: mockApiRawCampaign.id,
    title: mockApiRawCampaign.title,
    description: cleanDescription,
    isSmartAdvertising: Boolean(mockApiRawCampaign.is_smart_advertising_enabled || mockApiRawCampaign.isSmartAdvertising || meta.isSmartAdvertising)
  };

  // Simular serialización a localStorage
  const serializedCache = JSON.stringify([mapped]);
  const restoredFromOfflineCache = JSON.parse(serializedCache);

  assert(restoredFromOfflineCache[0].isSmartAdvertising === true, 'El indicador se recupera íntegro desde el caché offline');
  assert(restoredFromOfflineCache[0].description === 'Bulto x 12 botellas', 'El caché offline conserva la descripción limpia');
}

console.log('\n====================================================');
console.log(`RESUMEN: Total: ${totalTests} | Aprobadas: ${passedTests} | Fallidas: ${failedTests}`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎯 TODAS LAS PRUEBAS DE METADATOS PASARON CON ÉXITO.\n');
}

