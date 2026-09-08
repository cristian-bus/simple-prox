// Servicio de Activación y Registro de Instalaciones con Telegram

import { APP_VERSION } from '../constants/version.js';

const DEFAULT_CONFIG = {
  remoteConfigUrl: '',
  telegramBotToken: '8929069889:AAEGeygVdVXdp-V1llq3UrcksgIVVEQytpE', // Token preconfigurado
  telegramChatId: '1103915546',   // ID del chat del dueño preconfigurado
  defaultMasterKey: 'SiMple2026' // Clave maestra por defecto
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
  const botToken = config.telegramBotToken || DEFAULT_CONFIG.telegramBotToken;
  const chatId = config.telegramChatId || DEFAULT_CONFIG.telegramChatId;

  // 1. Consultar Telegram con timeout de 2.5s para no demorar la activación
  if (botToken && chatId) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const url = `https://api.telegram.org/bot${botToken}/getUpdates?allowed_updates=["message"]`;
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.ok && Array.isArray(data.result) && data.result.length > 0) {
          
          // Limpiar la cola de Telegram para que no devuelva mensajes viejos
          const highestUpdateId = Math.max(...data.result.map(u => u.update_id));
          fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${highestUpdateId + 1}`).catch(() => {});

          // Filtrar mensajes del dueño que empiecen con /clave
          const claveMessages = data.result
            .filter(item => item.message && String(item.message.chat?.id) === String(chatId) && item.message.text)
            .map(item => item.message.text.trim())
            .filter(text => text.toLowerCase().startsWith('/clave'));

          if (claveMessages.length > 0) {
            const lastCommand = claveMessages[claveMessages.length - 1];
            const parts = lastCommand.split(/\s+/);
            if (parts.length >= 2 && parts[1].trim()) {
              return parts.slice(1).join(' ').trim();
            }
          }
        }
      }
    } catch (err) {
      // Timeout o error de red: continuar inmediatamente sin bloquear
    }
  }

  // 2. Si hay una URL de API Nube alternativa
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

  // 3. Clave maestra configurada localmente o por defecto
  return config.masterKey || DEFAULT_CONFIG.defaultMasterKey;
}

export async function sendTelegramNotification(installationData) {
  try {
    const config = JSON.parse(localStorage.getItem('kioscoprox_remote_config') || '{}');
    const botToken = config.telegramBotToken || DEFAULT_CONFIG.telegramBotToken;
    const chatId = config.telegramChatId || DEFAULT_CONFIG.telegramChatId;

    if (!botToken || !chatId) {
      return false;
    }

    const { negocio, direccion, telefono, instalador, hardwareId, geo, date, version } = installationData;

    // DEDUPLICACIÓN ESTRICTA: Evita enviar dos activaciones idénticas si se dispara más de una vez en 20 segundos
    const dedupeKey = `${hardwareId}_${negocio}`;
    const now = Date.now();
    if (dedupeKey === lastSentInstallationKey && (now - lastSentTime) < 20000) {
      console.warn('[Telegram] Notificación duplicada prevenida para:', dedupeKey);
      return true;
    }
    lastSentInstallationKey = dedupeKey;
    lastSentTime = now;

    const message = `
🚨 <b>¡NUEVA INSTALACIÓN DE KIOSCO PROX!</b> 🚨
---------------------------------------------
🏪 <b>Negocio:</b> ${negocio}
📍 <b>Dirección:</b> ${direccion}
📞 <b>Teléfono:</b> ${telefono || 'No especificado'}
👤 <b>Instalado por:</b> ${instalador}
💻 <b>ID Equipo:</b> <code>${hardwareId}</code>
🌐 <b>IP / Ubicación:</b> ${geo.ip} (${geo.city || ''}, ${geo.region || ''} ${geo.country || ''})
📅 <b>Fecha y Hora:</b> ${date}
📦 <b>Versión:</b> v${version}
---------------------------------------------
✅ <i>Instalación verificada y activada con éxito.</i>
    `.trim();

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });

    return response.ok;
  } catch (error) {
    console.error('Error al enviar notificación de Telegram:', error);
    return false;
  }
}

export async function testTelegramNotification(customToken, customChatId) {
  const config = JSON.parse(localStorage.getItem('kioscoprox_remote_config') || '{}');
  const botToken = customToken || config.telegramBotToken || DEFAULT_CONFIG.telegramBotToken;
  const chatId = customChatId || config.telegramChatId || DEFAULT_CONFIG.telegramChatId;

  if (!botToken || !chatId) {
    return { success: false, error: 'Ingresa el Bot Token y tu Chat ID primero.' };
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '🧪 <b>Prueba de Notificación de KioscoProX</b>\n\n¡Tu Bot de Telegram está funcionando correctamente! 🎉\n\n💡 <b>Control Remoto de Clave:</b> Puedes cambiar la Clave Maestra en cualquier momento enviando a este chat el comando:\n<code>/clave TuNuevaClave</code>',
        parse_mode: 'HTML'
      })
    });

    const data = await response.json();
    if (response.ok && data.ok) {
      return { success: true, message: '¡Mensaje de prueba enviado con éxito a tu Telegram!' };
    } else {
      const rawDesc = data.description || 'Respuesta desconocida de Telegram';
      const code = response.status;
      return { 
        success: false, 
        error: `Telegram Error [${code}]: "${rawDesc}". Verifica que el Token no tenga espacios y que tu Chat ID sea solo números.` 
      };
    }
  } catch (e) {
    return { success: false, error: 'Sin conexión a internet o error de red: ' + e.message };
  }
}

export async function processActivation({ negocio, direccion, telefono, instalador, masterKeyInput, version = APP_VERSION }) {
  const remoteMasterKey = await fetchRemoteMasterKey();

  if (masterKeyInput.trim() !== remoteMasterKey) {
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
