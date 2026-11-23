// Servicio de Activación y Registro de Instalaciones con Telegram

import { APP_VERSION } from '../constants/version.js';

const DEFAULT_CONFIG = {
  remoteConfigUrl: '',
  masterKey: ''
};

let lastSentInstallationKey = '';
let lastSentTime = 0;

export async function getIpGeoInfo() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('No ipapi');
    const data = await response.json();
    return {
      ip: data.ip || 'Desconocida',
      city: data.city || 'Argentina',
      region: data.region || '',
      country: data.country_name || 'Argentina'
    };
  } catch (error) {
    try {
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), 1500);
      const fallbackResp = await fetch('https://api.ipify.org?format=json', { signal: c2.signal });
      clearTimeout(t2);
      const fallbackData = await fallbackResp.json();
      return { ip: fallbackData.ip || 'Desconocida', city: 'Argentina', region: '', country: 'Argentina' };
    } catch (e) {
      return { ip: 'Sin conexión IP', city: 'Argentina', region: '', country: 'Argentina' };
    }
  }
}

export async function fetchRemoteMasterKey() {
  const config = JSON.parse(localStorage.getItem('kioscoprox_remote_config') || '{}');

  // 1. Si hay una URL de API Nube configurada
  if (config.remoteConfigUrl) {
    try {
      const c3 = new AbortController();
      const t3 = setTimeout(() => c3.abort(), 2000);
      const response = await fetch(config.remoteConfigUrl, { cache: 'no-store', signal: c3.signal });
      clearTimeout(t3);
      if (response.ok) {
        const data = await response.json();
        const masterKey = data.record?.masterKey || data.masterKey || data.master_key;
        if (masterKey) return masterKey.toString().trim();
      }
    } catch (err) {}
  }

  // 2. Clave maestra configurada localmente en la terminal
  return (config.masterKey || '').trim();
}

export async function sendTelegramNotification(_installationData) {
  // Notificación directa desde cliente deshabilitada por seguridad (Fase 0.1).
  // La notificación a Telegram debe realizarse exclusivamente vía backend/Edge Function.
  return false;
}

export async function testTelegramNotification() {
  return {
    success: false,
    error: 'Notificaciones directas de Telegram deshabilitadas en el cliente por seguridad. Deben canalizarse a través del backend.'
  };
}

export async function requestDeviceActivation({ masterKey, installationId, installationData }) {
  if (!masterKey || typeof masterKey !== 'string' || !masterKey.trim()) {
    return { success: false, error: 'La Clave Maestra es requerida.' };
  }
  if (!installationId) {
    return { success: false, error: 'Identificador de instalación requerido.' };
  }

  // Determinar URL de Supabase desde configuración local o default
  const config = JSON.parse(localStorage.getItem('kioscoprox_remote_config') || '{}');
  const adConfig = JSON.parse(localStorage.getItem('kioscoprox_ad_config') || '{}');
  const baseUrl = (config.remoteConfigUrl || adConfig.supabaseUrl || adConfig.apiUrl || 'https://qtixbiikhvhzwshfgyeo.supabase.co').replace(/\/+$/, '');
  
  // Endpoint de la Edge Function
  const endpoint = baseUrl.includes('/functions/v1') 
    ? `${baseUrl}/activate-device`
    : `${baseUrl}/functions/v1/activate-device`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        masterKey: masterKey.trim(),
        installationId,
        installationData
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      return { success: false, status: 401, error: 'Clave Maestra incorrecta o no autorizada.' };
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '900';
      return {
        success: false,
        status: 429,
        retryAfter: parseInt(retryAfter, 10),
        error: `Demasiados intentos fallidos. Dispositivo bloqueado temporalmente. Reintenta en ${Math.ceil(parseInt(retryAfter, 10) / 60)} minutos.`
      };
    }

    if (!response.ok) {
      let errBody;
      try {
        errBody = await response.json();
      } catch {
        errBody = {};
      }
      return {
        success: false,
        status: response.status,
        error: errBody.error || `Error del servidor de activación (HTTP ${response.status}).`
      };
    }

    const data = await response.json();
    if (!data.success || !data.token) {
      return { success: false, error: data.error || 'Respuesta de activación incompleta del servidor.' };
    }

    return {
      success: true,
      token: data.token,
      payload: data.payload,
      terminalToken: data.terminalToken || null
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Tiempo de espera agotado al conectar con el servidor de activación.' };
    }
    return {
      success: false,
      error: 'No se pudo conectar con el servidor de activación. Verifique su conexión a Internet.'
    };
  }
}

export async function processActivation({ negocio, direccion, telefono, instalador, masterKeyInput, version = APP_VERSION, installationId }) {
  const geo = await getIpGeoInfo();
  const hardwareId = 'PC-' + Math.random().toString(36).substring(2, 9).toUpperCase();
  const dateStr = new Date().toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'medium' });

  const installationData = {
    negocio,
    direccion,
    telefono,
    instalador,
    hardwareId,
    geo,
    date: dateStr,
    version
  };

  return await requestDeviceActivation({
    masterKey: masterKeyInput,
    installationId,
    installationData
  });
}

