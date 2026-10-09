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

  // Intentar procesar en background si hay red
  if (isOnline()) {
    triggerFlush();
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
  if (isFlushing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const connected = await checkRealConnectivity();
  if (!connected) return;

  isFlushing = true;
  notifyOutboxChange(getOutbox().length);

  try {
    const items = getOutbox();
    if (items.length === 0) return;

    const remaining = [];

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

    // 1. Despachar Lote de Métricas de Campañas vía Endpoint Seguro de Terminal
    if (campaignEvents.length > 0) {
      try {
        const eventsPayload = campaignEvents.map(it => ({
          eventId: it.payload.eventId || it.id,
          campaignId: it.payload.campaignId,
          eventType: it.payload.eventType,
          timestamp: it.payload.timestamp || it.createdAt
        }));

        const result = await sendTerminalEvents(eventsPayload);

        if (result.success) {
          // Exitoso o procesado por el backend seguro
        } else if (result.retryable) {
          campaignEvents.forEach(it => {
            it.attempts += 1;
            it.lastAttempt = new Date().toISOString();
            if (it.attempts < MAX_RETRIES) {
              remaining.push(it);
            } else {
              pushToDeadLetter([it], result.status || 500, 'Excedido máximo de reintentos');
            }
          });
        } else {
          // Error permanente (4xx): mover a deadletter en vez de descartar silenciosamente
          pushToDeadLetter(campaignEvents, result.status || 400, result.error || 'Error permanente no reintentable');
        }
      } catch (err) {
        campaignEvents.forEach(it => {
          it.attempts += 1;
          it.lastAttempt = new Date().toISOString();
          if (it.attempts < MAX_RETRIES) {
            remaining.push(it);
          } else {
            pushToDeadLetter([it], 0, 'Excedido máximo de reintentos por error de red');
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
            configVersion: item.payload.configVersion || '1.0.0',
            status: item.payload.status || 'active',
            lastSeenAt: new Date().toISOString()
          });
        } else if (item.type === 'MERCHANT_REGISTER') {
          result = await sendTerminalRegister({
            storeName: item.payload.storeName || item.payload.name,
            address: item.payload.address,
            phone: item.payload.phone,
            installer: item.payload.installer,
            businessType: item.payload.businessType,
            provinceCode: item.payload.provinceCode,
            provinceName: item.payload.provinceName,
            cityCode: item.payload.cityCode,
            cityName: item.payload.cityName || item.payload.city,
            commerceId: item.payload.commerceId,
            appVersion: APP_VERSION
          });
        }

        if (!result.success) {
          if (result.retryable) {
            item.attempts += 1;
            item.lastAttempt = new Date().toISOString();
            if (item.attempts < MAX_RETRIES) {
              remaining.push(item);
            } else {
              pushToDeadLetter([item], result.status || 500, 'Excedido máximo de reintentos');
            }
          } else {
            pushToDeadLetter([item], result.status || 400, result.error || 'Error permanente no reintentable');
          }
        }
      } catch (err) {
        item.attempts += 1;
        item.lastAttempt = new Date().toISOString();
        if (item.attempts < MAX_RETRIES) {
          remaining.push(item);
        } else {
          pushToDeadLetter([item], 0, 'Excedido máximo de reintentos por excepción');
        }
      }
    }

    saveOutbox(remaining);
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
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

// Iniciar heartbeat periódico en segundo plano (cada 30 minutos)
if (typeof window !== 'undefined') {
  setTimeout(() => sendHeartbeat(), 5000); // Primer heartbeat 5s después del arranque
  setInterval(() => sendHeartbeat(), 30 * 60 * 1000);
}

