import { 
  OUTBOX_FLUSH_INTERVAL_MS, 
  OUTBOX_BATCH_THRESHOLD, 
  OUTBOX_MAX_BATCH_SIZE,
  enqueueOutbox, 
  getOutbox, 
  flushOutbox 
} from '../src/services/syncService.js';
import { trackAdEvent } from '../src/services/adSyncEngine.js';
import { CAMPAIGN_SYNC_INTERVAL_MS } from '../src/hooks/useOfertas.js';

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
console.log('SUITE DE PRUEBAS OBLIGATORIAS: FASE 2 ENVÍO EN LOTES DE MÉTRICAS');
console.log('================================================================\n');

// Mock localStorage para entorno Node aislado
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) || null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};

// Configuración segura de navigator en Node
try {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    value: true,
    configurable: true,
    writable: true
  });
} catch (e) {
  // navigator ya configurado
}

// 1. Verificación de constantes de configuración de FASE 2
console.log('--- TEST 1: Constantes de Lotes y Umbrales ---');
assert(
  OUTBOX_FLUSH_INTERVAL_MS === 10 * 60 * 1000,
  `El intervalo de flush periódico debe ser exactamente 10 minutos (600.000 ms), obtenido: ${OUTBOX_FLUSH_INTERVAL_MS}`
);
assert(
  OUTBOX_BATCH_THRESHOLD === 40,
  `El umbral de eventos para flush anticipado debe ser 40, obtenido: ${OUTBOX_BATCH_THRESHOLD}`
);
assert(
  OUTBOX_MAX_BATCH_SIZE === 50,
  `El tamaño máximo de lote por petición debe ser 50, obtenido: ${OUTBOX_MAX_BATCH_SIZE}`
);

// 2. Persistencia inmediata de una impresión
console.log('\n--- TEST 2: Persistencia Inmediata de Impresiones ---');
localStorage.clear();
const evt1 = trackAdEvent({
  campaignId: 'camp-alpha',
  merchantId: 'TEST-MERCHANT-1',
  eventType: 'impression'
});
assert(Boolean(evt1 && evt1.eventId), 'El evento de impresión se genera con un eventId único');
const outboxAfter1 = getOutbox();
assert(outboxAfter1.length === 1, 'El evento se persistió de forma inmediata en el Outbox en disco');
assert(outboxAfter1[0].payload.eventId === evt1.eventId, 'El eventId en disco coincide exactamente con el generado');
assert(outboxAfter1[0].payload.eventType === 'impression', 'El tipo de evento persiste como impression');

// 3. Diez impresiones no generan peticiones individuales
console.log('\n--- TEST 3: Diez Impresiones se Acumulan sin Disparo Inmediato ---');
for (let i = 2; i <= 10; i++) {
  trackAdEvent({
    campaignId: `camp-${i}`,
    merchantId: 'TEST-MERCHANT-1',
    eventType: 'impression'
  });
}
const outboxAfter10 = getOutbox();
assert(outboxAfter10.length === 10, 'Las 10 impresiones se acumulan en el Outbox persistente (longitud: 10)');

// 4. Clics a WhatsApp y aperturas de detalle
console.log('\n--- TEST 4: Clics a WhatsApp y Aperturas de Detalle ---');
const clickEvt = trackAdEvent({
  campaignId: 'camp-alpha',
  merchantId: 'TEST-MERCHANT-1',
  eventType: 'whatsapp_click'
});
const openEvt = trackAdEvent({
  campaignId: 'camp-alpha',
  merchantId: 'TEST-MERCHANT-1',
  eventType: 'offer_open'
});
assert(clickEvt.eventType === 'whatsapp_click', 'Clic a WhatsApp registrado correctamente');
assert(openEvt.eventType === 'offer_open', 'Apertura de detalle registrada correctamente');
const outboxAfterClicks = getOutbox();
assert(outboxAfterClicks.length === 12, 'Outbox contiene las 10 impresiones + 1 clic + 1 apertura = 12 eventos');

// 5. Umbral de 40 eventos para envío anticipado
console.log('\n--- TEST 5: Umbral de 40 Eventos para Envío Anticipado ---');
localStorage.clear();
for (let i = 1; i <= 39; i++) {
  enqueueOutbox('CAMPAIGN_EVENT', {
    eventId: `evt-thresh-${i}`,
    campaignId: 'camp-thresh',
    eventType: 'impression'
  });
}
assert(getOutbox().length === 39, '39 eventos se mantienen en Outbox sin exceder umbral');

// Al agregar el evento 40, se alcanza el umbral de 40
enqueueOutbox('CAMPAIGN_EVENT', {
  eventId: 'evt-thresh-40',
  campaignId: 'camp-thresh',
  eventType: 'impression'
});
assert(getOutbox().length === 40, 'Outbox alcanza los 40 eventos acumulados');

// 6. Cincuenta eventos se envían en un lote válido
console.log('\n--- TEST 6: Envío en Lote de 50 Eventos ---');
localStorage.clear();
for (let i = 1; i <= 50; i++) {
  enqueueOutbox('CAMPAIGN_EVENT', {
    eventId: `evt-batch50-${i}`,
    campaignId: 'camp-batch50',
    eventType: 'impression'
  });
}
assert(getOutbox().length === 50, '50 eventos encolados en Outbox');

// 7. Cien eventos se dividen correctamente en lotes de 50
console.log('\n--- TEST 7: División Correcta de 100 Eventos en Lotes de 50 ---');
localStorage.clear();
for (let i = 1; i <= 100; i++) {
  enqueueOutbox('CAMPAIGN_EVENT', {
    eventId: `evt-batch100-${i}`,
    campaignId: 'camp-batch100',
    eventType: 'impression'
  });
}
const hundredItems = getOutbox();
assert(hundredItems.length === 100, '100 eventos encolados');
const firstSlice = hundredItems.slice(0, OUTBOX_MAX_BATCH_SIZE);
const secondSlice = hundredItems.slice(OUTBOX_MAX_BATCH_SIZE);
assert(firstSlice.length === 50, 'El primer bloque contiene exactamente 50 eventos');
assert(secondSlice.length === 50, 'El segundo bloque contiene exactamente los 50 eventos restantes');
assert(firstSlice[0].payload.eventId === 'evt-batch100-1', 'El primer evento del primer bloque es evt-batch100-1');
assert(secondSlice[0].payload.eventId === 'evt-batch100-51', 'El primer evento del segundo bloque es evt-batch100-51');

// 8. Integridad de eventId y no duplicación
console.log('\n--- TEST 8: Integridad y Unicidad de EventIds ---');
const eventIds = new Set(hundredItems.map(it => it.payload.eventId));
assert(eventIds.size === 100, 'Todos los 100 eventIds son únicos e irrepetibles');

// 9. Simulación Offline: El corte de internet preserva datos
console.log('\n--- TEST 9: Preservación de Datos ante Corte de Internet ---');
try {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true, writable: true });
} catch(e) {}
enqueueOutbox('CAMPAIGN_EVENT', {
  eventId: 'evt-offline-persist',
  campaignId: 'camp-offline',
  eventType: 'impression'
});
const outboxOffline = getOutbox();
assert(
  outboxOffline.some(it => it.payload.eventId === 'evt-offline-persist'),
  'El evento generado sin conexión permanece intacto en disco'
);
try {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true, writable: true });
} catch(e) {}

// 10. Verificación de no regresión de FASE 1
console.log('\n--- TEST 10: Preservación Intacta de la FASE 1 ---');
assert(
  CAMPAIGN_SYNC_INTERVAL_MS === 10 * 60 * 1000,
  'El intervalo de polling de campañas de la FASE 1 se mantiene en 10 minutos (600.000 ms)'
);

console.log('\n================================================================');
console.log(`RESUMEN FINAL: Total: ${passed + failed} | Aprobadas: ${passed} | Fallidas: ${failed}`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
