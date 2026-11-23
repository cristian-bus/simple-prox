import assert from 'node:assert';
import { 
  enqueueOutbox, 
  getOutbox, 
  flushOutbox,
  getDeadLetter,
  sendHeartbeat 
} from '../src/services/syncService.js';

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
console.log('TESTS EXHAUSTIVOS: CORRECCIONES QUIRÚRGICAS A Y B (FASE 2)');
console.log('================================================================\n');

// Mock localStorage
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) || null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};
globalThis.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};

try {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true, writable: true });
} catch(e) {}

let mockFetchHandler = async () => ({ ok: true, status: 200, json: async () => ({ success: true }) });
globalThis.fetch = async (url, opts) => {
  const urlStr = String(url);
  if (urlStr.includes('/rest/v1/') || urlStr.endsWith('/rest/v1')) {
    return { ok: true, status: 200, json: async () => ({}) };
  }
  return mockFetchHandler(urlStr, opts);
};

// 1. Evento agregado durante HTTP 200 exitoso
console.log('--- 1. Evento agregado durante HTTP 200 exitoso ---');
store.clear();
store.set('kioscoprox_terminal_cred_token', 'test-token');
store.set('kioscoprox_installation_id', 'TEST-TERM-01');

enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-initial-200', campaignId: 'c1', eventType: 'impression' });

mockFetchHandler = async () => {
  // Entra nuevo evento durante el vuelo HTTP
  enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-intercalated-200', campaignId: 'c2', eventType: 'impression' });
  return { ok: true, status: 200, json: async () => ({ success: true, processedCount: 1 }) };
};

await flushOutbox();
const outbox200 = getOutbox();
check('El evento inicial confirmado se eliminó', !outbox200.some(e => e.payload.eventId === 'evt-initial-200'));
check('El evento intercalado durante HTTP 200 se preservó intacto', outbox200.some(e => e.payload.eventId === 'evt-intercalated-200'));

// 2. Evento agregado durante HTTP 500 y Timeout
console.log('\n--- 2. Evento agregado durante HTTP 500 y Timeout ---');
store.clear();
store.set('kioscoprox_terminal_cred_token', 'test-token');
store.set('kioscoprox_installation_id', 'TEST-TERM-01');

enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-initial-500', campaignId: 'c1', eventType: 'impression' });

mockFetchHandler = async () => {
  enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-intercalated-500', campaignId: 'c2', eventType: 'impression' });
  return { ok: false, status: 500, json: async () => ({ error: 'Server Error' }) };
};

await flushOutbox();
const outbox500 = getOutbox();
const failedInitial = outbox500.find(e => e.payload.eventId === 'evt-initial-500');
const intercalated500 = outbox500.find(e => e.payload.eventId === 'evt-intercalated-500');

check('El evento fallido permanece con attempts = 1', failedInitial && failedInitial.attempts === 1);
check('El evento fallido conserva lastAttempt ISO timestamp', failedInitial && Boolean(failedInitial.lastAttempt));
check('El evento intercalado durante HTTP 500 permanece intacto con attempts = 0', intercalated500 && intercalated500.attempts === 0);

// Caso Timeout
store.clear();
store.set('kioscoprox_terminal_cred_token', 'test-token');
store.set('kioscoprox_installation_id', 'TEST-TERM-01');

enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-initial-timeout', campaignId: 'c1', eventType: 'impression' });
mockFetchHandler = async () => {
  enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-intercalated-timeout', campaignId: 'c2', eventType: 'impression' });
  throw new Error('Timeout connection aborted');
};

await flushOutbox();
const outboxTimeout = getOutbox();
check('Evento fallido por timeout permanece en disco con attempts = 1', outboxTimeout.some(e => e.payload.eventId === 'evt-initial-timeout' && e.attempts === 1));
check('Evento intercalado durante timeout permanece en disco con attempts = 0', outboxTimeout.some(e => e.payload.eventId === 'evt-intercalated-timeout' && e.attempts === 0));

// 3. Evento agregado durante el procesamiento de HEARTBEAT
console.log('\n--- 3. Evento agregado durante procesamiento de HEARTBEAT ---');
store.clear();
store.set('kioscoprox_terminal_cred_token', 'test-token');
store.set('kioscoprox_installation_id', 'TEST-TERM-01');

sendHeartbeat(); // encola HEARTBEAT
mockFetchHandler = async (url) => {
  if (url.includes('/heartbeat')) {
    // Durante el heartbeat entra una impresión
    enqueueOutbox('CAMPAIGN_EVENT', { eventId: 'evt-during-hb', campaignId: 'cHb', eventType: 'impression' });
  }
  return { ok: true, status: 200, json: async () => ({ success: true }) };
};

await flushOutbox();
const outboxHb = getOutbox();
check('El Heartbeat confirmado se eliminó', !outboxHb.some(e => e.type === 'HEARTBEAT'));
check('El evento de impresión agregado durante el heartbeat se preservó', outboxHb.some(e => e.payload.eventId === 'evt-during-hb'));

// 4. Dead Letter Queue comportamiento intacto
console.log('\n--- 4. Comportamiento intacto de Dead Letter Queue ---');
store.clear();
store.set('kioscoprox_terminal_cred_token', 'test-token');
store.set('kioscoprox_installation_id', 'TEST-TERM-01');

// Encolamos un evento que ya tiene 4 intentos
const itemNearDead = {
  id: 'tx-dead-test',
  type: 'CAMPAIGN_EVENT',
  payload: { eventId: 'evt-dead-4', campaignId: 'cD', eventType: 'impression' },
  attempts: 4,
  lastAttempt: null,
  createdAt: new Date().toISOString()
};
store.set('kioscoprox_outbox', JSON.stringify([itemNearDead]));

mockFetchHandler = async () => ({ ok: false, status: 500, json: async () => ({ error: 'Fail' }) });
await flushOutbox();

const finalOutbox = getOutbox();
const deadletter = getDeadLetter();
check('El evento que superó 5 intentos fue removido del outbox', !finalOutbox.some(e => e.id === 'tx-dead-test'));
check('El evento fue archivado exitosamente en Dead Letter', deadletter.some(e => e.id === 'tx-dead-test' && e.attempts >= 5));

console.log('\n================================================================');
console.log(`RESUMEN: Total: ${passed + failed} | Aprobadas: ${passed} | Fallidas: ${failed}`);
console.log('================================================================');

if (failed > 0) process.exit(1);
else process.exit(0);
