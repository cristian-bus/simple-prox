// Servicio de Configuración Remota (Remote Config) para Simple ProX
// Permite ajustar flags, intervalos y parámetros comerciales en caliente desde Cloud
// REGLA CRÍTICA: Solo maneja DATA no crítica. Jamás ejecuta código ni toca datos del POS.

import { getAdConfig } from './adSyncEngine.js';
import { isOnline, checkRealConnectivity } from './connectivityService.js';

const STORAGE_KEY = 'kioscoprox_remote_config_v2';
const DEFAULT_SUPABASE_URL = 'https://qtixbiikhvhzwshfgyeo.supabase.co';

export const DEFAULT_CONFIG = {
  version: '1.0.0',
  updatedAt: '2026-09-01T00:00:00Z',
  b2bEnabled: true,
  bannerEnabled: true,
  bannerInterval: 7, // segundos (rotación ágil y visible en caja)
  syncIntervalMinutes: 15,
  minimumSupportedVersion: '1.3.0',
  updateChannel: 'stable',
  whatsappTemplates: {
    order: 'Hola! Quiero hacer un pedido mayorista desde Simple ProX.',
    inquiry: 'Hola! Tengo una consulta sobre una oferta de Simple ProX.'
  }
};

let currentConfig = loadLocalConfig();
const listeners = new Set();

/**
 * Cargar configuración desde almacenamiento local con fallback estricto a DEFAULT_CONFIG
 */
function loadLocalConfig() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidConfig(parsed)) {
          // Si tiene el valor antiguo de 120s o excesivo (>30s), corregir a 7s
          if (parsed.bannerInterval && parsed.bannerInterval >= 30) {
            parsed.bannerInterval = 7;
          }
          return { ...DEFAULT_CONFIG, ...parsed };
        }
      }
    }
  } catch (e) {
    console.warn('[RemoteConfig] Error leyendo configuración local, usando default:', e);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Validador de esquema de configuración para rechazar payloads corruptos o maliciosos
 */
function isValidConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  // Validar tipos de los campos clave si están presentes
  if (cfg.b2bEnabled !== undefined && typeof cfg.b2bEnabled !== 'boolean') return false;
  if (cfg.bannerEnabled !== undefined && typeof cfg.bannerEnabled !== 'boolean') return false;
  if (cfg.bannerInterval !== undefined && (typeof cfg.bannerInterval !== 'number' || cfg.bannerInterval <= 0)) return false;
  if (cfg.syncIntervalMinutes !== undefined && (typeof cfg.syncIntervalMinutes !== 'number' || cfg.syncIntervalMinutes <= 0)) return false;
  return true;
}

/**
 * Notificar a los componentes React suscritos ante actualizaciones de configuración
 */
function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn(currentConfig);
    } catch (e) {}
  });
}

/**
 * Obtener la configuración actual (síncrona e instantánea para componentes React)
 */
export function getRemoteConfig() {
  return currentConfig;
}

/**
 * Suscribirse a cambios en la configuración en caliente
 */
export function subscribeRemoteConfig(listener) {
  listeners.add(listener);
  listener(currentConfig);
  return () => listeners.delete(listener);
}

let isFetchingConfig = false;

/**
 * Descarga en segundo plano la configuración remota desde la tabla `remote_config` de Supabase
 */
export async function fetchRemoteConfig() {
  if (isFetchingConfig) return currentConfig;
  const connected = await checkRealConnectivity();
  if (!connected) return currentConfig;

  isFetchingConfig = true;

  try {
    const adConfig = getAdConfig();
    const baseUrl = (adConfig.supabaseUrl || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
    const supabaseKey = adConfig.supabaseKey;

    if (!supabaseKey) return currentConfig;

    const endpoint = `${baseUrl}/rest/v1/remote_config?id=eq.global&select=*`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(endpoint, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Accept': 'application/json'
      },
      signal: controller.signal,
      cache: 'no-store'
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const remoteRow = data[0];
        const remotePayload = remoteRow.config || {};

        if (isValidConfig(remotePayload)) {
          const merged = {
            ...DEFAULT_CONFIG,
            ...remotePayload,
            version: remoteRow.version || remotePayload.version || '1.0.0',
            updatedAt: remoteRow.updated_at || new Date().toISOString()
          };

          // Si cambió la versión o algún parámetro, actualizar caché y notificar
          if (JSON.stringify(merged) !== JSON.stringify(currentConfig)) {
            currentConfig = merged;
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            }
            notifyListeners();
            console.log('[RemoteConfig] Configuración actualizada desde Cloud (v' + merged.version + ')');
          }
        } else {
          console.warn('[RemoteConfig] Payload recibido no superó las validaciones, conservando última configuración válida');
        }
      }
    }
  } catch (err) {
    console.warn('[RemoteConfig] No se pudo obtener configuración de Cloud, usando caché local:', err);
  } finally {
    isFetchingConfig = false;
  }

  return currentConfig;
}

// Iniciar chequeo no bloqueante en background al cargar el módulo
if (typeof window !== 'undefined') {
  setTimeout(() => {
    fetchRemoteConfig().catch(() => {});
  }, 1200);
}
