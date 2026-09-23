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

export async function processActivation({ negocio, direccion, telefono, instalador, masterKeyInput, version = APP_VERSION }) {
  const remoteMasterKey = await fetchRemoteMasterKey();

  // FAIL CLOSED: No permitir activación si no hay una clave configurada/obtenida válidamente
  if (!remoteMasterKey || typeof remoteMasterKey !== 'string' || !remoteMasterKey.trim()) {
    return {
      success: false,
      error: 'No fue posible validar la clave de activación. Verifique la configuración o conexión con el servicio de activación.'
    };
  }

  // Si existe una clave maestra configurada remotamente o en terminal, validarla estrictamente
  if (masterKeyInput.trim() !== remoteMasterKey.trim()) {
    return { success: false, error: 'La Clave Maestra ingresada es incorrecta o fue cambiada.' };
  }

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

  await sendTelegramNotification(installationData);

  return {
    success: true,
    installationData
  };
}
