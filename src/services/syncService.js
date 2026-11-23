// Servicio de Sincronización Centralizada y Patrón Outbox para Simple ProX
// Maneja cola local persistente, reintentos con backoff exponencial e idempotencia.
// Totalmente desacoplado de las operaciones de caja y ventas del POS.

import { isOnline, subscribeConnectivity, checkRealConnectivity } from './connectivityService.js';
import { getCommerceProfile } from './installationService.js';
import { getAdConfig } from './adSyncEngine.js';
import { APP_VERSION } from '../constants/version.js';
import { sendTerminalEvents, sendTerminalHeartbeat, sendTerminalRegister } from './terminalIdentityService.js';

const STORAGE_KEYS = {
  OUTBOX: 'kioscoprox_outbox',
  DEADLETTER: 'kioscoprox_outbox_deadletter',
  LAST_SYNC: 'kioscoprox_last_sync_timestamp'
};

const DEFAULT_SUPABASE_URL = 'https://qtixbiikhvhzwshfgyeo.supabase.co';
const MAX_RETRIES = 5;
export const OUTBOX_FLUSH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos (600.000 ms) entre envíos periódicos en lotes
export const OUTBOX_BATCH_THRESHOLD = 40; // Umbral de eventos acumulados para despacho anticipado
export const OUTBOX_MAX_BATCH_SIZE = 50;  // Límite máximo de eventos por lote según endpoint del servidor
let isFlushing = false;
const listeners = new Set();

/**
 * Obtener las operaciones archivadas en Dead Letter por fallas permanentes (no reintentables)
 */
export function getDeadLetter() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEADLETTER);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[SyncService] Error leyendo deadletter:', e);
    return [];
  }
}

/**
 * Mover ítems fallidos no reintentables o que agotaron reintentos a la cola Dead Letter
 * Evita la pérdida silenciosa de métricas y datos, sin almacenar secretos.
 */
function pushToDeadLetter(items, status, errorMsg) {
  if (!items || items.length === 0) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEADLETTER);
    const deadletter = raw ? JSON.parse(raw) : [];
    const nowIso = new Date().toISOString();

    items.forEach(it => {
      deadletter.push({
        id: it.id,
        type: it.type,
        payload: it.payload,
        attempts: (it.attempts || 0) + 1,
        lastAttempt: nowIso,
        createdAt: it.createdAt || nowIso,
        status: status || 400,
        error: errorMsg || 'Error no reintentable',
        deadLetterAt: nowIso
      });
    });

    // Limitar tamaño de deadletter para preservar almacenamiento local (máx 200 ítems)
    const trimmed = deadletter.slice(-200);
    localStorage.setItem(STORAGE_KEYS.DEADLETTER, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[SyncService] Error guardando en deadletter:', e);
  }
}

/**
 * Recuperar selectivamente eventos de telemetría de la cola Dead Letter
 * que fueron archivados por falta de credencial de terminal o agotamiento de reintentos transitorio.
 * Cumple estrictamente con no duplicar por eventId, preservar timestamps y no tocar ventas/caja.
 */
export function replayDeadLetterEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEADLETTER);
    if (!raw) return 0;
    const deadletter = JSON.parse(raw);
    if (!Array.isArray(deadletter) || deadletter.length === 0) return 0;

    const validEventTypes = new Set(['impression', 'offer_open', 'whatsapp_click']);
    const recoverable = [];
    const remainingDeadletter = [];

    for (const item of deadletter) {
      const isCampaignEvent = item.type === 'CAMPAIGN_EVENT' && item.payload && item.payload.eventId;
      const hasValidType = isCampaignEvent && validEventTypes.has(item.payload.eventType);

      const isRecoverableCause = item.status === 0 || item.status >= 500 || 
        item.error === 'Sin credencial de terminal' || 
        item.error === 'Excedido máximo de reintentos' ||
        item.error === 'Excedido máximo de reintentos por error de red';

      if (isCampaignEvent && hasValidType && isRecoverableCause) {
        recoverable.push({
          id: item.id || ('tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8)),
          type: item.type,
          payload: {
            eventId: item.payload.eventId,
            campaignId: item.payload.campaignId,
            eventType: item.payload.eventType,
            timestamp: item.payload.timestamp || item.createdAt
          },
          attempts: 0,
          lastAttempt: null,
          createdAt: item.createdAt || new Date().toISOString()
        });
      } else {
        remainingDeadletter.push(item);
      }
    }

    if (recoverable.length > 0) {
      const currentOutbox = getOutbox();
      const existingEventIds = new Set(
        currentOutbox
          .filter(it => it.type === 'CAMPAIGN_EVENT' && it.payload?.eventId)
          .map(it => it.payload.eventId)
      );

      let replayedCount = 0;
      for (const rec of recoverable) {
        if (!existingEventIds.has(rec.payload.eventId)) {
          currentOutbox.push(rec);
          existingEventIds.add(rec.payload.eventId);
          replayedCount++;
        }
      }

      saveOutbox(currentOutbox);
      localStorage.setItem(STORAGE_KEYS.DEADLETTER, JSON.stringify(remainingDeadletter));

      if (isOnline()) {
        triggerFlush();
      }

      return replayedCount;
    }
  } catch (e) {
    console.warn('[SyncService] Error en replayDeadLetterEvents:', e);
  }
  return 0;
}

/**
 * Obtener las operaciones pendientes en el Outbox
 */
export function getOutbox() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OUTBOX);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[SyncService] Error leyendo outbox:', e);
    return [];
  }
}

/**
 * Guardar operaciones en el Outbox
 */
function saveOutbox(items) {
  try {
    localStorage.setItem(STORAGE_KEYS.OUTBOX, JSON.stringify(items));
    notifyOutboxChange(items.length);
  } catch (e) {
    console.error('[SyncService] Error guardando outbox:', e);
  }
}

/**
 * Encolar una nueva operación en el Outbox
 */
export function enqueueOutbox(type, payload) {
  const items = getOutbox();
  const newItem = {
    id: 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
    type, // 'MERCHANT_REGISTER' | 'CAMPAIGN_EVENT' | 'HEARTBEAT'
    payload,
    attempts: 0,
    lastAttempt: null,
    createdAt: new Date().toISOString()
  };

  items.push(newItem);
  saveOutbox(items);

  // Evaluar despacho en background:
  // Operaciones especiales/críticas (no métricas) o cuando los eventos acumulados alcanzan el umbral de 40
  const isSpecialOperation = type !== 'CAMPAIGN_EVENT';
  const pendingCampaignEvents = items.filter(it => it.type === 'CAMPAIGN_EVENT').length;
  const reachedThreshold = pendingCampaignEvents >= OUTBOX_BATCH_THRESHOLD;

  if (isOnline() && (isSpecialOperation || reachedThreshold)) {
    triggerFlush(400);
  }

  return newItem.id;
}

/**
 * Suscribirse a cambios en el estado del outbox
 */
export function subscribeSyncState(listener) {
  listeners.add(listener);
  listener({ pendingCount: getOutbox().length, isFlushing });
  return () => listeners.delete(listener);
}

function notifyOutboxChange(pendingCount) {
  listeners.forEach(fn => {
    try {
      fn({ pendingCount, isFlushing });
    } catch (e) {}
  });
}

/**
 * Procesar la cola del Outbox de forma segura y secuencial
 */
export async function flushOutbox() {
  if (import.meta.env?.DEV && typeof window !== 'undefined' && sessionStorage.getItem('kioscoprox_demo_active') === 'true') {
    return;
  }
  if (isFlushing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  // CORRECCIÓN B: Adquirir isFlushing de forma síncrona antes de cualquier await
  isFlushing = true;
  notifyOutboxChange(getOutbox().length);

  try {
    const connected = await checkRealConnectivity();
    if (!connected) return;

    const items = getOutbox();
    if (items.length === 0) return;

    // Estructuras de reconciliación para evitar pérdida de eventos agregados en paralelo
    const confirmedIds = new Set();
    const deadLetterIds = new Set();
    const updatedItemsMap = new Map();

    // Agrupar eventos de métricas para enviarlos en un único lote eficiente
    const campaignEvents = [];
    const otherOperations = [];

    for (const item of items) {
      if (item.type === 'CAMPAIGN_EVENT') {
        campaignEvents.push(item);
      } else {
        otherOperations.push(item);
      }
    }

    // 1. Despachar Lote de Métricas de Campañas vía Endpoint Seguro de Terminal (Límite 50 por lote)
    let hasMoreEventsToFlush = false;
    if (campaignEvents.length > 0) {
      const currentBatch = campaignEvents.slice(0, OUTBOX_MAX_BATCH_SIZE);
      const unhandledCampaignEvents = campaignEvents.slice(OUTBOX_MAX_BATCH_SIZE);
      if (unhandledCampaignEvents.length > 0) {
        hasMoreEventsToFlush = true;
      }

      try {
        const eventsPayload = currentBatch.map(it => ({
          eventId: it.payload.eventId || it.id,
          campaignId: it.payload.campaignId,
          eventType: it.payload.eventType,
          timestamp: it.payload.timestamp || it.createdAt
        }));

        const result = await sendTerminalEvents(eventsPayload);

        if (result.success) {
          // Lote exitoso: marcar como confirmados
          currentBatch.forEach(it => confirmedIds.add(it.id));
        } else if (result.retryable) {
          currentBatch.forEach(it => {
            const updated = {
              ...it,
              attempts: (it.attempts || 0) + 1,
              lastAttempt: new Date().toISOString()
            };
            if (updated.attempts < MAX_RETRIES) {
              updatedItemsMap.set(it.id, updated);
            } else {
              deadLetterIds.add(it.id);
              pushToDeadLetter([updated], result.status || 500, 'Excedido máximo de reintentos');
            }
          });
        } else {
          // Error permanente (4xx): mover a deadletter
          currentBatch.forEach(it => deadLetterIds.add(it.id));
          pushToDeadLetter(currentBatch, result.status || 400, result.error || 'Error permanente no reintentable');
        }
      } catch (err) {
        currentBatch.forEach(it => {
          const updated = {
            ...it,
            attempts: (it.attempts || 0) + 1,
            lastAttempt: new Date().toISOString()
          };
          if (updated.attempts < MAX_RETRIES) {
            updatedItemsMap.set(it.id, updated);
          } else {
            deadLetterIds.add(it.id);
            pushToDeadLetter([updated], 0, 'Excedido máximo de reintentos por error de red');
          }
        });
      }
    }

    // 2. Despachar Operaciones Individuales vía Endpoint Seguro de Terminal (Heartbeat, Registro)
    for (const item of otherOperations) {
      try {
        let result = { success: false, retryable: true };

        if (item.type === 'HEARTBEAT') {
          result = await sendTerminalHeartbeat({
            appVersion: APP_VERSION,
            configVersion: item.payload?.configVersion || '1.0.0',
            status: item.payload?.status || 'active',
            lastSeenAt: new Date().toISOString()
          });
        } else if (item.type === 'MERCHANT_REGISTER') {
          result = await sendTerminalRegister({
            storeName: item.payload?.storeName || item.payload?.name,
            address: item.payload?.address,
            phone: item.payload?.phone,
            installer: item.payload?.installer,
            businessType: item.payload?.businessType,
            provinceCode: item.payload?.provinceCode,
            provinceName: item.payload?.provinceName,
            cityCode: item.payload?.cityCode,
            cityName: item.payload?.cityName || item.payload?.city,
            commerceId: item.payload?.commerceId,
            appVersion: APP_VERSION
          });
        }

        if (result.success) {
          confirmedIds.add(item.id);
        } else if (result.retryable) {
          const updated = {
            ...item,
            attempts: (item.attempts || 0) + 1,
            lastAttempt: new Date().toISOString()
          };
          if (updated.attempts < MAX_RETRIES) {
            updatedItemsMap.set(item.id, updated);
          } else {
            deadLetterIds.add(item.id);
            pushToDeadLetter([updated], result.status || 500, 'Excedido máximo de reintentos');
          }
        } else {
          deadLetterIds.add(item.id);
          pushToDeadLetter([item], result.status || 400, result.error || 'Error permanente no reintentable');
        }
      } catch (err) {
        const updated = {
          ...item,
          attempts: (item.attempts || 0) + 1,
          lastAttempt: new Date().toISOString()
        };
        if (updated.attempts < MAX_RETRIES) {
          updatedItemsMap.set(item.id, updated);
        } else {
          deadLetterIds.add(item.id);
          pushToDeadLetter([updated], 0, 'Excedido máximo de reintentos por excepción');
        }
      }
    }

    // CORRECCIÓN A: Reconciliación atómica contra el estado actual de disco para no perder eventos incorporados durante awaits
    const freshDiskItems = getOutbox();
    const reconciledRemaining = [];

    for (const diskItem of freshDiskItems) {
      if (confirmedIds.has(diskItem.id)) {
        // Evento confirmado exitosamente: se elimina
        continue;
      }
      if (deadLetterIds.has(diskItem.id)) {
        // Evento archivado en Dead Letter: se elimina del outbox
        continue;
      }
      if (updatedItemsMap.has(diskItem.id)) {
        // Evento fallido con reintento pendiente: conservar versión con intentos actualizados
        reconciledRemaining.push(updatedItemsMap.get(diskItem.id));
        continue;
      }
      // Evento nuevo agregado durante la espera de red o excedente no procesado: conservar intacto
      reconciledRemaining.push(diskItem);
    }

    saveOutbox(reconciledRemaining);
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

    // Si había más de 50 eventos y quedaron pendientes de despacho, programar siguiente lote
    if (hasMoreEventsToFlush && reconciledRemaining.some(it => it.type === 'CAMPAIGN_EVENT')) {
      triggerFlush(500);
    }
  } finally {
    isFlushing = false;
    notifyOutboxChange(getOutbox().length);
  }
}

// Disparador de vaciado con debounce
let flushTimeout = null;
export function triggerFlush(delay = 400) {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(() => {
    flushOutbox().catch(e => console.warn('[SyncService] Error en flush:', e));
  }, delay);
}

// Reaccionar automáticamente a la recuperación de conexión
subscribeConnectivity(status => {
  if (status === 'ONLINE') {
    triggerFlush(800);
  }
});

/**
 * Emitir un Heartbeat técnico liviano para monitoreo y telemetría de instalación
 */
export function sendHeartbeat() {
  if (import.meta.env?.DEV && typeof window !== 'undefined' && sessionStorage.getItem('kioscoprox_demo_active') === 'true') {
    return;
  }
  try {
    const profile = getCommerceProfile();
    if (!profile.installationId) return;

    enqueueOutbox('HEARTBEAT', {
      installationId: profile.installationId,
      commerceId: profile.commerceId,
      appVersion: APP_VERSION,
      lastSeenAt: new Date().toISOString(),
      configVersion: profile.configVersion || '1.0.0',
      status: profile.status || 'active'
    });
  } catch (e) {
    console.warn('[SyncService] Error al programar heartbeat:', e);
  }
}

// Iniciar heartbeat periódico y despacho periódico de métricas en segundo plano
if (typeof window !== 'undefined') {
  setTimeout(() => sendHeartbeat(), 5000); // Primer heartbeat 5s después del arranque
  setInterval(() => sendHeartbeat(), 30 * 60 * 1000);

  // Procesamiento diferido de eventos pendientes al inicio de la aplicación
  setTimeout(() => {
    if (isOnline()) {
      flushOutbox().catch(e => console.warn('[SyncService] Error en flush inicial diferido:', e));
    }
  }, 6000);

  // Despacho periódico en lotes del Outbox cada 10 minutos (600.000 ms)
  setInterval(() => {
    if (isOnline()) {
      flushOutbox().catch(e => console.warn('[SyncService] Error en flush periódico de Outbox:', e));
    }
  }, OUTBOX_FLUSH_INTERVAL_MS);
}

