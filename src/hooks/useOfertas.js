import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  getCachedCampaigns, 
  syncCampaignsRemotely, 
  registerMerchantRemotely, 
  trackAdEvent, 
  buildWhatsAppUrl, 
  flushPendingEvents 
} from '../services/adSyncEngine.js';
import { isCampaignEligibleForCommerce, getCampaignStatus } from '../utils/b2bUtils.js';
import { getLowStockReplenishmentOpportunities } from '../utils/stockOfferMatcher.js';
import { getCommerceProfile } from '../services/installationService.js';
import { getRemoteConfig, subscribeRemoteConfig } from '../services/remoteConfigService.js';
import { APP_VERSION } from '../constants/version.js';

const IMPRESSION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos de cooldown por campaña
const DWELL_TIME_MS = 2000; // 2 segundos continuos de exposición requeridos
export const CAMPAIGN_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos (600.000 ms) entre consultas periódicas

/**
 * Genera deterministamente una secuencia de rotación con prioridad moderada (~1 de cada 3 posiciones)
 * para campañas premium con necesidad de reposición, garantizando equidad y cero inanición de campañas normales.
 */
export function buildPriorityRotationSequence(eligibleCampaigns, contextualCampaignIds) {
  if (!Array.isArray(eligibleCampaigns)) {
    return eligibleCampaigns;
  }
  if (eligibleCampaigns.length <= 1) {
    return eligibleCampaigns;
  }

  if (!contextualCampaignIds || contextualCampaignIds.size === 0) {
    return eligibleCampaigns;
  }

  const contextual = eligibleCampaigns.filter(c => contextualCampaignIds.has(c.id));
  const general = eligibleCampaigns.filter(c => !contextualCampaignIds.has(c.id));

  // Si no hay contextuales o todas son contextuales, conservar rotación normal
  if (contextual.length === 0 || general.length === 0) {
    return eligibleCampaigns;
  }

  // Cadencia moderada de ~1 de cada 3 slots: [Ctx, Gen, Gen]
  // Si la densidad de contextuales es alta (>= 1/3 del total), intercalar 1 a 1 para equidad [Ctx, Gen]
  const isHighContextualDensity = contextual.length / eligibleCampaigns.length >= 0.33;
  const genPerCtx = isHighContextualDensity ? 1 : 2;

  const gcd = (a, b) => (!b ? a : gcd(b, a % b));
  const lcm = (a, b) => (a * b) / gcd(a, b);

  const neededCtxBlocks = contextual.length;
  const neededGenBlocks = Math.ceil(general.length / genPerCtx);
  const baseBlocks = lcm(neededCtxBlocks, Math.max(1, neededGenBlocks));
  const multiplier = Math.ceil(3 / baseBlocks);
  const safeBlocksCount = Math.min(baseBlocks * multiplier, 30); // Límite seguro anti-desborde

  const sequence = [];
  let ctxIdx = 0;
  let genIdx = 0;

  for (let b = 0; b < safeBlocksCount; b++) {
    // 1 Contextual
    const nextCtx = contextual[ctxIdx % contextual.length];
    if (sequence.length > 0 && sequence[sequence.length - 1].id === nextCtx.id && contextual.length > 1) {
      ctxIdx++;
      sequence.push(contextual[ctxIdx % contextual.length]);
    } else {
      sequence.push(nextCtx);
    }
    ctxIdx++;

    // Generales correspondientes al bloque (1 o 2)
    for (let g = 0; g < genPerCtx; g++) {
      const nextGen = general[genIdx % general.length];
      if (sequence[sequence.length - 1].id === nextGen.id && general.length > 1) {
        genIdx++;
        sequence.push(general[genIdx % general.length]);
      } else {
        sequence.push(nextGen);
      }
      genIdx++;
    }
  }

  // Anti-repetición en el borde del ciclo (último elemento vs primer elemento)
  if (sequence.length > 1 && sequence[sequence.length - 1].id === sequence[0].id) {
    if (sequence.length >= 3 && sequence[sequence.length - 2].id !== sequence[0].id) {
      const last = sequence[sequence.length - 1];
      sequence[sequence.length - 1] = sequence[sequence.length - 2];
      sequence[sequence.length - 2] = last;
    }
  }

  return sequence;
}

/**
 * Localiza la posición más cercana (hacia adelante) en la secuencia ponderada para una campaña específica.
 * Permite que al seleccionar un elemento del catálogo único, la rotación salte al slot correcto en bannerCampaigns.
 */
export function findBannerSlotForCampaign(bannerCampaigns, targetCampaignId, currentBannerIndex = 0) {
  if (!Array.isArray(bannerCampaigns) || bannerCampaigns.length === 0 || !targetCampaignId) return -1;
  const len = bannerCampaigns.length;
  const start = Math.max(0, currentBannerIndex);
  for (let offset = 0; offset < len; offset++) {
    const candidateIdx = (start + offset) % len;
    if (bannerCampaigns[candidateIdx]?.id === targetCampaignId) {
      return candidateIdx;
    }
  }
  return -1;
}

export function useOfertas(kiosco, isScreenActive = true) {
  const businessConfig = kiosco?.businessConfig || {};
  const products = kiosco?.products || [];
  const commerceProfile = getCommerceProfile();

  const [remoteConfig, setRemoteConfig] = useState(() => getRemoteConfig());
  useEffect(() => {
    return subscribeRemoteConfig(setRemoteConfig);
  }, []);

  const isKiosco = (businessConfig.businessType || '').trim().toLowerCase() === 'kiosco';
  const isPro = (businessConfig.plan || '').toLowerCase() === 'pro';
  
  // Respetar flags globales de Remote Config y preferencias de plan Pro
  const b2bGloballyEnabled = remoteConfig.b2bEnabled !== false;
  const bannerGloballyEnabled = remoteConfig.bannerEnabled !== false;
  const showAds = b2bGloballyEnabled && bannerGloballyEnabled && isKiosco && (!isPro || !businessConfig.hideAds);

  const [rawCampaigns, setRawCampaigns] = useState(() => getCachedCampaigns());
  const [bannerIndex, setBannerIndex] = useState(0);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const effectiveCommerceProfile = useMemo(() => {
    return {
      ...commerceProfile,
      provinceCode: businessConfig.provinceCode || commerceProfile.provinceCode,
      provinceName: businessConfig.provinceName || commerceProfile.provinceName,
      cityCode: businessConfig.cityCode || commerceProfile.cityCode,
      cityName: businessConfig.cityName || commerceProfile.cityName,
      storeName: businessConfig.storeName || commerceProfile.storeName
    };
  }, [commerceProfile, businessConfig.provinceCode, businessConfig.provinceName, businessConfig.cityCode, businessConfig.cityName, businessConfig.storeName]);

  const merchantId = effectiveCommerceProfile.installationId || businessConfig.installationId || 'PC-DESK-001';
  const city = effectiveCommerceProfile.cityName || businessConfig.city || '';
  const effectiveStoreName = effectiveCommerceProfile.storeName || businessConfig.storeName || businessConfig.name || '';

  // Sincronizar siempre datos del comercio con perfil completo
  useEffect(() => {
    registerMerchantRemotely({
      installationId: merchantId,
      commerceId: effectiveCommerceProfile.commerceId,
      storeName: effectiveStoreName,
      plan: businessConfig.plan || 'Básico',
      provinceCode: effectiveCommerceProfile.provinceCode,
      provinceName: effectiveCommerceProfile.provinceName,
      cityCode: effectiveCommerceProfile.cityCode,
      cityName: effectiveCommerceProfile.cityName,
      address: effectiveCommerceProfile.address || businessConfig.address || '',
      phone: effectiveCommerceProfile.phone || businessConfig.phone || '',
      installer: effectiveCommerceProfile.installer || '',
      appVersion: APP_VERSION,
      city
    }).catch(() => {});
  }, [merchantId, effectiveStoreName, businessConfig.plan, effectiveCommerceProfile.provinceCode, effectiveCommerceProfile.cityCode]);

  // Filtrar estrictamente sólo las campañas con estado "active", vigentes y elegibles geográficamente
  const campaigns = useMemo(() => {
    if (!Array.isArray(rawCampaigns)) return [];
    return rawCampaigns.filter(c => {
      const st = (c.status || 'active').toLowerCase();
      const isActive = st === 'active' || st === 'activa';
      if (!isActive) return false;

      // Vigencia dinámica en tiempo real
      const currentStatus = getCampaignStatus(c);
      if (currentStatus !== 'active') return false;

      // Matching geográfico automático
      return isCampaignEligibleForCommerce(c, effectiveCommerceProfile);
    });
  }, [rawCampaigns, effectiveCommerceProfile]);

  // Prioridad contextual moderada en la rotación según stock bajo y servicio premium (isSmartAdvertising)
  const bannerCampaigns = useMemo(() => {
    if (!Array.isArray(campaigns) || campaigns.length <= 1 || !Array.isArray(products) || products.length === 0) {
      return campaigns;
    }

    // REGLA OBLIGATORIA: Solo campañas elegibles con isSmartAdvertising === true pueden recibir prioridad contextual
    const smartEligible = campaigns.filter(c => c.isSmartAdvertising === true);
    if (smartEligible.length === 0) {
      return campaigns;
    }

    const opportunities = getLowStockReplenishmentOpportunities(products, smartEligible);
    if (!opportunities || opportunities.length === 0) {
      return campaigns;
    }

    const contextualIds = new Set(opportunities.map(o => o.campaign.id));
    return buildPriorityRotationSequence(campaigns, contextualIds);
  }, [campaigns, products]);

  // Recarga manual
  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const activeCamps = await syncCampaignsRemotely({
        installationId: merchantId,
        storeName: effectiveStoreName,
        plan: businessConfig.plan || 'Básico',
        address: businessConfig.address || businessConfig.activationData?.direccion || '',
        phone: businessConfig.phone || businessConfig.activationData?.telefono || '',
        installer: businessConfig.activationData?.instalador || '',
        appVersion: APP_VERSION,
        city
      });
      if (Array.isArray(activeCamps)) {
        setRawCampaigns(activeCamps);
      }
    } catch (e) {
      console.warn('[useOfertas] Error en refetch:', e);
    } finally {
      setLoading(false);
    }
  }, [merchantId, effectiveStoreName, businessConfig.plan, city]);

  // Sincronización inicial y periódica en background sin parpadeo de UI
  const isInitialMount = useRef(true);
  const lastOpenTrackRef = useRef({ campaignId: null, timestamp: 0 });
  const lastWhatsAppTrackRef = useRef({ campaignId: null, timestamp: 0 });
  const lastImpressionMapRef = useRef(new Map());

  // Control reactivo de visibilidad y foco de la ventana
  const [isWindowVisible, setIsWindowVisible] = useState(() => {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible' && (typeof document.hasFocus === 'function' ? document.hasFocus() : true);
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const updateVisibility = () => {
      const isVisible = document.visibilityState === 'visible';
      const isFocused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
      setIsWindowVisible(isVisible && isFocused);
    };

    document.addEventListener('visibilitychange', updateVisibility);
    window.addEventListener('focus', updateVisibility);
    window.addEventListener('blur', updateVisibility);

    updateVisibility();

    return () => {
      document.removeEventListener('visibilitychange', updateVisibility);
      window.removeEventListener('focus', updateVisibility);
      window.removeEventListener('blur', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!showAds) return;

    let mounted = true;
    const runSync = async (isInitial = false) => {
      try {
        const activeCamps = await syncCampaignsRemotely({
          installationId: merchantId,
          storeName: effectiveStoreName,
          plan: businessConfig.plan || 'Básico',
          address: businessConfig.address || businessConfig.activationData?.direccion || '',
          phone: businessConfig.phone || businessConfig.activationData?.telefono || '',
          installer: businessConfig.activationData?.instalador || '',
          appVersion: APP_VERSION,
          city
        });
        if (mounted && Array.isArray(activeCamps)) {
          setRawCampaigns(activeCamps);
        }
      } catch (err) {
        console.warn('[useOfertas] Error en sincronización periódica:', err);
      }
    };

    if (isInitialMount.current) {
      isInitialMount.current = false;
      runSync(true);
      flushPendingEvents(merchantId);
    }

    // Reaccionar inmediatamente a la recuperación de conexión a Internet
    const handleOnline = () => {
      if (mounted) {
        runSync(false);
        flushPendingEvents(merchantId);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }

    // Sincronizar periódicamente cada 10 minutos (600.000 ms) en segundo plano
    const interval = setInterval(() => {
      runSync(false);
    }, CAMPAIGN_SYNC_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
    };
  }, [showAds, merchantId, city]);

  // Control de hover para pausar la rotación cuando el usuario interactúa con el banner
  const [isHovered, setIsHovered] = useState(false);

  // Funciones de navegación manual entre ofertas sobre la secuencia ponderada real
  const nextAd = useCallback(() => {
    if (bannerCampaigns.length > 1) {
      setBannerIndex((prev) => (prev + 1) % bannerCampaigns.length);
    }
  }, [bannerCampaigns.length]);

  const prevAd = useCallback(() => {
    if (bannerCampaigns.length > 1) {
      setBannerIndex((prev) => (prev - 1 + bannerCampaigns.length) % bannerCampaigns.length);
    }
  }, [bannerCampaigns.length]);

  // Selección directa por índice del catálogo único (usado por los puntos indicadores interactivos)
  const goToAd = useCallback((uniqueIndex) => {
    if (!Array.isArray(campaigns) || campaigns.length === 0 || typeof uniqueIndex !== 'number') return;
    if (uniqueIndex < 0 || uniqueIndex >= campaigns.length) return;

    const targetCampaign = campaigns[uniqueIndex];
    if (!targetCampaign) return;

    const targetSlot = findBannerSlotForCampaign(bannerCampaigns, targetCampaign.id, bannerIndex);
    if (targetSlot >= 0) {
      setBannerIndex(targetSlot);
    }
  }, [campaigns, bannerCampaigns, bannerIndex]);

  // Adaptador de compatibilidad para llamadas funcionales prev => next
  const setCurrentAdIndex = useCallback((targetOrFn) => {
    if (typeof targetOrFn === 'function') {
      setBannerIndex((prev) => {
        const currentTarget = bannerCampaigns[prev % bannerCampaigns.length];
        const currentUnique = campaigns.findIndex(c => c.id === currentTarget?.id);
        const nextUnique = targetOrFn(currentUnique >= 0 ? currentUnique : 0);
        if (typeof nextUnique === 'number' && nextUnique >= 0 && nextUnique < campaigns.length) {
          const target = campaigns[nextUnique];
          const foundIdx = findBannerSlotForCampaign(bannerCampaigns, target?.id, prev);
          return foundIdx >= 0 ? foundIdx : prev;
        }
        return prev;
      });
    } else {
      goToAd(targetOrFn);
    }
  }, [campaigns, bannerCampaigns, goToAd]);

  // Rotación automática del widget de banner (7 segundos por defecto, pausa en hover, desenfoque o pantalla inactiva)
  useEffect(() => {
    if (!showAds || bannerCampaigns.length <= 1 || isHovered || !isScreenActive || !isWindowVisible) return;

    // Si bannerInterval viene como 120 (el valor antiguo) o mayor a 30, usar 7s
    const rawInterval = Number(remoteConfig.bannerInterval);
    const intervalSec = (rawInterval >= 3 && rawInterval <= 30) ? rawInterval : 7;
    const rotationMs = intervalSec * 1000;

    const timer = setInterval(() => {
      setBannerIndex((prev) => (prev + 1) % bannerCampaigns.length);
    }, rotationMs);

    return () => clearInterval(timer);
  }, [showAds, bannerCampaigns.length, remoteConfig.bannerInterval, isHovered, isScreenActive, isWindowVisible]);

  // Campaña activa resuelta desde la secuencia ponderada real
  const activeCampaign = useMemo(() => {
    if (bannerCampaigns.length === 0) return null;
    return bannerCampaigns[bannerIndex % bannerCampaigns.length];
  }, [bannerCampaigns, bannerIndex]);

  // Índice de la campaña activa dentro del catálogo único para sincronizar los indicadores y contadores del UI
  const currentAdIndex = useMemo(() => {
    if (!activeCampaign || !Array.isArray(campaigns) || campaigns.length === 0) return 0;
    const idx = campaigns.findIndex(c => c.id === activeCampaign.id);
    return idx >= 0 ? idx : 0;
  }, [activeCampaign, campaigns]);

  useEffect(() => {
    const campaignId = activeCampaign?.id;
    if (!campaignId || !showAds || !isScreenActive || !isWindowVisible) {
      return;
    }

    const now = Date.now();
    const lastTracked = lastImpressionMapRef.current.get(campaignId);

    // Cooldown de 5 minutos para la misma campaña en esta sesión
    if (lastTracked && now - lastTracked < IMPRESSION_COOLDOWN_MS) {
      return;
    }

    // Temporizador de dwell time (2.0 segundos de exposición continua ininterrumpida)
    const timer = setTimeout(() => {
      // Re-validar todas las condiciones en el momento exacto del disparo para evitar ejecuciones tardías
      const isDocVisible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
      const isDocFocused = typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : true;
      const currentNow = Date.now();
      const currentLastTracked = lastImpressionMapRef.current.get(campaignId);

      if (
        isScreenActive &&
        isDocVisible &&
        isDocFocused &&
        (!currentLastTracked || currentNow - currentLastTracked >= IMPRESSION_COOLDOWN_MS)
      ) {
        lastImpressionMapRef.current.set(campaignId, currentNow);
        trackAdEvent({
          campaignId,
          merchantId,
          eventType: 'impression'
        });
      }
    }, DWELL_TIME_MS);

    // Cancelar temporizador inmediatamente si cambia de campaña, cambia de pantalla, o la ventana pierde foco/visibilidad
    return () => clearTimeout(timer);
  }, [activeCampaign?.id, showAds, merchantId, isScreenActive, isWindowVisible]);

  // Abrir detalle de la oferta (protegido contra rebote, doble clic y event bubbling)
  const openCampaignDetail = useCallback((campaignOrEvent) => {
    let campaign = campaignOrEvent;
    if (campaign && (campaign.nativeEvent || campaign.type === 'click')) {
      campaign = null;
    }
    const target = campaign || activeCampaign;
    if (!target) return;
    
    setSelectedCampaign(target);
    setIsModalOpen(true);

    // Evitar registrar duplicados por event bubbling o doble clic (ventana de 1.5s por campaña)
    const now = Date.now();
    if (
      lastOpenTrackRef.current.campaignId === target.id &&
      now - lastOpenTrackRef.current.timestamp < 1500
    ) {
      return;
    }

    lastOpenTrackRef.current = {
      campaignId: target.id,
      timestamp: now
    };

    trackAdEvent({
      campaignId: target.id,
      merchantId,
      eventType: 'offer_open'
    });
  }, [activeCampaign, merchantId]);

  const closeCampaignDetail = useCallback(() => {
    setIsModalOpen(false);
    setSelectedCampaign(null);
  }, []);

  // Click en WhatsApp (protegido contra clics repetidos)
  const handleWhatsAppClick = useCallback((campaignOrEvent) => {
    let campaign = campaignOrEvent;
    if (campaign && (campaign.nativeEvent || campaign.type === 'click')) {
      campaign = null;
    }
    const target = campaign || selectedCampaign || activeCampaign;
    if (!target) return;

    const now = Date.now();
    if (
      lastWhatsAppTrackRef.current.campaignId === target.id &&
      now - lastWhatsAppTrackRef.current.timestamp < 1500
    ) {
      // Ya se registró este clic recientemente, no duplicar evento
    } else {
      lastWhatsAppTrackRef.current = {
        campaignId: target.id,
        timestamp: now
      };

      trackAdEvent({
        campaignId: target.id,
        merchantId,
        eventType: 'whatsapp_click'
      });
    }

    const url = buildWhatsAppUrl(
      target.whatsappNumber, 
      target.whatsappMessage, 
      target.title,
      target.campaignCode
    );

    if (url === '#') {
      alert("El distribuidor de esta oferta no tiene configurado un número de WhatsApp en la base de datos.");
      return;
    }

    try {
      if (window.api && window.api.openExternal) {
        window.api.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (e) {
      console.error('Error opening URL', e);
      window.open(url, '_blank');
    }
  }, [selectedCampaign, activeCampaign, merchantId]);

  return {
    showAds,
    campaigns,
    activeCampaign,
    currentAdIndex,
    setCurrentAdIndex,
    nextAd,
    prevAd,
    goToAd,
    isHovered,
    setIsHovered,
    selectedCampaign,
    isModalOpen,
    loading,
    refetch,
    openCampaignDetail,
    closeCampaignDetail,
    handleWhatsAppClick
  };
}
