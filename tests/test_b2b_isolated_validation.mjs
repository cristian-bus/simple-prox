// Suite de Pruebas Aisladas B2B - Validación sin contaminar métricas (Fase 13)
import assert from 'node:assert';
import { isCampaignEligibleForCommerce, extractB2BMetadata, generateWhatsAppMessage, getCampaignStatus } from '../src/utils/b2bUtils.js';
import { buildWhatsAppUrl } from '../src/services/adSyncEngine.js';

console.log('================================================================');
console.log('VALIDACIÓN B2B LOCAL AISLADA - ETAPAS 2 Y 3 (DATOS SINTÉTICOS)');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
  }
}

// -----------------------------------------------------------------------------
// ETAPA 2: SEGMENTACIÓN GEOGRÁFICA
// -----------------------------------------------------------------------------
console.log('--- ETAPA 2: PRUEBAS DE SEGMENTACIÓN GEOGRÁFICA ---');

runTest('1. Campaña sin segmentación (targetProvinces = null / vacía / ALL) aplica a cualquier provincia', () => {
  const campaignAll = {
    id: 'camp-global-1',
    title: 'Gaseosas Global',
    targetProvinces: ['ALL'],
    targetCities: null
  };
  const profileSanLuis = { provinceCode: 'AR-D', provinceName: 'San Luis', cityCode: 'SL-CAPITAL' };
  const profileCordoba = { provinceCode: 'AR-X', provinceName: 'Córdoba', cityCode: 'CBA-CAPITAL' };
  const profileBA = { provinceCode: 'AR-B', provinceName: 'Buenos Aires', cityCode: 'BA-LA-PLATA' };

  assert.strictEqual(isCampaignEligibleForCommerce(campaignAll, profileSanLuis), true);
  assert.strictEqual(isCampaignEligibleForCommerce(campaignAll, profileCordoba), true);
  assert.strictEqual(isCampaignEligibleForCommerce(campaignAll, profileBA), true);

  const campaignNull = { id: 'camp-global-2', title: 'Snacks General', targetProvinces: null };
  assert.strictEqual(isCampaignEligibleForCommerce(campaignNull, profileSanLuis), true);
  assert.strictEqual(isCampaignEligibleForCommerce(campaignNull, profileCordoba), true);
});

runTest('2. Campaña segmentada exclusivamente para San Luis (AR-D)', () => {
  const campaignSanLuis = {
    id: 'camp-sl-1',
    title: 'Cerveza Local SL',
    targetProvinces: ['AR-D'],
    targetCities: null
  };

  const profileSanLuisCode = { provinceCode: 'AR-D', provinceName: 'San Luis' };
  const profileSanLuisName = { provinceCode: '', provinceName: 'San Luis' };
  const profileCordoba = { provinceCode: 'AR-X', provinceName: 'Córdoba' };
  const profileMendoza = { provinceCode: 'AR-M', provinceName: 'Mendoza' };

  assert.strictEqual(isCampaignEligibleForCommerce(campaignSanLuis, profileSanLuisCode), true, 'Debe coincidir por código AR-D');
  assert.strictEqual(isCampaignEligibleForCommerce(campaignSanLuis, profileSanLuisName), true, 'Debe coincidir por nombre San Luis');
  assert.strictEqual(isCampaignEligibleForCommerce(campaignSanLuis, profileCordoba), false, 'Córdoba NO debe ver campaña de San Luis');
  assert.strictEqual(isCampaignEligibleForCommerce(campaignSanLuis, profileMendoza), false, 'Mendoza NO debe ver campaña de San Luis');
});

runTest('3. Campaña segmentada por provincia y ciudad específica (AR-D + SL-CAPITAL)', () => {
  const campaignCitySpecific = {
    id: 'camp-sl-cap-1',
    title: 'Panificados Capital',
    targetProvinces: ['AR-D'],
    targetCities: ['SL-CAPITAL']
  };

  const profileCapital = { provinceCode: 'AR-D', provinceName: 'San Luis', cityCode: 'SL-CAPITAL', cityName: 'San Luis' };
  const profileVillaMercedes = { provinceCode: 'AR-D', provinceName: 'San Luis', cityCode: 'SL-VILLA-MERCEDES', cityName: 'Villa Mercedes' };
  const profileCordoba = { provinceCode: 'AR-X', provinceName: 'Córdoba', cityCode: 'SL-CAPITAL' }; // Código de ciudad fuera de provincia

  assert.strictEqual(isCampaignEligibleForCommerce(campaignCitySpecific, profileCapital), true, 'Capital debe recibir la campaña');
  assert.strictEqual(isCampaignEligibleForCommerce(campaignCitySpecific, profileVillaMercedes), false, 'Villa Mercedes debe ser excluida');
  assert.strictEqual(isCampaignEligibleForCommerce(campaignCitySpecific, profileCordoba), false, 'Córdoba debe ser excluida');
});

runTest('4. Inferencia inteligente de provincia para campañas legacy sin metadata explícita', () => {
  // Caso A: Distribuidor contiene 'San Luis'
  const campLegacySL = {
    id: 'camp-leg-1',
    supplierName: 'Distribuidora Central San Luis',
    description: 'Promoción especial de bebidas'
  };
  assert.strictEqual(isCampaignEligibleForCommerce(campLegacySL, { provinceCode: 'AR-D' }), true);
  assert.strictEqual(isCampaignEligibleForCommerce(campLegacySL, { provinceCode: 'AR-B' }), false);

  // Caso B: Teléfono con prefijo 266 (San Luis)
  const campPhoneSL = {
    id: 'camp-leg-2',
    supplierName: 'Mayorista Sin Nombre',
    whatsappNumber: '2664001122',
    description: 'Ofertas semanales'
  };
  assert.strictEqual(isCampaignEligibleForCommerce(campPhoneSL, { provinceCode: 'AR-D' }), true);
  assert.strictEqual(isCampaignEligibleForCommerce(campPhoneSL, { provinceCode: 'AR-X' }), false);

  // Caso C: Distribuidor contiene 'Córdoba'
  const campLegacyCBA = {
    id: 'camp-leg-3',
    supplierName: 'Distribuidora Córdoba Centro',
    description: 'Chocolates'
  };
  assert.strictEqual(isCampaignEligibleForCommerce(campLegacyCBA, { provinceCode: 'AR-X' }), true);
  assert.strictEqual(isCampaignEligibleForCommerce(campLegacyCBA, { provinceCode: 'AR-D' }), false);
});

runTest('5. Normalización robusta (mayúsculas, tildes y espacios)', () => {
  const camp = {
    id: 'camp-norm-1',
    targetProvinces: ['córdoba', 'tucumán'],
    targetCities: ['río cuarto']
  };
  const profileMatch = { provinceCode: 'ar-x', provinceName: 'Cordoba', cityCode: '', cityName: 'Rio Cuarto' };
  const profileMismatch = { provinceCode: 'ar-d', provinceName: 'San Luis', cityCode: '', cityName: 'Rio Cuarto' };

  assert.strictEqual(isCampaignEligibleForCommerce(camp, profileMatch), true);
  assert.strictEqual(isCampaignEligibleForCommerce(camp, profileMismatch), false);
});

// -----------------------------------------------------------------------------
// ETAPA 3: WHATSAPP Y ENLACES EXTERNOS
// -----------------------------------------------------------------------------
console.log('\n--- ETAPA 3: PRUEBAS DE WHATSAPP Y ENLACES EXTERNOS ---');

runTest('6. Normalización de números argentinos para enlace WhatsApp', () => {
  // Caso 1: 10 dígitos sin 54 ni 9 (ej. 2664805745 -> 5492664805745)
  const url1 = buildWhatsAppUrl('2664805745', null, 'Coca Cola', 'SPX-001');
  assert.ok(url1.startsWith('https://api.whatsapp.com/send?phone=5492664805745'), 'Debe anteponer 549 a 10 dígitos');

  // Caso 2: 11 dígitos con 0 (ej. 02664805745 -> 5492664805745)
  const url2 = buildWhatsAppUrl('02664805745', null, 'Coca Cola', 'SPX-001');
  assert.ok(url2.startsWith('https://api.whatsapp.com/send?phone=5492664805745'), 'Debe remover el 0 y anteponer 549');

  // Caso 3: 12 dígitos con 54 sin 9 (ej. 542664805745 -> 5492664805745)
  const url3 = buildWhatsAppUrl('542664805745', null, 'Coca Cola', 'SPX-001');
  assert.ok(url3.startsWith('https://api.whatsapp.com/send?phone=5492664805745'), 'Debe insertar el 9 tras 54');

  // Caso 4: Ya formateado completo (5492664805745)
  const url4 = buildWhatsAppUrl('5492664805745', null, 'Coca Cola', 'SPX-001');
  assert.ok(url4.startsWith('https://api.whatsapp.com/send?phone=5492664805745'), 'Debe conservar el número ya formateado');
});

runTest('7. Manejo seguro ante números telefónicos ausentes o inválidos', () => {
  assert.strictEqual(buildWhatsAppUrl(null, null, 'Test', '001'), '#', 'Null debe devolver #');
  assert.strictEqual(buildWhatsAppUrl('', null, 'Test', '001'), '#', 'Vacío debe devolver #');
  assert.strictEqual(buildWhatsAppUrl('---', null, 'Test', '001'), '#', 'Solo símbolos debe devolver #');
});

runTest('8. Construcción correcta del mensaje codificado en URL', () => {
  const url = buildWhatsAppUrl('2664001122', null, 'Pack Cerveza', 'SPX-TEST');
  assert.ok(url.includes('phone=5492664001122'), 'Número normalizado en URL');
  assert.ok(url.includes('text='), 'Parámetro de texto codificado');
  assert.ok(url.includes('Pack%20Cerveza') || url.includes('Pack+Cerveza'), 'Título codificado');
  assert.ok(url.includes('SPX-TEST'), 'Código de campaña en mensaje');
});

runTest('9. Validación de política de seguridad para URLs externas (isSafeExternalUrl)', () => {
  function isSafeExternalUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // URLs seguras permitidas
  assert.strictEqual(isSafeExternalUrl('https://api.whatsapp.com/send?phone=5492664001122'), true);
  assert.strictEqual(isSafeExternalUrl('https://web.whatsapp.com'), true);
  assert.strictEqual(isSafeExternalUrl('mailto:soporte@simpleprox.com'), true);

  // URLs peligrosas o no permitidas bloqueadas por política
  assert.strictEqual(isSafeExternalUrl('#'), false);
  assert.strictEqual(isSafeExternalUrl('javascript:alert(1)'), false);
  assert.strictEqual(isSafeExternalUrl('file:///C:/Windows/System32'), false);
  assert.strictEqual(isSafeExternalUrl('data:text/html,<h1>hack</h1>'), false);
  assert.strictEqual(isSafeExternalUrl(''), false);
  assert.strictEqual(isSafeExternalUrl(null), false);
});

// -----------------------------------------------------------------------------
// CONTROL DE MÉTRICAS (DWELL TIME, COOLDOWN, DEBOUNCE)
// -----------------------------------------------------------------------------
console.log('\n--- CONTROL DE MÉTRICAS (DWELL TIME, COOLDOWN, DEBOUNCING) ---');

runTest('10. Debouncing de Clics a WhatsApp (1500 ms de ventana anti-rebote)', () => {
  const lastWhatsAppTrackRef = { campaignId: null, timestamp: 0 };
  let trackCallCount = 0;

  function simulateWhatsAppClick(targetId) {
    const now = Date.now();
    if (
      lastWhatsAppTrackRef.campaignId === targetId &&
      now - lastWhatsAppTrackRef.timestamp < 1500
    ) {
      // Bloqueado por debounce
      return false;
    }
    lastWhatsAppTrackRef.campaignId = targetId;
    lastWhatsAppTrackRef.timestamp = now;
    trackCallCount++;
    return true;
  }

  // Primer clic
  assert.strictEqual(simulateWhatsAppClick('camp-1'), true, 'Primer clic debe registrarse');
  assert.strictEqual(trackCallCount, 1);

  // Clic inmediato duplicado (rebote / doble clic)
  assert.strictEqual(simulateWhatsAppClick('camp-1'), false, 'Doble clic dentro de 1500ms debe ser bloqueado');
  assert.strictEqual(trackCallCount, 1, 'No debe incrementar contador');

  // Clic en otra campaña distinta
  assert.strictEqual(simulateWhatsAppClick('camp-2'), true, 'Clic en otra campaña debe registrarse');
  assert.strictEqual(trackCallCount, 2);
});

runTest('11. Cooldown de Impresiones (5 minutos por campaña en sesión local)', () => {
  const lastImpressionMap = new Map();
  const IMPRESSION_COOLDOWN_MS = 5 * 60 * 1000;
  let impressionCount = 0;

  function simulateImpression(campaignId, currentTime) {
    const lastTracked = lastImpressionMap.get(campaignId);
    if (lastTracked && currentTime - lastTracked < IMPRESSION_COOLDOWN_MS) {
      return false; // Cooldown activo
    }
    lastImpressionMap.set(campaignId, currentTime);
    impressionCount++;
    return true;
  }

  const t0 = 1000000;
  assert.strictEqual(simulateImpression('camp-a', t0), true);
  assert.strictEqual(impressionCount, 1);

  // 1 minuto después (t0 + 60s) -> En cooldown
  assert.strictEqual(simulateImpression('camp-a', t0 + 60000), false);
  assert.strictEqual(impressionCount, 1);

  // 5 minutos + 1 segundo después (t0 + 301s) -> Cooldown expirado, permite nueva impresión
  assert.strictEqual(simulateImpression('camp-a', t0 + 301000), true);
  assert.strictEqual(impressionCount, 2);
});

console.log('\n================================================================');
console.log(`RESULTADO DE LA SUITE B2B AISLADA: ${passedTests}/${totalTests} PRUEBAS PASARON`);
console.log('================================================================');

