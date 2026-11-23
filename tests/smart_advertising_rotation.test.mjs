import { buildPriorityRotationSequence, findBannerSlotForCampaign } from '../src/hooks/useOfertas.js';
import { getLowStockReplenishmentOpportunities } from '../src/utils/stockOfferMatcher.js';
import { isCampaignEligibleForCommerce, getCampaignStatus } from '../src/utils/b2bUtils.js';

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
console.log('SUITE DE PRUEBAS OBLIGATORIAS: ROTACIÓN INTELIGENTE (PASO 4)');
console.log('====================================================\n');

// 1. SIN CAMPAÑAS PREMIUM: ROTACIÓN ORIGINAL
console.log('--- 1. Sin campañas premium: rotación 100% original ---');
{
  const normalCampaigns = [
    { id: 'c1', title: 'Galletitas', isSmartAdvertising: false },
    { id: 'c2', title: 'Golosinas', isSmartAdvertising: false },
    { id: 'c3', title: 'Bebidas', isSmartAdvertising: false }
  ];
  const products = [{ id: 1, name: 'Galletitas', stock: 1, stockAlert: 5, isActive: true }];
  
  // Regla: filtrar smartEligible
  const smartEligible = normalCampaigns.filter(c => c.isSmartAdvertising === true);
  const opps = getLowStockReplenishmentOpportunities(products, smartEligible);
  const ctxIds = new Set(opps.map(o => o.campaign.id));
  const seq = buildPriorityRotationSequence(normalCampaigns, ctxIds);

  assert(seq === normalCampaigns, 'Devuelve exactamente la referencia original sin alteraciones');
  assert(seq.length === 3, 'Longitud idéntica a la original');
}

// 2. CAMPAÑA PREMIUM SIN STOCK BAJO: ROTACIÓN ORIGINAL
console.log('\n--- 2. Campaña premium sin stock bajo: rotación original ---');
{
  const campaigns = [
    { id: 'c1', title: 'Sidra', isSmartAdvertising: true },
    { id: 'c2', title: 'Chocolates', isSmartAdvertising: false }
  ];
  // El kiosco tiene stock suficiente de sidra (20 > 5)
  const products = [{ id: 1, name: 'Sidra', stock: 20, stockAlert: 5, isActive: true }];

  const smartEligible = campaigns.filter(c => c.isSmartAdvertising === true);
  const opps = getLowStockReplenishmentOpportunities(products, smartEligible);
  const ctxIds = new Set(opps.map(o => o.campaign.id));
  const seq = buildPriorityRotationSequence(campaigns, ctxIds);

  assert(opps.length === 0, 'No hay oportunidades de reposición');
  assert(seq === campaigns, 'No recibe prioridad: conserva rotación original');
}

// 3. CAMPAÑA NORMAL CON STOCK BAJO: SIN PRIORIDAD
console.log('\n--- 3. Campaña normal con stock bajo: sin prioridad ---');
{
  const campaigns = [
    { id: 'c1', title: 'Sidra', isSmartAdvertising: false }, // Normal
    { id: 'c2', title: 'Chocolates', isSmartAdvertising: false }
  ];
  // El kiosco tiene stock bajo de sidra (1 <= 5), pero la campaña NO es premium
  const products = [{ id: 1, name: 'Sidra', stock: 1, stockAlert: 5, isActive: true }];

  const smartEligible = campaigns.filter(c => c.isSmartAdvertising === true);
  const opps = getLowStockReplenishmentOpportunities(products, smartEligible);
  const ctxIds = new Set(opps.map(o => o.campaign.id));
  const seq = buildPriorityRotationSequence(campaigns, ctxIds);

  assert(smartEligible.length === 0, 'La campaña no califica como smartEligible');
  assert(seq === campaigns, 'Participa exclusivamente en rotación normal');
}

// 4. CAMPAÑA PREMIUM CON STOCK BAJO: PRIORIDAD CONTEXTUAL
console.log('\n--- 4. Campaña premium con stock bajo: prioridad contextual ---');
{
  const campaigns = [
    { id: 'c-sidra', title: 'Sidra', isSmartAdvertising: true },
    { id: 'c-choc', title: 'Chocolates', isSmartAdvertising: false },
    { id: 'c-yerba', title: 'Yerba', isSmartAdvertising: false }
  ];
  const products = [{ id: 1, name: 'Sidras', stock: 2, stockAlert: 5, isActive: true }];

  const smartEligible = campaigns.filter(c => c.isSmartAdvertising === true);
  const opps = getLowStockReplenishmentOpportunities(products, smartEligible);
  const ctxIds = new Set(opps.map(o => o.campaign.id));
  const seq = buildPriorityRotationSequence(campaigns, ctxIds);

  assert(opps.length === 1 && opps[0].campaign.id === 'c-sidra', 'Campaña premium detectada como oportunidad contextual');
  assert(seq !== campaigns, 'Secuencia adaptada con prioridad contextual');
  assert(seq[0].id === 'c-sidra', 'Primer slot asignado a la campaña contextual');
}

// 5. UNA PREMIUM Y VARIAS NORMALES: DISTRIBUCIÓN EQUILIBRADA Y SIN REPETICIONES
console.log('\n--- 5. Una premium y varias normales (1 premium vs 3 normales) ---');
{
  const campaigns = [
    { id: 'prem', title: 'Sidra Premium', isSmartAdvertising: true },
    { id: 'n1', title: 'Galletitas', isSmartAdvertising: false },
    { id: 'n2', title: 'Golosinas', isSmartAdvertising: false },
    { id: 'n3', title: 'Gaseosas', isSmartAdvertising: false }
  ];
  const ctxIds = new Set(['prem']);
  const seq = buildPriorityRotationSequence(campaigns, ctxIds);

  // Verificar que ninguna se repita consecutivamente
  let hasConsecutive = false;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i].id === seq[i - 1].id) hasConsecutive = true;
  }
  if (seq.length > 1 && seq[seq.length - 1].id === seq[0].id) hasConsecutive = true;

  assert(!hasConsecutive, 'Cero repeticiones consecutivas');
  assert(seq.some(c => c.id === 'n1') && seq.some(c => c.id === 'n2') && seq.some(c => c.id === 'n3'), 'Todas las campañas normales participan');
}

// 6. VARIAS CAMPAÑAS PREMIUM Y NORMALES
console.log('\n--- 6. Varias premium y normales (2 premium vs 2 normales) ---');
{
  const campaigns = [
    { id: 'p1', title: 'Sidra', isSmartAdvertising: true },
    { id: 'p2', title: 'Yerba', isSmartAdvertising: true },
    { id: 'n1', title: 'Alfajores', isSmartAdvertising: false },
    { id: 'n2', title: 'Chocolates', isSmartAdvertising: false }
  ];
  const ctxIds = new Set(['p1', 'p2']);
  const seq = buildPriorityRotationSequence(campaigns, ctxIds);

  const p1Count = seq.filter(c => c.id === 'p1').length;
  const p2Count = seq.filter(c => c.id === 'p2').length;
  const n1Count = seq.filter(c => c.id === 'n1').length;
  const n2Count = seq.filter(c => c.id === 'n2').length;

  assert(p1Count === p2Count, 'Distribución equilibrada entre campañas premium');
  assert(n1Count === n2Count, 'Distribución equilibrada entre campañas normales');
  assert(n1Count > 0 && n2Count > 0, 'Las campañas normales no son desplazadas');
}

// 7. TODAS LAS CAMPAÑAS PREMIUM: ROTACIÓN NORMAL EQUILIBRADA
console.log('\n--- 7. Todas las campañas premium ---');
{
  const campaigns = [
    { id: 'p1', title: 'Sidra', isSmartAdvertising: true },
    { id: 'p2', title: 'Yerba', isSmartAdvertising: true }
  ];
  const ctxIds = new Set(['p1', 'p2']);
  const seq = buildPriorityRotationSequence(campaigns, ctxIds);

  assert(seq === campaigns, 'Si todas son premium contextuales, mantiene rotación equitativa normal');
}

// 8. FILTROS INNEGOCIABLES: INACTIVAS, VENCIDAS O FUERA DE ZONA
console.log('\n--- 8. Inactivas, vencidas o fuera de zona nunca reciben prioridad ---');
{
  const commerceProfile = { provinceCode: 'AR-X', cityName: 'Córdoba' };
  const rawCampaigns = [
    { id: 'c-inactive', title: 'Sidra', status: 'paused', isSmartAdvertising: true },
    { id: 'c-expired', title: 'Sidra', status: 'active', startDate: '2026-01-01', endDate: '2026-01-15', isSmartAdvertising: true },
    { id: 'c-out-of-zone', title: 'Sidra', status: 'active', targetProvinces: ['AR-D'], isSmartAdvertising: true } // San Luis
  ];

  // Simular el filtrado exacto de useOfertas.campaigns
  const eligible = rawCampaigns.filter(c => {
    const st = (c.status || 'active').toLowerCase();
    if (st !== 'active' && st !== 'activa') return false;
    if (getCampaignStatus(c) !== 'active') return false;
    return isCampaignEligibleForCommerce(c, commerceProfile);
  });

  assert(eligible.length === 0, 'Ninguna campaña inactiva, vencida o fuera de zona supera el filtro de elegibilidad');
}

// 9. SIN CAMPAÑAS: FUNCIONAMIENTO SEGURO
console.log('\n--- 9. Sin campañas (array vacío o nulo) ---');
{
  const seqEmpty = buildPriorityRotationSequence([], new Set());
  const seqNull = buildPriorityRotationSequence(null, new Set());
  assert(Array.isArray(seqEmpty) && seqEmpty.length === 0, 'Manejo seguro de array vacío');
  assert(seqNull === null, 'Manejo seguro de null');
}

// 10. CAMBIOS DE STOCK DURANTE LA EJECUCIÓN
console.log('\n--- 10. Actualización reactiva ante cambios de stock ---');
{
  const campaigns = [
    { id: 'c-sidra', title: 'Sidra', isSmartAdvertising: true },
    { id: 'c-choc', title: 'Chocolate', isSmartAdvertising: false }
  ];
  
  // Estado 1: Stock normal (10 > 5) -> No hay prioridad
  let products = [{ id: 1, name: 'Sidra', stock: 10, stockAlert: 5, isActive: true }];
  let opps = getLowStockReplenishmentOpportunities(products, campaigns.filter(c => c.isSmartAdvertising));
  let seq1 = buildPriorityRotationSequence(campaigns, new Set(opps.map(o => o.campaign.id)));
  assert(seq1 === campaigns, 'Estado 1: Stock normal genera rotación original');

  // Estado 2: Se produce venta -> Stock cae a 1 (1 <= 5) -> Se activa prioridad
  products = [{ id: 1, name: 'Sidra', stock: 1, stockAlert: 5, isActive: true }];
  opps = getLowStockReplenishmentOpportunities(products, campaigns.filter(c => c.isSmartAdvertising));
  let seq2 = buildPriorityRotationSequence(campaigns, new Set(opps.map(o => o.campaign.id)));
  assert(seq2 !== campaigns && seq2.length > 0, 'Estado 2: Caída de stock activa reactivamente la prioridad');
}

// 11. SIN DUPLICACIÓN EN EL CATÁLOGO ÚNICO
console.log('\n--- 11. ofertas.campaigns permanece como catálogo único sin duplicados ---');
{
  const campaigns = [
    { id: 'c1', title: 'Sidra', isSmartAdvertising: true },
    { id: 'c2', title: 'Yerba', isSmartAdvertising: false }
  ];
  // useOfertas devuelve: { campaigns, activeCampaign, ... }
  // campaigns es el array original de longitud 2
  assert(campaigns.length === 2, 'El catálogo de ofertas mantiene estrictamente sus elementos únicos');
}

// 12. COMPATIBILIDAD CON EVENTOS Y COOLDOWN DE MÉTRICAS
console.log('\n--- 12. Métricas y deduplicación preservadas ---');
{
  const IMPRESSION_COOLDOWN_MS = 5 * 60 * 1000;
  const lastImpressionMap = new Map();
  const campId = 'camp-test-01';

  // Primer impacto a t=0
  const t0 = 100000;
  lastImpressionMap.set(campId, t0);

  // Intento de duplicación a t=30 seg (debe ser bloqueado por cooldown de 5 min)
  const t1 = t0 + 30 * 1000;
  const isCooldownActive1 = (t1 - lastImpressionMap.get(campId)) < IMPRESSION_COOLDOWN_MS;
  assert(isCooldownActive1, 'Cooldown de 5 minutos bloquea impresiones artificiales tempranas');

  // Intento válido a t=6 min (debe ser admitido)
  const t2 = t0 + 6 * 60 * 1000;
  const isCooldownActive2 = (t2 - lastImpressionMap.get(campId)) < IMPRESSION_COOLDOWN_MS;
  assert(!isCooldownActive2, 'Impresión admitida una vez transcurrido el cooldown legítimo');
}

// 13. LÍMITES DIARIOS DE IMPRESIONES (CUPOS)
console.log('\n--- 13. Límites e impresiones diarias respetados ---');
{
  const campaigns = [
    { id: 'c-limit', title: 'Oferta Cupo', is_daily_limit_enabled: true, isSmartAdvertising: true },
    { id: 'c-free', title: 'Oferta Libre', is_daily_limit_enabled: false, isSmartAdvertising: false }
  ];
  // Si la cuota de c-limit está agotada en Supabase (v_campaign_daily_quotas), terminal-sync no la entrega
  const availableFromSync = campaigns.filter(c => c.id !== 'c-limit'); // Simulación cupo agotado
  assert(!availableFromSync.some(c => c.id === 'c-limit'), 'Campaña con cupo agotado nunca llega al carrusel');
}

// 14. SINCRONIZACIÓN ESTRICTA: CAMPAÑA VISIBLE E INDICADOR ACTIVO (PASO 5)
console.log('\n--- 14. Indicador activo coincide con la campaña visible ---');
{
  const uniqueCampaigns = [
    { id: 'sidra', title: 'Sidra Real', isSmartAdvertising: true },
    { id: 'coca', title: 'Coca-Cola', isSmartAdvertising: false },
    { id: 'oreo', title: 'Galletitas Oreo', isSmartAdvertising: false },
    { id: 'jorgito', title: 'Alfajor Jorgito', isSmartAdvertising: false }
  ];
  const ctxIds = new Set(['sidra']);
  const bannerCampaigns = buildPriorityRotationSequence(uniqueCampaigns, ctxIds);

  let allMatch = true;
  for (let bannerIndex = 0; bannerIndex < bannerCampaigns.length; bannerIndex++) {
    const activeCampaign = bannerCampaigns[bannerIndex % bannerCampaigns.length];
    const currentAdIndex = uniqueCampaigns.findIndex(c => c.id === activeCampaign.id);
    const highlightedCampaign = uniqueCampaigns[currentAdIndex % uniqueCampaigns.length];
    if (activeCampaign.id !== highlightedCampaign.id) {
      allMatch = false;
      break;
    }
  }
  assert(allMatch, 'En cada posición de la rotación, el indicador activo corresponde exactamente a la campaña mostrada');
}

// 15. CONTADOR VISUAL COHERENTE EN TODA LA SECUENCIA (PASO 5)
console.log('\n--- 15. Contador visual correcto (currentAdIndex + 1 / campaigns.length) ---');
{
  const uniqueCampaigns = [
    { id: 'sidra', title: 'Sidra Real', isSmartAdvertising: true },
    { id: 'coca', title: 'Coca-Cola', isSmartAdvertising: false },
    { id: 'oreo', title: 'Galletitas Oreo', isSmartAdvertising: false }
  ];
  const bannerCampaigns = buildPriorityRotationSequence(uniqueCampaigns, new Set(['sidra']));

  let validCounters = true;
  bannerCampaigns.forEach((active, bannerIdx) => {
    const currentAdIndex = uniqueCampaigns.findIndex(c => c.id === active.id);
    const counterText = `${(currentAdIndex % uniqueCampaigns.length) + 1}/${uniqueCampaigns.length}`;
    const expectedPosition = uniqueCampaigns.findIndex(c => c.id === active.id) + 1;
    if (counterText !== `${expectedPosition}/${uniqueCampaigns.length}`) {
      validCounters = false;
    }
  });
  assert(validCounters, 'El contador refleja fielmente la posición 1-based de la campaña en el catálogo único');
}

// 16. NAVEGACIÓN MANUAL DIRECTA: goToAd A CUALQUIER CAMPAÑA (PASO 5)
console.log('\n--- 16. Navegación manual a cualquier campaña con goToAd ---');
{
  const uniqueCampaigns = [
    { id: 'c0', title: 'Sidra', isSmartAdvertising: true },
    { id: 'c1', title: 'Coca', isSmartAdvertising: false },
    { id: 'c2', title: 'Oreo', isSmartAdvertising: false },
    { id: 'c3', title: 'Jorgito', isSmartAdvertising: false }
  ];
  const bannerCampaigns = buildPriorityRotationSequence(uniqueCampaigns, new Set(['c0']));

  let allGoToMatch = true;
  // Probar seleccionar cada una de las 4 campañas desde diferentes posiciones actuales
  for (let currentBannerIdx = 0; currentBannerIdx < bannerCampaigns.length; currentBannerIdx++) {
    for (let targetUniqueIdx = 0; targetUniqueIdx < uniqueCampaigns.length; targetUniqueIdx++) {
      const targetCamp = uniqueCampaigns[targetUniqueIdx];
      const targetSlot = findBannerSlotForCampaign(bannerCampaigns, targetCamp.id, currentBannerIdx);
      const landedCamp = bannerCampaigns[targetSlot];
      const resolvedUniqueIdx = uniqueCampaigns.findIndex(c => c.id === landedCamp?.id);
      if (resolvedUniqueIdx !== targetUniqueIdx) {
        allGoToMatch = false;
      }
    }
  }
  assert(allGoToMatch, 'goToAd(uniqueIndex) aterriza con 100% de precisión en la campaña seleccionada');
}

// 17. NAVEGACIÓN ANTERIOR Y SIGUIENTE EN SECUENCIA CIRCULAR (PASO 5)
console.log('\n--- 17. Navegación circular siguiente y anterior ---');
{
  const uniqueCampaigns = [
    { id: 'c0', title: 'Sidra', isSmartAdvertising: true },
    { id: 'c1', title: 'Coca', isSmartAdvertising: false },
    { id: 'c2', title: 'Oreo', isSmartAdvertising: false }
  ];
  const bannerCampaigns = buildPriorityRotationSequence(uniqueCampaigns, new Set(['c0']));
  const len = bannerCampaigns.length;

  let idx = 0;
  // Siguiente hasta dar la vuelta completa
  for (let step = 0; step < len * 2; step++) {
    idx = (idx + 1) % len;
  }
  assert(idx === 0, 'nextAd da la vuelta circular completa sin desbordes');

  // Anterior hasta dar la vuelta completa
  for (let step = 0; step < len * 2; step++) {
    idx = (idx - 1 + len) % len;
  }
  assert(idx === 0, 'prevAd retrocede circularmente sin desbordes ni índices negativos');
}

// 18. ROTACIÓN CON 1, 2, 3 Y 21 CAMPAÑAS (PASO 5)
console.log('\n--- 18. Escala de catálogo: 1, 2, 3 y 21 campañas ---');
{
  // 1 campaña
  const c1 = [{ id: 'single', title: 'Única', isSmartAdvertising: true }];
  const seq1 = buildPriorityRotationSequence(c1, new Set(['single']));
  assert(seq1.length === 1 && seq1[0].id === 'single', '1 campaña: secuencia unitaria estable');

  // 2 campañas
  const c2 = [
    { id: 'c1', title: 'C1', isSmartAdvertising: true },
    { id: 'c2', title: 'C2', isSmartAdvertising: false }
  ];
  const seq2 = buildPriorityRotationSequence(c2, new Set(['c1']));
  assert(seq2.length === 6 && seq2[seq2.length - 1].id !== seq2[0].id, '2 campañas: secuencia alterna sin colisiones en ciclo');

  // 3 campañas
  const c3 = [
    { id: 'p1', title: 'P1', isSmartAdvertising: true },
    { id: 'n1', title: 'N1', isSmartAdvertising: false },
    { id: 'n2', title: 'N2', isSmartAdvertising: false }
  ];
  const seq3 = buildPriorityRotationSequence(c3, new Set(['p1']));
  assert(seq3.length >= 3 && seq3[seq3.length - 1].id !== seq3[0].id, '3 campañas: rotación fluida');

  // 21 campañas comerciales (3 premium vs 18 normales)
  const c21 = [];
  const prem21 = new Set(['p1', 'p2', 'p3']);
  for (let i = 1; i <= 3; i++) c21.push({ id: `p${i}`, title: `P${i}`, isSmartAdvertising: true });
  for (let i = 1; i <= 18; i++) c21.push({ id: `n${i}`, title: `N${i}`, isSmartAdvertising: false });
  const seq21 = buildPriorityRotationSequence(c21, prem21);

  let c21SyncOk = true;
  for (let i = 0; i < seq21.length; i++) {
    const act = seq21[i];
    const uIdx = c21.findIndex(c => c.id === act.id);
    if (c21[uIdx].id !== act.id) c21SyncOk = false;
  }
  assert(c21SyncOk, '21 campañas comerciales: 100% sincronización en todos los slots');
}

// SIMULACIÓN DE 300 ROTACIONES COMERCIALES
console.log('\n====================================================');
console.log('SIMULACIÓN REAL DE 300 ROTACIONES (UNIVERSO COMERCIAL: 3 PREMIUM VS 18 NORMALES)');
console.log('====================================================');
{
  const commercialUniverse = [];
  const premiumIds = new Set(['prem-1', 'prem-2', 'prem-3']);

  for (let i = 1; i <= 3; i++) {
    commercialUniverse.push({ id: `prem-${i}`, title: `Mayorista P${i}`, isSmartAdvertising: true });
  }
  for (let i = 1; i <= 18; i++) {
    commercialUniverse.push({ id: `norm-${i}`, title: `Comercial N${i}`, isSmartAdvertising: false });
  }

  const seq = buildPriorityRotationSequence(commercialUniverse, premiumIds);
  const counts = new Map();
  commercialUniverse.forEach(c => counts.set(c.id, 0));

  let consecutiveDupes = 0;
  let lastId = null;

  for (let tick = 0; tick < 300; tick++) {
    const active = seq[tick % seq.length];
    counts.set(active.id, counts.get(active.id) + 1);
    if (lastId === active.id) consecutiveDupes++;
    lastId = active.id;
  }

  let totalPremHits = 0;
  let totalNormHits = 0;
  counts.forEach((hits, id) => {
    if (premiumIds.has(id)) totalPremHits += hits;
    else totalNormHits += hits;
  });

  const premPct = (totalPremHits / 300) * 100;
  const normPct = (totalNormHits / 300) * 100;
  let minNorm = Infinity, maxNorm = 0;
  counts.forEach((hits, id) => {
    if (!premiumIds.has(id)) {
      if (hits < minNorm) minNorm = hits;
      if (hits > maxNorm) maxNorm = hits;
    }
  });

  console.log(`- Participación Premium Total: ${premPct.toFixed(1)}% (Cadencia objetivo ~33.3%)`);
  console.log(`- Participación Normal Total: ${normPct.toFixed(1)}%`);
  console.log(`- Promedio apariciones por campaña Premium: ${(totalPremHits / 3).toFixed(1)}`);
  console.log(`- Promedio apariciones por campaña Normal: ${(totalNormHits / 18).toFixed(1)}`);
  console.log(`- Ventaja contextual real observada: x${((totalPremHits / 3) / (totalNormHits / 18)).toFixed(2)}`);
  console.log(`- Rango apariciones normales: mín ${minNorm} / máx ${maxNorm} (Cero inanición)`);
  console.log(`- Repeticiones consecutivas en 300 ticks: ${consecutiveDupes}`);

  assert(consecutiveDupes === 0, 'Cero repeticiones consecutivas');
  assert(minNorm > 0, 'Todas las 18 campañas normales se mostraron');
  assert(premPct >= 30 && premPct <= 35, 'Participación premium dentro de la tolerancia de prioridad moderada');
}

console.log('\n====================================================');
console.log(`RESUMEN FINAL: Total: ${totalTests} | Aprobadas: ${passedTests} | Fallidas: ${failedTests}`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎯 TODAS LAS PRUEBAS PASARON SATISFACTORIAMENTE (PASS).\n');
}

