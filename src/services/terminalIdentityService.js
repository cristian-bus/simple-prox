// Servicio de Identidad de Terminal y Comunicación Segura con Supabase Edge Function
// Gestiona el ciclo de vida del token de terminal, almacenamiento seguro (DPAPI/Electron)
// y envío autenticado de telemetría, perfil del comercio y eventos de campañas.

import { getInstallationId, getCommerceProfile } from './installationService.js';
import { getAdConfig } from './adSyncEngine.js';

const STORAGE_KEYS = {
  TOKEN_ENC: 'kioscoprox_terminal_cred_enc',
  TOKEN_RAW: 'kioscoprox_terminal_cred_token'
};

const DEFAULT_SUPABASE_URL = 'https://qtixbiikhvhzwshfgyeo.supabase.co';

export function getTerminalSyncUrl() {
  const config = getAdConfig();
  const baseUrl = (config.supabaseUrl || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  return `${baseUrl}/functions/v1/terminal-sync`;
}

/**
 * Recuperar el token de terminal desde el almacenamiento seguro (Electron DPAPI o fallback)
 */
export async function getStoredTerminalToken() {
  try {
    // 1. Intentar descifrar mediante Electron safeStorage (Windows DPAPI)
    const encHex = localStorage.getItem(STORAGE_KEYS.TOKEN_ENC);
    if (encHex && typeof window !== 'undefined' && window.api?.secureStoreDecrypt) {
      const res = await window.api.secureStoreDecrypt(encHex);
      if (res && res.success && res.decrypted) {
        return res.decrypted;
      }
    }

    // 2. Fallback local si safeStorage no está disponible (modo navegador / dev)
    const raw = localStorage.getItem(STORAGE_KEYS.TOKEN_RAW);
    if (raw && raw.trim()) {
      return raw.trim();
    }
  } catch (e) {
    console.warn('[TerminalIdentity] Error leyendo token:', e);
  }
  return null;
}

/**
 * Almacenar el token de terminal de forma segura
 */
export async function storeTerminalToken(token) {
  if (!token || typeof token !== 'string') return;
  try {
    // 1. Intentar cifrar mediante Electron safeStorage (Windows DPAPI)
    if (typeof window !== 'undefined' && window.api?.secureStoreEncrypt) {
      const res = await window.api.secureStoreEncrypt(token);
      if (res && res.success && res.encrypted) {
        localStorage.setItem(STORAGE_KEYS.TOKEN_ENC, res.encrypted);
        localStorage.removeItem(STORAGE_KEYS.TOKEN_RAW); // Eliminar texto plano
        return;
      }
    }

    // 2. Fallback de persistencia local
    localStorage.setItem(STORAGE_KEYS.TOKEN_RAW, token);
  } catch (e) {
    console.error('[TerminalIdentity] Error guardando token:', e);
  }
}

/**
 * Obtener el token existente o enrolar la terminal en el backend seguro si no posee uno
 */
export async function getOrEnrollTerminalToken() {
  let token = await getStoredTerminalToken();
  if (token) return token;

  const installationId = getInstallationId();
  if (!installationId) return null;

  const profile = getCommerceProfile();
  const syncUrl = getTerminalSyncUrl();

  try {
    const res = await fetch(`${syncUrl}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installationId,
        commerceId: profile.commerceId,
        storeName: profile.storeName
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.terminalToken) {
        await storeTerminalToken(data.terminalToken);
        return data.terminalToken;
      }
    }
  } catch (e) {
    console.warn('[TerminalIdentity] Error durante enrolamiento de terminal:', e);
  }

  return null;
}

/**
 * Enviar Heartbeat autenticado a la Edge Function
 */
export async function sendTerminalHeartbeat(payload = {}) {
  const token = await getOrEnrollTerminalToken();
  const installationId = getInstallationId();
  if (!token || !installationId) {
    return { success: false, retryable: true, error: 'Sin credencial de terminal' };
  }

  const syncUrl = getTerminalSyncUrl();
  const res = await fetch(`${syncUrl}/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-terminal-id': installationId,
      'x-terminal-token': token
    },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    return { success: true };
  }

  if (res.status === 401) {
    // Seguridad: NO borrar el token local automáticamente ante 401 para evitar caer en limbo 409 (Fase 0.2.1)
    console.warn('[TerminalIdentity] HTTP 401: Credencial no autorizada o pendiente de activación.');
    return { success: false, retryable: false, error: 'Credencial no autorizada' };
  }

  return { success: false, retryable: res.status >= 500 || res.status === 429 };
}

/**
 * Enviar Registro o Actualización de Comercio autenticado a la Edge Function
 */
export async function sendTerminalRegister(payload = {}) {
  const token = await getOrEnrollTerminalToken();
  const installationId = getInstallationId();
  if (!token || !installationId) {
    return { success: false, retryable: true, error: 'Sin credencial de terminal' };
  }

  const syncUrl = getTerminalSyncUrl();
  const res = await fetch(`${syncUrl}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-terminal-id': installationId,
      'x-terminal-token': token
    },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    return { success: true };
  }

  if (res.status === 401) {
    console.warn('[TerminalIdentity] HTTP 401: Credencial no autorizada al registrar comercio.');
    return { success: false, retryable: false, error: 'Credencial no autorizada' };
  }

  return { success: false, retryable: res.status >= 500 || res.status === 429 };
}

/**
 * Enviar Lote de Métricas de Campaña autenticado a la Edge Function
 */
export async function sendTerminalEvents(events = []) {
  if (!Array.isArray(events) || events.length === 0) {
    return { success: true, processedCount: 0 };
  }

  const token = await getOrEnrollTerminalToken();
  const installationId = getInstallationId();
  if (!token || !installationId) {
    return { success: false, retryable: true, error: 'Sin credencial de terminal' };
  }

  const syncUrl = getTerminalSyncUrl();
  const res = await fetch(`${syncUrl}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-terminal-id': installationId,
      'x-terminal-token': token
    },
    body: JSON.stringify({ events })
  });

  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    return { success: true, processedCount: data.processedCount || events.length };
  }

  if (res.status === 401) {
    console.warn('[TerminalIdentity] HTTP 401: Credencial no autorizada al enviar eventos.');
    return { success: false, retryable: false, error: 'Credencial no autorizada' };
  }

  return { success: false, retryable: res.status >= 500 || res.status === 429 };
}
