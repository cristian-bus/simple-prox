// tests/fase4b73_boundary_runner.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.7.3
// VERIFICACIÓN FOCALIZADA DE FRONTERA TEMPORAL, FORMATO ISO 8601 Y PROTOCOLO OUTBOX

const evidence = {
  timestamp: new Date().toISOString(),
  totalChecks: 7,
  passedChecks: 0,
  checks: []
};

function record(stepNum, name, passed, details = {}) {
  const item = { step: stepNum, name, passed, details };
  evidence.checks.push(item);
  if (passed) {
    evidence.passedChecks++;
    console.log(`[PASS] Verificación ${stepNum}: ${name}`);
  } else {
    console.error(`[FAIL] Verificación ${stepNum}: ${name}`);
    console.error('  Detalles del fallo:', JSON.stringify(details, null, 2));
  }
  return passed;
}

// Emulación fiel del bloque de validación de terminal-sync
function processTerminalSync(rawEvents, termId, existingCampaignIds, nowMs = Date.now()) {
  const validTypes = new Set(["impression", "offer_open", "whatsapp_click"]);
  let sanitizedEvents = [];
  let ackCount = 0;

  const MAX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días exactos
  const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 minutos de tolerancia
  const ISO_8601_TZ_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

  for (const ev of rawEvents.slice(0, 50)) {
    const eventType = String(ev.eventType || ev.event_type || "");
    if (!validTypes.has(eventType)) continue;

    const rawEventId = ev.eventId || ev.event_id;
    if (typeof rawEventId !== "string" || rawEventId.trim().length === 0) continue;
    const eventId = rawEventId.trim();

    // 2. Validación estricta de timestamp (sintáctica y semántica ISO 8601 con zona horaria explícita)
    if (!ev.timestamp || typeof ev.timestamp !== "string" || !ISO_8601_TZ_REGEX.test(ev.timestamp)) {
      continue;
    }
    const dateParts = ev.timestamp.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!dateParts) continue;
    const pYear = parseInt(dateParts[1], 10);
    const pMonth = parseInt(dateParts[2], 10);
    const pDay = parseInt(dateParts[3], 10);
    if (pMonth < 1 || pMonth > 12 || pDay < 1 || pDay > 31) continue;
    const maxDaysInMonth = new Date(Date.UTC(pYear, pMonth, 0)).getUTCDate();
    if (pDay > maxDaysInMonth) continue; // Rechazo semántico de fechas imposibles (ej. 31 de feb)

    const eventTime = new Date(ev.timestamp).getTime();
    if (isNaN(eventTime)) continue;

    // 3. Regla contra fechas futuras manipuladas
    if (eventTime > nowMs + MAX_FUTURE_SKEW_MS) continue;

    // 4. Regla de retención con frontera estricta
    if (eventTime <= nowMs - MAX_RETENTION_MS) {
      ackCount++; // Descarte seguro: se reconoce para liberar Outbox sin insertar
      continue;
    }

    const rawCampaignId = ev.campaignId || ev.campaign_id;
    const campaignId = (typeof rawCampaignId === "string" && rawCampaignId.trim().length > 0)
      ? rawCampaignId.trim()
      : null;

    sanitizedEvents.push({
      event_id: eventId,
      merchant_id: termId,
      campaign_id: campaignId,
      event_type: eventType,
      timestamp: new Date(eventTime).toISOString(),
      synced_at: new Date(nowMs).toISOString()
    });
    ackCount++;
  }

  const existingSet = new Set(existingCampaignIds);
  sanitizedEvents = sanitizedEvents.filter(e => {
    if (e.campaign_id) return existingSet.has(e.campaign_id);
    return true;
  });

  return { eventsToInsert: sanitizedEvents, ackCount };
}

console.log('========================================================================');
console.log('=== FASE 4B.7.3: PRUEBAS DE FRONTERA TEMPORAL Y FORMATO ISO 8601    ===');
console.log('========================================================================\n');

const validCampId = '00000000-0000-0000-0000-000000000001';
const termId = 'term-test-01';
const nowFixed = 1762819200000; // 2025-11-10T22:00:00.000Z fijo para determinismo milimétrico
const LIMIT_MS = 30 * 24 * 60 * 60 * 1000; // 2.592.000.000 ms

// -----------------------------------------------------------------------------
// 1. Evento 1 ms ANTES de expirar (dentro de los 30 días)
// -----------------------------------------------------------------------------
const evInside1ms = {
  eventId: 'evt-inside-1ms',
  campaignId: validCampId,
  eventType: 'impression',
  timestamp: new Date(nowFixed - LIMIT_MS + 1).toISOString() // 29d 23h 59m 59s 999ms
};
const res1 = processTerminalSync([evInside1ms], termId, [validCampId], nowFixed);
record(1, 'Evento recibido 1 milisegundo antes del límite de 30 días es aceptado e insertado',
  res1.eventsToInsert.length === 1 && res1.ackCount === 1,
  { evInside1ms, res1 }
);

// -----------------------------------------------------------------------------
// 2. Evento EXACTAMENTE en el límite de 30 días (0 ms)
// -----------------------------------------------------------------------------
const evExactLimit = {
  eventId: 'evt-exact-limit',
  campaignId: validCampId,
  eventType: 'impression',
  timestamp: new Date(nowFixed - LIMIT_MS).toISOString() // exactamente 30d 00h 00m 00s 000ms
};
const res2 = processTerminalSync([evExactLimit], termId, [validCampId], nowFixed);
record(2, 'Evento recibido exactamente en el límite de 30 días se descarta con ack (no se inserta)',
  res2.eventsToInsert.length === 0 && res2.ackCount === 1,
  { evExactLimit, res2 }
);

// -----------------------------------------------------------------------------
// 3. Evento 1 ms DESPUÉS de expirar (30 días y 1 milisegundo)
// -----------------------------------------------------------------------------
const evOutside1ms = {
  eventId: 'evt-outside-1ms',
  campaignId: validCampId,
  eventType: 'impression',
  timestamp: new Date(nowFixed - LIMIT_MS - 1).toISOString() // 30d 00h 00m 00s 001ms
};
const res3 = processTerminalSync([evOutside1ms], termId, [validCampId], nowFixed);
record(3, 'Evento recibido 1 milisegundo después del límite se descarta con ack (no se inserta)',
  res3.eventsToInsert.length === 0 && res3.ackCount === 1,
  { evOutside1ms, res3 }
);

// -----------------------------------------------------------------------------
// 4. Validación estricta de formato ISO 8601 con zona horaria explícita
// -----------------------------------------------------------------------------
const invalidDates = [
  '2026-11-10', // solo fecha
  '2026-11-10T15:30:00', // sin zona horaria
  '2026-11-10 15:30:00', // formato SQL sin T ni zona
  'fecha-falsa',
  '1762819200000', // timestamp numérico en string
  '2026-13-45T99:99:99Z', // mes/día numéricamente fuera de rango
  '2026-02-31T12:00:00Z', // semánticamente imposible (febrero nunca tiene 31 días)
  '2025-02-29T12:00:00Z', // semánticamente imposible (2025 no es año bisiesto)
  '2026-04-31T12:00:00Z'  // semánticamente imposible (abril solo tiene 30 días)
];
let allRejected = true;
for (const badDate of invalidDates) {
  const evBad = { eventId: 'evt-bad', campaignId: validCampId, eventType: 'impression', timestamp: badDate };
  const resBad = processTerminalSync([evBad], termId, [validCampId], nowFixed);
  if (resBad.eventsToInsert.length > 0 || resBad.ackCount > 0) {
    allRejected = false;
  }
}
record(4, 'Rechazo estricto de formatos de fecha sin zona horaria explícita o malformados',
  allRejected,
  { testedInvalidCount: invalidDates.length }
);

// -----------------------------------------------------------------------------
// 5. Soporte legítimo de formatos con offset de zona horaria (+HH:MM y -HH:MM)
// -----------------------------------------------------------------------------
const validOffsets = [
  '2026-11-10T19:00:00-03:00', // Huso oficial de Argentina
  '2026-11-10T22:00:00Z',      // UTC canónico
  '2026-11-10T17:00:00-05:00'  // Otro huso válido
];
let allOffsetAccepted = true;
for (const goodDate of validOffsets) {
  const evGood = { eventId: 'evt-good-' + Math.random(), campaignId: validCampId, eventType: 'impression', timestamp: goodDate };
  const resGood = processTerminalSync([evGood], termId, [validCampId], new Date('2026-11-10T22:01:00Z').getTime());
  if (resGood.eventsToInsert.length !== 1) {
    allOffsetAccepted = false;
  }
}
record(5, 'Aceptación correcta de formatos ISO 8601 con zona horaria Z y offset numérico (-03:00)',
  allOffsetAccepted,
  { testedOffsetCount: validOffsets.length }
);

// -----------------------------------------------------------------------------
// 6. Tolerancia estricta de deriva de reloj hacia el futuro (5 minutos)
// -----------------------------------------------------------------------------
const evFuture4Min = {
  eventId: 'evt-fut-4m',
  campaignId: validCampId,
  eventType: 'impression',
  timestamp: new Date(nowFixed + 4 * 60 * 1000).toISOString() // +4 min (tolerado)
};
const evFuture6Min = {
  eventId: 'evt-fut-6m',
  campaignId: validCampId,
  eventType: 'impression',
  timestamp: new Date(nowFixed + 6 * 60 * 1000).toISOString() // +6 min (rechazado)
};
const resFut4 = processTerminalSync([evFuture4Min], termId, [validCampId], nowFixed);
const resFut6 = processTerminalSync([evFuture6Min], termId, [validCampId], nowFixed);
record(6, 'Tolerancia de deriva de reloj: acepta <= 5 minutos futuros y rechaza > 5 minutos futuros',
  resFut4.eventsToInsert.length === 1 && resFut6.eventsToInsert.length === 0,
  { fut4Inserted: resFut4.eventsToInsert.length, fut6Inserted: resFut6.eventsToInsert.length }
);

// -----------------------------------------------------------------------------
// 7. Simulación de liberación de Outbox del POS
// -----------------------------------------------------------------------------
const mockOutbox = [
  { id: 'tx-1', payload: { eventId: 'ev-1', campaignId: validCampId, eventType: 'impression', timestamp: new Date(nowFixed - 10000).toISOString() } },
  { id: 'tx-2', payload: { eventId: 'ev-2', campaignId: validCampId, eventType: 'impression', timestamp: new Date(nowFixed - LIMIT_MS - 5000).toISOString() } }
];
const syncResult = processTerminalSync(mockOutbox.map(x => x.payload), termId, [validCampId], nowFixed);
const posConfirmed = syncResult.ackCount === mockOutbox.length;
record(7, 'Compatibilidad con Outbox: el lote mixto devuelve ack total liberando la cola del POS',
  posConfirmed && syncResult.eventsToInsert.length === 1,
  { outboxCount: mockOutbox.length, ackCount: syncResult.ackCount, insertedInDb: syncResult.eventsToInsert.length }
);

console.log('\n========================================================================');
console.log(`=== RESUMEN FINAL: ${evidence.passedChecks}/${evidence.totalChecks} VERIFICACIONES SUPERADAS ===`);
console.log('========================================================================\n');

if (evidence.passedChecks === evidence.totalChecks) {
  console.log('STATUS: PASS — Todas las verificaciones de frontera temporal pasaron exitosamente.');
  process.exit(0);
} else {
  console.error('STATUS: FAIL — Se detectaron inconsistencias.');
  process.exit(1);
}

