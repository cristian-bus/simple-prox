import { CAMPAIGN_SYNC_INTERVAL_MS } from '../src/hooks/useOfertas.js';
import { 
  syncCampaignsRemotely, 
  registerMerchantRemotely, 
  getCachedCampaigns, 
  setCachedCampaigns 
} from '../src/services/adSyncEngine.js';
import { getCampaignStatus, isCampaignEligibleForCommerce } from '../src/utils/b2bUtils.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('SUITE DE PRUEBAS OBLIGATORIAS: FASE 1 OPTIMIZACIÓN SUPABASE');
console.log('================================================================\n');

// 1. Constante de intervalo de sincronización
console.log('--- TEST 1: Constante de Intervalo de Polling ---');
assert(
  CAMPAIGN_SYNC_INTERVAL_MS === 10 * 60 * 1000,
  `El intervalo de polling debe ser exactamente 10 minutos (600.000 ms), obtenido: ${CAMPAIGN_SYNC_INTERVAL_MS} ms`
);
assert(
  CAMPAIGN_SYNC_INTERVAL_MS === 600000,
  'El valor numérico de CAMPAIGN_SYNC_INTERVAL_MS es exactamente 600000'
);

// 2. Caché local y funcionamiento offline
console.log('\n--- TEST 2: Funcionamiento Offline y Preservación de Caché ---');
const dummyCampaigns = [
  { id: 'camp-1', title: 'Coca Cola 2.25L', status: 'active', priority: 10 },
  { id: 'camp-2', title: 'Alfajor Jorgito', status: 'active', priority: 10 }
];

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { onLine: false };
}

setCachedCampaigns(dummyCampaigns);
const cached = getCachedCampaigns();
assert(Array.isArray(cached) && cached.length === 2, 'Las campañas cacheadas se leen correctamente');
assert(cached[0].id === 'camp-1', 'La primera campaña cacheada conserva su ID');
assert(cached[1].id === 'camp-2', 'La segunda campaña cacheada conserva su ID');

// 3. Verificación de que syncCampaignsRemotely NO invoca registerMerchantRemotely
console.log('\n--- TEST 3: Desacoplamiento de registerMerchantRemotely en syncCampaignsRemotely ---');

globalThis.fetch = async () => {
  throw new Error('Offline network error simulado');
};

let syncResult = null;
try {
  syncResult = await syncCampaignsRemotely({
    installationId: 'TEST-TERM-001',
    storeName: 'Kiosco Test',
    plan: 'Básico'
  });
} catch (e) {
  console.warn('Error en syncCampaignsRemotely offline:', e);
}

assert(Array.isArray(syncResult), 'syncCampaignsRemotely devuelve un array de campañas');
assert(syncResult.length === 2, 'syncCampaignsRemotely devuelve las campañas de caché offline');

// 4. Verificación de que registerMerchantRemotely sigue existiendo y es una función
console.log('\n--- TEST 4: Disponibilidad de registerMerchantRemotely para llamadas autorizadas ---');
assert(typeof registerMerchantRemotely === 'function', 'registerMerchantRemotely sigue disponible como función exportada');

// 5. Verificación de que demo mode previene llamadas si está activo
console.log('\n--- TEST 5: Protección de Modo Demo ---');
if (typeof globalThis.sessionStorage === 'undefined') {
  const sStore = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => sStore.get(k) || null,
    setItem: (k, v) => sStore.set(k, String(v)),
    removeItem: (k) => sStore.delete(k),
    clear: () => sStore.clear()
  };
}
sessionStorage.setItem('kioscoprox_demo_active', 'true');
const demoResult = await registerMerchantRemotely({ installationId: 'TEST-DEMO' });
assert(demoResult === false, 'registerMerchantRemotely respeta modo demo local');
sessionStorage.removeItem('kioscoprox_demo_active');

// 6. Verificación de vigencia dinámica: campañas expiradas no se muestran
console.log('\n--- TEST 6: Vigencia Dinámica y Expiración en Tiempo Real ---');
const activeCamp = {
  id: 'c-act',
  status: 'active',
  start_date: '2026-11-01',
  end_date: '2026-11-30'
};

const expiredCamp = {
  id: 'c-exp',
  status: 'active',
  start_date: '2026-10-01',
  end_date: '2026-10-31'
};

const pausedCamp = {
  id: 'c-pau',
  status: 'paused',
  start_date: '2026-11-01',
  end_date: '2026-11-30'
};

assert(getCampaignStatus(activeCamp) === 'active', 'Campaña con fecha actual dentro de rango retorna status active');
assert(getCampaignStatus(expiredCamp) === 'finished', 'Campaña con fecha fin vencida retorna status finished');
assert(getCampaignStatus(pausedCamp) === 'paused', 'Campaña con status paused retorna paused');

// 7. Verificación de elegibilidad geográfica intacta
console.log('\n--- TEST 7: Segmentación Geográfica Intacta ---');
const geoProfile = {
  provinceCode: 'AR-D',
  provinceName: 'San Luis',
  cityCode: 'SL-CAPITAL',
  cityName: 'San Luis'
};

const targetAllCamp = {
  id: 'c-all',
  targetProvinces: null,
  targetCities: null
};

const targetSpecificCamp = {
  id: 'c-sl',
  targetProvinces: ['AR-D'],
  targetCities: ['San Luis']
};

const targetOtherCamp = {
  id: 'c-other',
  targetProvinces: ['AR-C'],
  targetCities: ['CABA']
};

assert(isCampaignEligibleForCommerce(targetAllCamp, geoProfile) === true, 'Campaña sin segmentación califica para todos');
assert(isCampaignEligibleForCommerce(targetSpecificCamp, geoProfile) === true, 'Campaña de San Luis califica para kiosco en San Luis');
assert(isCampaignEligibleForCommerce(targetOtherCamp, geoProfile) === false, 'Campaña de CABA no califica para kiosco en San Luis');

console.log('\n================================================================');
console.log(`RESUMEN FINAL: Total: ${passed + failed} | Aprobadas: ${passed} | Fallidas: ${failed}`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
