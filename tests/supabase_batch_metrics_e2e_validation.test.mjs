import assert from 'node:assert';
import { 
  OUTBOX_FLUSH_INTERVAL_MS, 
  OUTBOX_BATCH_THRESHOLD, 
  OUTBOX_MAX_BATCH_SIZE,
  enqueueOutbox, 
  getOutbox, 
  flushOutbox,
  sendHeartbeat
} from '../src/services/syncService.js';
import { trackAdEvent } from '../src/services/adSyncEngine.js';
import { CAMPAIGN_SYNC_INTERVAL_MS } from '../src/hooks/useOfertas.js';

let testResults = [];

function recordTest(name, passed, details = '') {
  testResults.push({ name, passed, details });
  if (passed) {
    console.log(`  ✅ PASS: ${name}`);
  } else {
    console.error(`  ❌ FAIL: ${name} -> ${details}`);
  }
}

console.log('================================================================');
console.log('VALIDACIÓN END-TO-END FASE 2: ENVÍO DE ESTADÍSTICAS EN LOTES');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// INFRAESTRUCTURA DE MOCKS CONTROLADOS
// -----------------------------------------------------------------------------
class StorageMock {
  constructor() {
    this.store = new Map();
    this.throwOnSet = false;
  }
  getItem(key) {
    return this.store.get(key) || null;
  }
  setItem(key, value) {
    if (this.throwOnSet) {
      const err = new Error('QuotaExceededError: DOM Exception 22');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
    this.throwOnSet = false;
  }
}

const mockStorage = new StorageMock();
globalThis.localStorage = mockStorage;
globalThis.sessionStorage = new StorageMock();

// Mock navigator.onLine
let isNetworkOnline = true;
Object.defineProperty(globalThis, 'navigator', {
  value: {
    get onLine() {
      return isNetworkOnline;
    }
  },
  configurable: true
});

// Mock credenciales de terminal para que sendTerminalEvents no aborte por falta de token
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');

// Mock servidor HTTP
let serverRequests = [];
let mockServerHandler = async (url, options) => {
  return { ok: true, status: 200, json: async () => ({ success: true, processedCount: 1 }) };
};

globalThis.fetch = async (url, options = {}) => {
  const urlStr = String(url);
  // Responder automáticamente al ping liviano de checkRealConnectivity
  if (urlStr.includes('/rest/v1/') || urlStr.endsWith('/rest/v1')) {
    return { ok: true, status: 200, json: async () => ({}) };
  }
  serverRequests.push({ url: urlStr, options, body: options.body ? JSON.parse(options.body) : null });
  return mockServerHandler(urlStr, options);
};

// =============================================================================
// PRUEBA 1: Ejecutar realmente enqueueOutbox(), flushOutbox() con servidor HTTP simulado
// =============================================================================
console.log('--- TEST 1: Ejecución Real de enqueueOutbox() y flushOutbox() con HTTP 200 ---');
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');
serverRequests = [];

mockServerHandler = async (url) => {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, processedCount: 1, installationId: 'TEST-TERMINAL-001' })
  };
};

enqueueOutbox('CAMPAIGN_EVENT', {
  eventId: 'evt-test-1',
  campaignId: 'camp-100',
  eventType: 'impression',
  timestamp: new Date().toISOString()
});

assert.strictEqual(getOutbox().length, 1, 'Debe haber 1 evento en el outbox persistido');
await flushOutbox();

assert.strictEqual(serverRequests.length, 1, 'Debe haber emitido 1 petición HTTP');
assert.ok(serverRequests[0].url.includes('/events'), 'El endpoint llamado debe ser /events');
assert.strictEqual(getOutbox().length, 0, 'El outbox debe quedar vacío tras confirmación');
recordTest('P1. Ejecución real de enqueueOutbox() y flushOutbox() con HTTP 200', true);

// =============================================================================
// PRUEBA 2: Simular 40 eventos y verificar que se envían en una única petición
// =============================================================================
console.log('\n--- TEST 2: Lote de 40 Eventos en 1 Sola Petición HTTP ---');
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');
serverRequests = [];

mockServerHandler = async (url, options) => {
  const body = JSON.parse(options.body);
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, processedCount: body.events.length })
  };
};

for (let i = 1; i <= 40; i++) {
  enqueueOutbox('CAMPAIGN_EVENT', {
    eventId: `evt-batch40-${i}`,
    campaignId: 'camp-40',
    eventType: 'impression',
    timestamp: new Date().toISOString()
  });
}

assert.strictEqual(getOutbox().length, 40, 'Debe tener 40 eventos acumulados');
await flushOutbox();

assert.strictEqual(serverRequests.length, 1, 'Debe haber exactamente 1 petición HTTP para los 40 eventos');
assert.strictEqual(serverRequests[0].body.events.length, 40, 'El payload debe contener exactamente 40 eventos');
assert.strictEqual(getOutbox().length, 0, 'El outbox debe quedar en 0');
recordTest('P2. Cuarenta eventos se envían en una única petición', true);

// =============================================================================
// PRUEBA 3 y 4: Simular 50, 51 y 100 eventos y verificar preservación de eventId
// =============================================================================
console.log('\n--- TEST 3 & 4: Particionado de 50, 51 y 100 Eventos y Preservación de eventId ---');

// Caso 50
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');
serverRequests = [];

for (let i = 1; i <= 50; i++) {
  enqueueOutbox('CAMPAIGN_EVENT', {
    eventId: `evt-exact50-${i}`,
    campaignId: 'camp-50',
    eventType: 'impression'
  });
}
await flushOutbox();
assert.strictEqual(serverRequests.length, 1, '50 eventos deben enviarse en 1 sola petición');
assert.strictEqual(serverRequests[0].body.events.length, 50, 'El lote debe tener 50 ítems');
assert.strictEqual(getOutbox().length, 0, 'Outbox en 0');
recordTest('P3.a Lote exacto de 50 eventos en 1 petición', true);

// Caso 51
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');
serverRequests = [];

for (let i = 1; i <= 51; i++) {
  enqueueOutbox('CAMPAIGN_EVENT', {
    eventId: `evt-exact51-${i}`,
    campaignId: 'camp-51',
    eventType: 'impression'
  });
}

// Primer flush: envía 50
await flushOutbox();
assert.strictEqual(serverRequests.length, 1, 'El primer flush envía 1 lote');
assert.strictEqual(serverRequests[0].body.events.length, 50, 'El primer lote contiene 50 eventos');
assert.strictEqual(getOutbox().length, 1, 'Debe quedar 1 evento pendiente en disco');
assert.strictEqual(getOutbox()[0].payload.eventId, 'evt-exact51-51', 'El evento restante debe ser el 51');

// Segundo flush: envía el 51
await flushOutbox();
assert.strictEqual(serverRequests.length, 2, 'Total 2 peticiones para 51 eventos');
assert.strictEqual(serverRequests[1].body.events.length, 1, 'La segunda petición contiene 1 evento');
assert.strictEqual(getOutbox().length, 0, 'Outbox en 0');
recordTest('P3.b Particionado de 51 eventos en 2 peticiones (50 + 1) sin pérdidas', true);

// Caso 100
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');
serverRequests = [];

for (let i = 1; i <= 100; i++) {
  enqueueOutbox('CAMPAIGN_EVENT', {
    eventId: `evt-100-${i}`,
    campaignId: 'camp-100',
    eventType: 'impression'
  });
}

await flushOutbox();
assert.strictEqual(serverRequests.length, 1, 'Primer flush procesa 50');
assert.strictEqual(getOutbox().length, 50, 'Quedan 50 en disco');
await flushOutbox();
assert.strictEqual(serverRequests.length, 2, 'Segundo flush procesa los otros 50');
assert.strictEqual(getOutbox().length, 0, 'Outbox en 0 tras completar 100');

// Verificar conservación de todos los eventId
const allReceivedIds = [
  ...serverRequests[0].body.events.map(e => e.eventId),
  ...serverRequests[1].body.events.map(e => e.eventId)
];
assert.strictEqual(allReceivedIds.length, 100, 'Se recibieron 100 eventIds');
assert.strictEqual(new Set(allReceivedIds).size, 100, 'Los 100 eventIds son únicos');
assert.strictEqual(allReceivedIds[0], 'evt-100-1');
assert.strictEqual(allReceivedIds[99], 'evt-100-100');
recordTest('P4. Conservación de 100 eventIds originales en división exacta 50+50', true);

// =============================================================================
// PRUEBA 5: Simular respuesta HTTP 200
// =============================================================================
console.log('\n--- TEST 5: Respuesta HTTP 200 elimina eventos confirmados ---');
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');
enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-200-ok', campaignId: 'c1', eventType: 'impression' });

mockServerHandler = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, processedCount: 1 })
});
await flushOutbox();
assert.strictEqual(getOutbox().length, 0, 'Los eventos confirmados con 200 OK deben desaparecer del outbox');
recordTest('P5. HTTP 200 confirma y elimina eventos del Outbox', true);

// =============================================================================
// PRUEBA 6: Simular respuesta HTTP 500
// =============================================================================
console.log('\n--- TEST 6: Respuesta HTTP 500 conserva eventos y suma intentos ---');
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');
enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-500-fail', campaignId: 'c1', eventType: 'impression' });

mockServerHandler = async () => ({
  ok: false,
  status: 500,
  json: async () => ({ error: 'Internal Server Error' })
});

await flushOutbox();
const outbox500 = getOutbox();
assert.strictEqual(outbox500.length, 1, 'El evento fallido con 500 debe permanecer en el outbox');
assert.strictEqual(outbox500[0].attempts, 1, 'Debe haber incrementado attempts a 1');
assert.ok(outbox500[0].lastAttempt, 'Debe haber registrado lastAttempt timestamp');
recordTest('P6. HTTP 500 conserva evento en Outbox con reintento incrementado', true);

// =============================================================================
// PRUEBA 7: Simular timeout después de que el servidor guardó los eventos
// =============================================================================
console.log('\n--- TEST 7: Timeout tras guardado (Idempotencia y Reintento Seguro) ---');
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');
serverRequests = [];

enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-timeout-saved', campaignId: 'c1', eventType: 'impression' });

// Paso 1: Falla con AbortError / Timeout
mockServerHandler = async () => {
  throw new Error('The operation was aborted due to timeout');
};

await flushOutbox();
assert.strictEqual(getOutbox().length, 1, 'Permanece en outbox tras timeout');
assert.strictEqual(getOutbox()[0].attempts, 1, 'Attempts incrementado');

// Paso 2: En el reintento el servidor responde 200 (simulando ON CONFLICT DO NOTHING en BD)
mockServerHandler = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, processedCount: 1, note: 'ignored_duplicate' })
});

await flushOutbox();
assert.strictEqual(getOutbox().length, 0, 'Tras reintento exitoso, el evento se confirma y se elimina');
recordTest('P7. Timeout manejado con reintento seguro e idempotencia por eventId', true);

// =============================================================================
// PRUEBA 8: Simular pérdida de Internet
// =============================================================================
console.log('\n--- TEST 8: Pérdida de Internet no pierde datos ---');
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');
serverRequests = [];

isNetworkOnline = false;
enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-no-net', campaignId: 'c1', eventType: 'impression' });
await flushOutbox();

assert.strictEqual(serverRequests.length, 0, 'No debe intentar hacer fetch cuando navigator.onLine es false');
assert.strictEqual(getOutbox().length, 1, 'El evento sigue intacto en disco');
isNetworkOnline = true;
recordTest('P8. Pérdida de Internet previene llamadas y preserva eventos en disco', true);

// =============================================================================
// PRUEBA 9: Simular cierre y reapertura con eventos pendientes
// =============================================================================
console.log('\n--- TEST 9: Cierre y Reapertura del POS conserva eventos pendientes ---');
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');

// Simular eventos dejados en una sesión previa en disco
const previousSessionEvents = [
  { id: 'tx-old-1', type: 'CAMPAIGN_EVENT', payload: { eventId: 'evt-prev-1', campaignId: 'c1', eventType: 'impression' }, attempts: 0 },
  { id: 'tx-old-2', type: 'CAMPAIGN_EVENT', payload: { eventId: 'evt-prev-2', campaignId: 'c2', eventType: 'whatsapp_click' }, attempts: 0 }
];
mockStorage.setItem('kioscoprox_outbox', JSON.stringify(previousSessionEvents));

// "Reapertura": leer outbox
const recoveredOutbox = getOutbox();
assert.strictEqual(recoveredOutbox.length, 2, 'Los 2 eventos de la sesión previa se recuperan');
assert.strictEqual(recoveredOutbox[0].payload.eventId, 'evt-prev-1');

// El flush inicial los procesa
serverRequests = [];
mockServerHandler = async () => ({ ok: true, status: 200, json: async () => ({ success: true, processedCount: 2 }) });
await flushOutbox();
assert.strictEqual(getOutbox().length, 0, 'Los eventos pendientes de sesiones previas son transmitidos y limpiados');
recordTest('P9. Cierre y reapertura preserva y procesa eventos pendientes', true);

// =============================================================================
// PRUEBA 10: Evento que llega mientras flushOutbox() está esperando respuesta HTTP
// =============================================================================
console.log('\n--- TEST 10: Concurrencia durante vuelo HTTP (Análisis de Sobrescritura) ---');
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');

enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-in-flight-A', campaignId: 'cA', eventType: 'impression' });
assert.strictEqual(getOutbox().length, 1);

// Servidor con retardo simulado en el que se encola un nuevo evento B
let eventBEnqueued = false;
mockServerHandler = async () => {
  // Simular que en medio de la petición HTTP entra un nuevo evento B
  enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-mid-flight-B', campaignId: 'cB', eventType: 'impression' });
  eventBEnqueued = true;
  return { ok: true, status: 200, json: async () => ({ success: true, processedCount: 1 }) };
};

await flushOutbox();
const outboxAfterFlight = getOutbox();
const hasEventB = outboxAfterFlight.some(it => it.payload && it.payload.eventId === 'evt-mid-flight-B');

if (hasEventB) {
  recordTest('P10. Evento entrante durante HTTP in-flight se preserva', true);
} else {
  recordTest(
    'P10. Evento entrante durante HTTP in-flight se preserva', 
    false, 
    'HALLAZGO CRÍTICO: syncService.js sobrescribe localStorage con snapshot previo al terminar flushOutbox()'
  );
}

// =============================================================================
// PRUEBA 11: Fallo de localStorage.setItem() por cuota excedida
// =============================================================================
console.log('\n--- TEST 11: Manejo de QuotaExceededError en localStorage ---');
mockStorage.clear();
mockStorage.throwOnSet = true;

let threwError = false;
try {
  enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-quota-fail', campaignId: 'cQ', eventType: 'impression' });
} catch (e) {
  threwError = true;
}

assert.strictEqual(threwError, false, 'enqueueOutbox no debe propagar crash no controlado si localStorage falla');
mockStorage.throwOnSet = false;
recordTest('P11. QuotaExceededError capturado de forma segura sin provocar crash del POS', true);

// =============================================================================
// PRUEBA 12: Bloqueo de envíos concurrentes (isFlushing)
// =============================================================================
console.log('\n--- TEST 12: Prevención de Envíos Concurrentes (isFlushing) ---');
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');
serverRequests = [];

enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-concurrent-1', campaignId: 'c1', eventType: 'impression' });

let resolveSlowRequest;
const slowPromise = new Promise(resolve => { resolveSlowRequest = resolve; });

mockServerHandler = async () => {
  await slowPromise;
  return { ok: true, status: 200, json: async () => ({ success: true, processedCount: 1 }) };
};

// Disparar primer flush (queda en espera)
const flushPromise1 = flushOutbox();

// Disparar segundo flush concurrente mientras el primero sigue en vuelo
const flushPromise2 = flushOutbox();

// Liberar la petición lenta
resolveSlowRequest();
await Promise.all([flushPromise1, flushPromise2]);

if (serverRequests.length === 1) {
  recordTest('P12. isFlushing previene ejecuciones y peticiones HTTP concurrentes', true);
} else {
  recordTest(
    'P12. isFlushing previene ejecuciones y peticiones HTTP concurrentes',
    false,
    `HALLAZGO: se emitieron ${serverRequests.length} peticiones concurrentes porque isFlushing se asigna DESPUÉS de await checkRealConnectivity()`
  );
}

// =============================================================================
// PRUEBA 13: Eventos confirmados desaparecen y pendientes permanecen
// =============================================================================
console.log('\n--- TEST 13: Discriminación de Eventos Confirmados vs Pendientes ---');
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');

// Encolamos 60 eventos
for (let i = 1; i <= 60; i++) {
  enqueueOutbox('CAMPAIGN_EVENT', { eventId: `evt-conf-rem-${i}`, campaignId: 'c', eventType: 'impression' });
}

serverRequests = [];
mockServerHandler = async (url, opts) => {
  const b = JSON.parse(opts.body);
  return { ok: true, status: 200, json: async () => ({ success: true, processedCount: b.events.length }) };
};

// 1er flush: procesa los primeros 50
await flushOutbox();
const remainingAfterFirst = getOutbox();
assert.strictEqual(remainingAfterFirst.length, 10, 'Deben quedar exactamente 10 pendientes');
assert.strictEqual(remainingAfterFirst[0].payload.eventId, 'evt-conf-rem-51', 'El primer pendiente debe ser el 51');

// 2do flush: procesa los 10 restantes
await flushOutbox();
assert.strictEqual(getOutbox().length, 0, 'Outbox en 0');
recordTest('P13. Eventos confirmados se eliminan y excedentes permanecen en disco', true);

// =============================================================================
// PRUEBA 14: Heartbeat no causa pérdida de métricas
// =============================================================================
console.log('\n--- TEST 14: Heartbeat Concurrente no pierde métricas ---');
mockStorage.clear();
mockStorage.setItem('kioscoprox_terminal_cred_token', 'mock-test-jwt-token-123456');
mockStorage.setItem('kioscoprox_installation_id', 'TEST-TERMINAL-001');

enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-hb-metrics-1', campaignId: 'c1', eventType: 'impression' });
sendHeartbeat(); // encola HEARTBEAT

const itemsWithHb = getOutbox();
assert.ok(itemsWithHb.some(it => it.type === 'CAMPAIGN_EVENT'), 'Contiene evento de campaña');
assert.ok(itemsWithHb.some(it => it.type === 'HEARTBEAT'), 'Contiene heartbeat');

serverRequests = [];
mockServerHandler = async () => ({ ok: true, status: 200, json: async () => ({ success: true }) });
await flushOutbox();

assert.strictEqual(getOutbox().length, 0, 'Ambas operaciones procesadas limpiamente');
recordTest('P14. Heartbeat se procesa sin pérdida de eventos de métricas', true);

// =============================================================================
// PRUEBA 15: Confirmar que FASE 1 sigue funcionando
// =============================================================================
console.log('\n--- TEST 15: Verificación de Preservación de FASE 1 ---');
assert.strictEqual(CAMPAIGN_SYNC_INTERVAL_MS, 10 * 60 * 1000, 'CAMPAIGN_SYNC_INTERVAL_MS debe ser 600.000 ms');
assert.strictEqual(OUTBOX_FLUSH_INTERVAL_MS, 10 * 60 * 1000, 'OUTBOX_FLUSH_INTERVAL_MS debe ser 600.000 ms');
assert.strictEqual(OUTBOX_BATCH_THRESHOLD, 40, 'OUTBOX_BATCH_THRESHOLD debe ser 40');
recordTest('P15. Parámetros de FASE 1 y FASE 2 intactos y coincidentes en 10m', true);

console.log('\n================================================================');
const total = testResults.length;
const passedCount = testResults.filter(t => t.passed).length;
const failedCount = total - passedCount;
console.log(`RESUMEN DE PRUEBAS E2E: Total: ${total} | Aprobadas: ${passedCount} | Fallidas: ${failedCount}`);
console.log('================================================================');

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
