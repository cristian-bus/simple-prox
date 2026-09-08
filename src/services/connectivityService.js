// Servicio de Conectividad Real para Simple ProX
// Realiza verificación activa con timeout estricto para evitar falsos positivos de navigator.onLine

import { getAdConfig } from './adSyncEngine.js';

export const CONNECTIVITY_STATUS = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  CHECKING: 'CHECKING'
};

let currentStatus = navigator.onLine ? CONNECTIVITY_STATUS.CHECKING : CONNECTIVITY_STATUS.OFFLINE;
let isChecking = false;
let lastCheckTime = 0;
const CHECK_CACHE_MS = 15000; // Cachear resultado durante 15 segundos para no saturar
const listeners = new Set();

/**
 * Notifica a todos los suscriptores cuando cambia el estado
 */
function notifyListeners(status) {
  listeners.forEach(fn => {
    try {
      fn(status);
    } catch (e) {
      console.error('[ConnectivityService] Error en listener:', e);
    }
  });
}

/**
 * Realiza un ping liviano a Supabase o endpoint público con timeout estricto (2s)
 */
export async function checkRealConnectivity(force = false) {
  const now = Date.now();
  if (!force && (now - lastCheckTime < CHECK_CACHE_MS) && currentStatus !== CONNECTIVITY_STATUS.CHECKING) {
    return currentStatus === CONNECTIVITY_STATUS.ONLINE;
  }

  if (!navigator.onLine) {
    currentStatus = CONNECTIVITY_STATUS.OFFLINE;
    notifyListeners(currentStatus);
    return false;
  }

  if (isChecking) return currentStatus === CONNECTIVITY_STATUS.ONLINE;
  isChecking = true;

  try {
    const config = getAdConfig();
    const baseUrl = (config.supabaseUrl || 'https://qtixbiikhvhzwshfgyeo.supabase.co').replace(/\/$/, '');
    const pingUrl = `${baseUrl}/rest/v1/`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const headers = { 'Accept': 'application/json' };
    if (config.supabaseKey) {
      headers['apikey'] = config.supabaseKey;
    }

    const response = await fetch(pingUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
      cache: 'no-store'
    });

    clearTimeout(timeoutId);

    // Supabase devuelve 200 o 401 si no hay key, pero ambos indican que el servidor Cloud RESPONDE
    const isOk = response.status < 500;
    const newStatus = isOk ? CONNECTIVITY_STATUS.ONLINE : CONNECTIVITY_STATUS.OFFLINE;

    if (newStatus !== currentStatus) {
      currentStatus = newStatus;
      notifyListeners(currentStatus);
    }

    lastCheckTime = Date.now();
    return isOk;
  } catch (err) {
    // Si falló el ping a Supabase, probar un fallback rápido
    try {
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), 1800);
      const fallback = await fetch('https://www.google.com/generate_204', { mode: 'no-cors', signal: c2.signal });
      clearTimeout(t2);
      currentStatus = CONNECTIVITY_STATUS.ONLINE;
      notifyListeners(currentStatus);
      lastCheckTime = Date.now();
      return true;
    } catch (e2) {
      currentStatus = CONNECTIVITY_STATUS.OFFLINE;
      notifyListeners(currentStatus);
      lastCheckTime = Date.now();
      return false;
    }
  } finally {
    isChecking = false;
  }
}

/**
 * Obtener estado actual
 */
export function getConnectivityStatus() {
  return currentStatus;
}

export function isOnline() {
  return currentStatus === CONNECTIVITY_STATUS.ONLINE;
}

/**
 * Suscribirse a cambios de conectividad
 */
export function subscribeConnectivity(listener) {
  listeners.add(listener);
  // Emitir estado actual inmediatamente
  listener(currentStatus);
  return () => listeners.delete(listener);
}

// Escuchar eventos nativos de red del sistema operativo
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    checkRealConnectivity(true);
  });

  window.addEventListener('offline', () => {
    currentStatus = CONNECTIVITY_STATUS.OFFLINE;
    notifyListeners(currentStatus);
  });

  // Verificación inicial no bloqueante
  setTimeout(() => checkRealConnectivity(true), 800);
}
