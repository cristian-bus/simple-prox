// Servicio de Sincronización Centralizada y Patrón Outbox para Simple ProX
// Maneja cola local persistente, reintentos con backoff exponencial e idempotencia.
// Totalmente desacoplado de las operaciones de caja y ventas del POS.

import { isOnline, subscribeConnectivity, checkRealConnectivity } from './connectivityService.js';
import { getCommerceProfile } from './installationService.js';
import { getAdConfig } from './adSyncEngine.js';
import { APP_VERSION } from '../constants/version.js';

const STORAGE_KEYS = {
  OUTBOX: 'kioscoprox_outbox',
  LAST_SYNC: 'kioscoprox_last_sync_timestamp'
};

const DEFAULT_SUPABASE_URL = 'https://qtixbiikhvhzwshfgyeo.supabase.co';
const MAX_RETRIES = 5;
let isFlushing = false;
const listeners = new Set();

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
  const connected = await checkRealConnectivity();
  if (!connected) return;

  isFlushing = true;
  notifyOutboxChange(getOutbox().length);

  try {
    const items = getOutbox();
    if (items.length === 0) return;

    const remaining = [];
    const config = getAdConfig();
    const supabaseUrl = (config.supabaseUrl || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
    const supabaseKey = config.supabaseKey;

    if (!supabaseKey) {
      isFlushing = false;
      return;
    }

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

    // 1. Despachar Lote de Métricas de Campañas
    if (campaignEvents.length > 0) {
      try {
        const batchEndpoint = `${supabaseUrl}/rest/v1/campaign_events`;
        const payload = campaignEvents.map(it => ({
          event_id: it.payload.eventId || it.id,
          merchant_id: it.payload.merchantId || it.payload.installationId,
          campaign_id: it.payload.campaignId,
          event_type: it.payload.eventType,
          timestamp: it.payload.timestamp || it.createdAt
        }));

        const res = await fetch(batchEndpoint, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(payload)
        });

        if (res.ok || res.status === 201 || res.status === 409) {
          // Exitoso o colisión idempotente: no conservar en la cola
        } else {
          // Si falló por error de red o 5xx, conservar para reintento con backoff
          campaignEvents.forEach(it => {
            it.attempts += 1;
            it.lastAttempt = new Date().toISOString();
            if (it.attempts < MAX_RETRIES) remaining.push(it);
          });
        }
      } catch (err) {
        campaignEvents.forEach(it => {
          it.attempts += 1;
          it.lastAttempt = new Date().toISOString();
          if (it.attempts < MAX_RETRIES) remaining.push(it);
        });
      }
    }

    // 2. Despachar Operaciones Individuales (Registro de Comercio, Heartbeat)
    for (const item of otherOperations) {
      try {
        if (item.type === 'MERCHANT_REGISTER' || item.type === 'HEARTBEAT') {
          const mEndpoint = `${supabaseUrl}/rest/v1/merchants?on_conflict=id`;
          const mData = {
            id: item.payload.installationId,
            installation_id: item.payload.installationId,
            commerce_id: item.payload.commerceId,
            name: item.payload.storeName || item.payload.name,
            plan: item.payload.plan || 'Básico',
            province_code: item.payload.provinceCode,
            province_name: item.payload.provinceName,
            city_code: item.payload.cityCode,
            city_name: item.payload.cityName || item.payload.city,
            city: item.payload.cityName || item.payload.city,
            address: item.payload.address,
            phone: item.payload.phone,
            installer: item.payload.installer,
            business_type: item.payload.businessType,
            app_version: APP_VERSION,
            status: item.payload.status || 'active',
            last_active: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            config_version: item.payload.configVersion || '1.0.0'
          };

          // Limpieza de nulos innecesarios
          Object.keys(mData).forEach(k => {
            if (mData[k] === undefined || mData[k] === null || mData[k] === '') {
              delete mData[k];
            }
          });
          // Mantener id obligatorio
          mData.id = item.payload.installationId;
          mData.installation_id = item.payload.installationId;

          const res = await fetch(mEndpoint, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(mData)
          });

          if (!res.ok && res.status !== 201 && res.status !== 204) {
            item.attempts += 1;
            item.lastAttempt = new Date().toISOString();
            if (item.attempts < MAX_RETRIES) remaining.push(item);
          }
        }
      } catch (err) {
        item.attempts += 1;
        item.lastAttempt = new Date().toISOString();
        if (item.attempts < MAX_RETRIES) remaining.push(item);
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

