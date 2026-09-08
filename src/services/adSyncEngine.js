// Motor de Sincronización, Caché y Métricas Offline para Ofertas B2B (KioscoProX / Simple ProX)
import { generateWhatsAppMessage, calculateDiscount, extractB2BMetadata, getCampaignStatus, generateCampaignCode } from '../utils/b2bUtils.js';
import { enqueueOutbox, flushOutbox } from './syncService.js';
import { APP_VERSION } from '../constants/version.js';

const CACHE_KEYS = {
  CAMPAIGNS: 'kioscoprox_offers_cache',
  PENDING_EVENTS: 'kioscoprox_pending_events',
  AD_CONFIG: 'kioscoprox_ad_config',
  IMPRESSIONS_COUNT: 'kioscoprox_daily_impressions',
  MERCHANT_REGISTRATION: 'kioscoprox_merchant_registration',
  PENDING_MERCHANT_SYNC: 'kioscoprox_pending_merchant_sync'
};

const DEFAULT_SUPABASE_URL = 'https://qtixbiikhvhzwshfgyeo.supabase.co';

// Obtener configuración remota de publicidad
export function getAdConfig() {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.AD_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        supabaseUrl: parsed.supabaseUrl || parsed.apiUrl || DEFAULT_SUPABASE_URL,
        supabaseKey: parsed.supabaseKey || parsed.apiKey || '',
        apiUrl: parsed.apiUrl || parsed.supabaseUrl || DEFAULT_SUPABASE_URL,
        apiKey: parsed.apiKey || parsed.supabaseKey || '',
        enabled: parsed.enabled !== false,
        syncIntervalMinutes: parsed.syncIntervalMinutes || 15
      };
    }
  } catch (e) {}

  return { 
    supabaseUrl: DEFAULT_SUPABASE_URL, 
    supabaseKey: '', 
    apiUrl: DEFAULT_SUPABASE_URL, 
    apiKey: '', 
    enabled: true, 
    syncIntervalMinutes: 15 
  };
}

// Guardar configuración de publicidad
export function setAdConfig(config) {
  try {
    localStorage.setItem(CACHE_KEYS.AD_CONFIG, JSON.stringify(config));
    // Limpiar caché viejo para forzar descarga limpia de Supabase
    localStorage.removeItem(CACHE_KEYS.CAMPAIGNS);
  } catch (e) {
    console.error('[AdSyncEngine] Error al guardar config:', e);
  }
}

// Obtener campañas almacenadas en caché
export function getCachedCampaigns() {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.CAMPAIGNS);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[AdSyncEngine] Error al leer caché de ofertas:', e);
  }
  return [];
}

// Guardar campañas en caché
export function setCachedCampaigns(campaigns) {
  try {
    localStorage.setItem(CACHE_KEYS.CAMPAIGNS, JSON.stringify(campaigns));
  } catch (e) {
    console.error('[AdSyncEngine] Error al guardar en caché:', e);
  }
}

// Sincronizar campañas desde Supabase (Online Espejo 1 a 1)
export async function syncCampaignsRemotely(merchantInfo = {}) {
  let config = getAdConfig();
  
  if (!config.enabled) {
    return getCachedCampaigns();
  }

  // 1. Cargar desde ad_config.json estático si existe
  let supabaseUrl = config.supabaseUrl || DEFAULT_SUPABASE_URL;
  let supabaseKey = config.supabaseKey;

  if (!supabaseKey) {
    try {
      const staticCfg = await import('../../public/ad_config.json', { with: { type: 'json' } }).then(m => m.default || m);
      if (staticCfg.supabaseUrl) supabaseUrl = staticCfg.supabaseUrl;
      if (staticCfg.supabaseKey) supabaseKey = staticCfg.supabaseKey;
    } catch (e) {
      console.warn('No se pudo cargar ad_config.json local', e);
    }
  }

  const isValidKey = supabaseKey && !supabaseKey.includes('...') && supabaseKey.length > 15;

  if (supabaseUrl && isValidKey && navigator.onLine) {
    try {
      const baseUrl = supabaseUrl.replace(/\/$/, '');
      const endpoint = baseUrl.includes('/rest/v1') 
        ? `${baseUrl}/campaigns?select=*`
        : `${baseUrl}/rest/v1/campaigns?select=*`;

      const response = await fetch(endpoint, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json'
        },
        cache: 'no-store'
      });

      if (response.ok) {
        const rawData = await response.json();
        if (Array.isArray(rawData)) {
          // Filtrar estrictamente solo las activas (usando cálculo unificado de estado)
          const activeOnly = rawData.filter(c => {
            if (c.deleted === true || c.status === 'deleted') return false;
            const st = (c.status || 'active').toLowerCase();
            if (st === 'paused' || st === 'draft') return false;

            const { meta } = extractB2BMetadata(c.description);
            const start = c.start_date || c.startDate || meta.startDate;
            const end = c.end_date || c.endDate || meta.endDate;

            const computedStatus = getCampaignStatus({
              ...c,
              startDate: start,
              endDate: end
            });

            return computedStatus === 'active';
          });

          // Mapeo directo de Supabase PostgreSQL a React UI
          const mappedCampaigns = activeOnly.map(c => {
            const { cleanDescription, meta } = extractB2BMetadata(c.description);
            const disc = calculateDiscount(c.price, c.regular_price || c.regularPrice);
            return {
              id: c.id,
              advertiserId: c.advertiser_id || c.advertiserId,
              title: c.title,
              description: cleanDescription,
              category: c.category || 'General',
              type: c.type || 'oferta',
              supplierId: c.supplier_id || c.supplierId || '',
              supplierName: c.supplier_name || c.supplierName || 'Mayorista B2B',
              price: c.price,
              regularPrice: c.regular_price || c.regularPrice,
              unitPrice: c.unit_price || c.unitPrice,
              badgeText: disc.isValid ? disc.badgeText : (c.badge_text || c.badgeText || null),
              savings: disc.savings,
              formattedSavings: disc.formattedSavings,
              imageUrl: c.image_url || c.imageUrl,
              logoUrl: c.logo_url || c.logoUrl,
              campaignCode: c.campaign_code || c.campaignCode || generateCampaignCode(c.id),
              ctaText: c.cta_text || c.ctaText || 'Pedir por WhatsApp',
              whatsappNumber: c.whatsapp_number || c.whatsappNumber,
              whatsappMessage: c.whatsapp_message || c.whatsappMessage || generateWhatsAppMessage(c.title, null, c.campaign_code || c.campaignCode || generateCampaignCode(c.id)),
              minPurchase: c.min_purchase || c.minPurchase || meta.minPurchase || null,
              minPurchaseType: meta.minPurchaseType || '$',
              conditions: c.conditions || meta.conditions || null,
              targetProvinces: meta.targetProvinces || c.target_provinces || c.targetProvinces || null,
              targetCities: meta.targetCities || c.target_cities || c.targetCities || null,
              rawDescription: c.description || '',
              startDate: meta.startDate !== undefined ? meta.startDate : (c.start_date || c.startDate || null),
              endDate: meta.endDate !== undefined ? meta.endDate : (c.end_date || c.endDate || null),
              status: c.status || 'active',
              priority: c.priority || 10
            };
          });

          // Registrar este Kiosco con toda su información (plan, contacto, instalador) en Supabase
          registerMerchantRemotely(merchantInfo).catch(() => {});

          setCachedCampaigns(mappedCampaigns);
          return mappedCampaigns;
        }
      }
    } catch (err) {
      console.warn('[AdSyncEngine] Error conectando a Supabase REST API:', err);
    }
  }

  return getCachedCampaigns();
}

// Registrar o actualizar información completa del comercio en Supabase
export async function registerMerchantRemotely(merchantInfo = {}) {
  // 1. Obtener respaldo de datos del comercio desde localStorage para complementar cualquier campo
  let localBiz = {};
  try {
    const rawBiz = localStorage.getItem('kioscoprox_business_config');
    if (rawBiz) localBiz = JSON.parse(rawBiz);
  } catch (e) {}

  let savedRegistration = {};
  try {
    const rawReg = localStorage.getItem(CACHE_KEYS.MERCHANT_REGISTRATION);
    if (rawReg) savedRegistration = JSON.parse(rawReg);
  } catch (e) {}

  const localActivation = localBiz.activationData || {};

  // Resolver campos priorizando datos reales no vacíos
  const mId = merchantInfo?.installationId 
    || savedRegistration?.installationId 
    || localBiz?.installationId 
    || 'PC-ANONIMO';

  const mName = merchantInfo?.storeName 
    || merchantInfo?.name 
    || savedRegistration?.storeName 
    || savedRegistration?.name 
    || localBiz?.storeName 
    || localBiz?.name 
    || localActivation?.negocio 
    || (mId !== 'PC-ANONIMO' ? `Kiosco ${mId}` : 'Kiosco Local');

  const mPlan = merchantInfo?.plan 
    || savedRegistration?.plan 
    || localBiz?.plan 
    || 'Básico';

  const mAddress = merchantInfo?.address 
    || savedRegistration?.address 
    || localBiz?.address 
    || localActivation?.direccion 
    || '';

  const mPhone = merchantInfo?.phone 
    || savedRegistration?.phone 
    || localBiz?.phone 
    || localActivation?.telefono 
    || '';

  const mInstaller = merchantInfo?.installer 
    || savedRegistration?.installer 
    || localActivation?.instalador 
    || '';

  const mCity = merchantInfo?.city 
    || savedRegistration?.city 
    || localBiz?.city 
    || localActivation?.ciudad 
    || '';

  const mIp = merchantInfo?.ip 
    || savedRegistration?.ip 
    || localActivation?.ip 
    || '';

  const mAppVersion = APP_VERSION;

  // Guardar en caché local persistente para que nunca se pierda
  const completeMerchantInfo = {
    installationId: mId,
    commerceId: merchantInfo?.commerceId || savedRegistration?.commerceId || localBiz?.commerceId || ('COMM-' + mId),
    storeName: mName,
    plan: mPlan,
    address: mAddress,
    phone: mPhone,
    installer: mInstaller,
    city: mCity,
    cityName: merchantInfo?.cityName || mCity,
    provinceCode: merchantInfo?.provinceCode || savedRegistration?.provinceCode || localBiz?.provinceCode || 'AR-D',
    provinceName: merchantInfo?.provinceName || savedRegistration?.provinceName || localBiz?.provinceName || 'San Luis',
    cityCode: merchantInfo?.cityCode || savedRegistration?.cityCode || localBiz?.cityCode || 'SL-CAPITAL',
    businessType: merchantInfo?.businessType || localBiz?.businessType || 'kiosco',
    ip: mIp,
    appVersion: mAppVersion,
    lastActive: new Date().toISOString()
  };

  try {
    localStorage.setItem(CACHE_KEYS.MERCHANT_REGISTRATION, JSON.stringify(completeMerchantInfo));
  } catch (e) {}

  // Encolar en Outbox centralizado para garantía de entrega con reintentos
  enqueueOutbox('MERCHANT_REGISTER', completeMerchantInfo);

  let config = getAdConfig();
  let supabaseUrl = config.supabaseUrl || DEFAULT_SUPABASE_URL;
  let supabaseKey = config.supabaseKey;

  if (!supabaseKey) {
    try {
      const staticCfg = await import('../../public/ad_config.json', { with: { type: 'json' } }).then(m => m.default || m);
      if (staticCfg.supabaseUrl) supabaseUrl = staticCfg.supabaseUrl;
      if (staticCfg.supabaseKey) supabaseKey = staticCfg.supabaseKey;
    } catch (e) {}
  }

  const isValidKey = supabaseKey && !supabaseKey.includes('...') && supabaseKey.length > 15;
  if (!supabaseUrl || !isValidKey || !navigator.onLine) {
    try {
      localStorage.setItem(CACHE_KEYS.PENDING_MERCHANT_SYNC, 'true');
    } catch(e) {}
    return false;
  }

  try {
    const baseUrl = supabaseUrl.replace(/\/$/, '');
    const mEndpoint = baseUrl.includes('/rest/v1') 
      ? `${baseUrl}/merchants?on_conflict=id` 
      : `${baseUrl}/rest/v1/merchants?on_conflict=id`;

    const merchantData = {
      id: mId,
      installation_id: mId,
      commerce_id: completeMerchantInfo.commerceId,
      name: mName,
      plan: mPlan,
      app_version: mAppVersion,
      last_active: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    };

    if (completeMerchantInfo.provinceCode) merchantData.province_code = completeMerchantInfo.provinceCode;
    if (completeMerchantInfo.provinceName) merchantData.province_name = completeMerchantInfo.provinceName;
    if (completeMerchantInfo.cityCode) merchantData.city_code = completeMerchantInfo.cityCode;
    if (completeMerchantInfo.cityName) {
      merchantData.city_name = completeMerchantInfo.cityName;
      merchantData.city = completeMerchantInfo.cityName;
    }
    if (mAddress && mAddress.trim()) merchantData.address = mAddress.trim();
    if (mPhone && mPhone.trim()) merchantData.phone = mPhone.trim();
    if (mInstaller && mInstaller.trim()) merchantData.installer = mInstaller.trim();
    if (mIp && mIp.trim()) merchantData.ip = mIp.trim();
    if (completeMerchantInfo.businessType) merchantData.business_type = completeMerchantInfo.businessType;

    const res = await fetch(mEndpoint, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(merchantData)
    });

    if (res.ok || res.status === 201 || res.status === 204) {
      try {
        localStorage.removeItem(CACHE_KEYS.PENDING_MERCHANT_SYNC);
      } catch(e) {}
      return true;
    } else {
      try {
        localStorage.setItem(CACHE_KEYS.PENDING_MERCHANT_SYNC, 'true');
      } catch(e) {}
      return false;
    }
  } catch (e) {
    console.warn('[AdSyncEngine] Error registrando comercio:', e);
    try {
      localStorage.setItem(CACHE_KEYS.PENDING_MERCHANT_SYNC, 'true');
    } catch(e2) {}
    return false;
  }
}

// Registrar métrica (Impresión, Clic, WhatsApp, Abrir Oferta)
export function trackAdEvent({ campaignId, merchantId, eventType }) {
  const eventObj = {
    eventId: 'evt-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
    campaignId,
    merchantId: merchantId || 'PC-ANONIMO',
    eventType, // 'impression' | 'click' | 'whatsapp_click' | 'offer_open'
    timestamp: new Date().toISOString()
  };

  // Guardar en cola local legacy
  try {
    const rawEvents = localStorage.getItem(CACHE_KEYS.PENDING_EVENTS);
    const events = rawEvents ? JSON.parse(rawEvents) : [];
    events.push(eventObj);
    localStorage.setItem(CACHE_KEYS.PENDING_EVENTS, JSON.stringify(events));
  } catch (e) {
    console.error('[AdSyncEngine] Error guardando métrica:', e);
  }

  // Encolar en Outbox centralizado
  enqueueOutbox('CAMPAIGN_EVENT', eventObj);

  // Sincronizar en segundo plano
  flushPendingEvents(merchantId);
  flushOutbox().catch(() => {});

  return eventObj;
}

let isFlushing = false;

// Enviar lote de métricas pendientes a la nube (Idempotente)
export async function flushPendingEvents(merchantId) {
  if (!navigator.onLine) return;

  // Si hay una sincronización pendiente de datos del comercio, reintentarla ahora que hay red
  try {
    if (localStorage.getItem(CACHE_KEYS.PENDING_MERCHANT_SYNC) === 'true') {
      registerMerchantRemotely().catch(() => {});
    }
  } catch(e) {}

  if (isFlushing) return;
  isFlushing = true;

  try {
    const config = getAdConfig();
    let supabaseUrl = config.supabaseUrl || DEFAULT_SUPABASE_URL;
    let supabaseKey = config.supabaseKey;

    if (!supabaseKey) {
      try {
        const staticCfg = await import('../../public/ad_config.json', { with: { type: 'json' } }).then(m => m.default || m);
        if (staticCfg.supabaseUrl) supabaseUrl = staticCfg.supabaseUrl;
        if (staticCfg.supabaseKey) supabaseKey = staticCfg.supabaseKey;
      } catch (e) {
        console.warn('No se pudo cargar ad_config.json local', e);
      }
    }

    if (!supabaseKey || supabaseKey.includes('...')) return;

    let events = [];
    try {
      const rawEvents = localStorage.getItem(CACHE_KEYS.PENDING_EVENTS);
      events = rawEvents ? JSON.parse(rawEvents) : [];
    } catch (e) {
      return;
    }

    if (events.length === 0) return;

    // Enviar a Supabase REST API si está configurado
    if (supabaseUrl && supabaseKey) {
      try {
        const baseUrl = supabaseUrl.replace(/\/$/, '');
        const endpoint = baseUrl.includes('/rest/v1') 
          ? `${baseUrl}/campaign_events`
          : `${baseUrl}/rest/v1/campaign_events`;

        const payload = events.map(evt => ({
          event_id: evt.eventId,
          merchant_id: evt.merchantId || merchantId || 'PC-ANONIMO',
          campaign_id: evt.campaignId,
          event_type: evt.eventType,
          timestamp: evt.timestamp
        }));

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok || response.status === 201 || response.status === 409) {
          try {
            const currentRaw = localStorage.getItem(CACHE_KEYS.PENDING_EVENTS);
            const currentEvents = currentRaw ? JSON.parse(currentRaw) : [];
            const syncedEventIds = new Set(events.map(e => e.eventId));
            const remainingEvents = currentEvents.filter(e => !syncedEventIds.has(e.eventId));
            localStorage.setItem(CACHE_KEYS.PENDING_EVENTS, JSON.stringify(remainingEvents));
          } catch(e) {}
        } else {
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            localStorage.setItem(CACHE_KEYS.PENDING_EVENTS, JSON.stringify([]));
          }
        }
      } catch (err) {
        console.warn('[AdSyncEngine] Error al sincronizar métricas con Supabase:', err);
      }
    }
  } finally {
    isFlushing = false;
  }
}

// Generar enlace WhatsApp con mensaje dinámico
export function buildWhatsAppUrl(phoneNumber, customMessage, campaignTitle, campaignCode) {
  if (!phoneNumber) return '#';
  let cleanNumber = String(phoneNumber).replace(/\D/g, '');
  if (!cleanNumber) return '#';

  // Normalizar números argentinos (si tiene 10 dígitos ej: 2664805745 le agregamos 549)
  if (cleanNumber.length === 10 && !cleanNumber.startsWith('54')) {
    cleanNumber = `549${cleanNumber}`;
  } else if (cleanNumber.length === 11 && cleanNumber.startsWith('0')) {
    cleanNumber = `549${cleanNumber.slice(1)}`;
  } else if (cleanNumber.length === 12 && cleanNumber.startsWith('54') && !cleanNumber.startsWith('549')) {
    cleanNumber = `549${cleanNumber.slice(2)}`;
  }

  const msg = generateWhatsAppMessage(campaignTitle, customMessage, campaignCode);
  return `https://api.whatsapp.com/send?phone=${cleanNumber}&text=${encodeURIComponent(msg)}`;
}
