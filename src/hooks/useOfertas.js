import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  getCachedCampaigns, 
  syncCampaignsRemotely, 
  registerMerchantRemotely, 
  trackAdEvent, 
  buildWhatsAppUrl, 
  flushPendingEvents 
} from '../services/adSyncEngine';
import { isCampaignEligibleForCommerce } from '../utils/b2bUtils';
import { getCommerceProfile } from '../services/installationService';
import { getRemoteConfig, subscribeRemoteConfig } from '../services/remoteConfigService';
import { APP_VERSION } from '../constants/version';

export function useOfertas(kiosco) {
  const businessConfig = kiosco?.businessConfig || {};
  const commerceProfile = getCommerceProfile();

  const [remoteConfig, setRemoteConfig] = useState(() => getRemoteConfig());
  useEffect(() => {
    return subscribeRemoteConfig(setRemoteConfig);
  }, []);

  const isKiosco = businessConfig.businessType === 'kiosco';
  const isPro = (businessConfig.plan || '').toLowerCase() === 'pro';
  
  // Respetar flags globales de Remote Config y preferencias de plan Pro
  const b2bGloballyEnabled = remoteConfig.b2bEnabled !== false;
  const bannerGloballyEnabled = remoteConfig.bannerEnabled !== false;
  const showAds = b2bGloballyEnabled && bannerGloballyEnabled && isKiosco && (!isPro || !businessConfig.hideAds);

  const [rawCampaigns, setRawCampaigns] = useState(() => getCachedCampaigns());
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const merchantId = commerceProfile.installationId || businessConfig.installationId || 'PC-DESK-001';
  const city = commerceProfile.cityName || businessConfig.city || '';
  const effectiveStoreName = commerceProfile.storeName || businessConfig.storeName || businessConfig.name || '';

  // Sincronizar siempre datos del comercio con perfil completo
  useEffect(() => {
    registerMerchantRemotely({
      installationId: merchantId,
      commerceId: commerceProfile.commerceId,
      storeName: effectiveStoreName,
      plan: businessConfig.plan || 'Básico',
      provinceCode: commerceProfile.provinceCode,
      provinceName: commerceProfile.provinceName,
      cityCode: commerceProfile.cityCode,
      cityName: commerceProfile.cityName,
      address: commerceProfile.address || businessConfig.address || '',
      phone: commerceProfile.phone || businessConfig.phone || '',
      installer: commerceProfile.installer || '',
      appVersion: APP_VERSION,
      city
    }).catch(() => {});
  }, [merchantId, effectiveStoreName, businessConfig.plan]);

  // Filtrar estrictamente sólo las campañas con estado "active" y que sean elegibles geográficamente
  const campaigns = useMemo(() => {
    if (!Array.isArray(rawCampaigns)) return [];
    return rawCampaigns.filter(c => {
      const st = (c.status || 'active').toLowerCase();
      const isActive = st === 'active' || st === 'activa';
      if (!isActive) return false;

      // Matching geográfico automático
      return isCampaignEligibleForCommerce(c, commerceProfile);
    });
  }, [rawCampaigns, commerceProfile.provinceCode, commerceProfile.cityCode]);

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
      if (Array.isArray(activeCamps) && activeCamps.length > 0) {
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
        if (mounted && Array.isArray(activeCamps) && activeCamps.length > 0) {
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

    // Sincronizar periódicamente cada 60 segundos en segundo plano
    const interval = setInterval(() => {
      runSync(false);
    }, 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [showAds, merchantId, city]);

  // Rotación automática del widget de banner según Remote Config (por defecto 120s o configurado)
  useEffect(() => {
    if (!showAds || campaigns.length === 0) return;

    const rotationMs = Math.max(5000, (remoteConfig.bannerInterval || 120) * 1000);
    const timer = setInterval(() => {
      setCurrentAdIndex((prev) => (prev + 1) % campaigns.length);
    }, rotationMs);

    return () => clearInterval(timer);
  }, [showAds, campaigns.length, remoteConfig.bannerInterval]);

  // Registrar impresión al cambiar el anuncio en pantalla
  const activeCampaign = useMemo(() => {
    if (campaigns.length === 0) return null;
    return campaigns[currentAdIndex % campaigns.length];
  }, [campaigns, currentAdIndex]);

  useEffect(() => {
    if (activeCampaign && showAds) {
      trackAdEvent({
        campaignId: activeCampaign.id,
        merchantId,
        eventType: 'impression'
      });
    }
  }, [activeCampaign?.id, showAds, merchantId]);

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
    selectedCampaign,
    isModalOpen,
    loading,
    refetch,
    openCampaignDetail,
    closeCampaignDetail,
    handleWhatsAppClick
  };
}
