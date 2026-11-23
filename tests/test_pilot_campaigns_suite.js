import { 
  getAdConfig, 
  setAdConfig, 
  getCachedCampaigns, 
  setCachedCampaigns, 
  syncCampaignsRemotely 
} from '../src/services/adSyncEngine.js';
import { storeTerminalToken, getStoredTerminalToken } from '../src/services/terminalIdentityService.js';
import { getCampaignStatus } from '../src/utils/b2bUtils.js';

window.__RUN_PILOT_CAMPAIGNS_TEST = async function(pilotConfig) {
  const logs = [];
  function log(msg) {
    logs.push(msg);
    console.log('[PILOT_TEST]', msg);
  }

  const results = {
    step1_credentials_stored: false,
    step2_http_200_sync: false,
    step3_campaigns_valid: false,
    step3b_pilot_campaign_verified: false,
    step3b_pilot_campaign_excluded: null,
    step4_cache_updated: false,
    step5_offline_resilience: false,
    step6_legacy_reversion: false,
    details: {},
    sanitizedConfig: {
      installationId: pilotConfig.installationId,
      hasToken: Boolean(pilotConfig.terminalToken),
      useTerminalSyncCampaigns: true,
      expectExclusion: Boolean(pilotConfig.expectExclusion)
    }
  };

  const realFetch = window.fetch;
  let lastSyncUrl = null;
  let lastSyncHeaders = {};
  let lastRawSyncPayload = null;
  let lastSyncStatus = null;

  try {
    log('1. Inicializando interceptor DENY-BY-DEFAULT estricto...');
    // Blindar la superficie de red del renderer: deshabilitar XMLHttpRequest y WebSocket
    window.XMLHttpRequest = function() {
      log('   [DENY-BY-DEFAULT] XMLHttpRequest no autorizado en el sandbox.');
      throw new TypeError('[DENY-BY-DEFAULT] XMLHttpRequest bloqueado por política de seguridad');
    };
    if (typeof window.WebSocket !== 'undefined') {
      window.WebSocket = function() {
        log('   [DENY-BY-DEFAULT] WebSocket no autorizado en el sandbox.');
        throw new TypeError('[DENY-BY-DEFAULT] WebSocket bloqueado por política de seguridad');
      };
    }

    const ALLOWED_HOST = 'qtixbiikhvhzwshfgyeo.supabase.co';
    const ALLOWED_EDGE_PATH = '/functions/v1/terminal-sync/campaigns';
    const ALLOWED_REST_PATH = '/rest/v1/campaigns';

    window.fetch = async (input, init) => {
      const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();

      let parsedUrl;
      try {
        parsedUrl = new URL(urlStr, window.location.href);
      } catch (err) {
        log(`   [DENY-BY-DEFAULT] URL malformada bloqueada: ${urlStr}`);
        throw new TypeError(`[DENY-BY-DEFAULT] URL inválida: ${urlStr}`);
      }

      // 1. Recursos locales estrictamente necesarios (archivos de test / Vite file://)
      if (parsedUrl.protocol === 'file:') {
        return realFetch(input, init);
      }

      // 2. Validación estricta para peticiones remotas
      // Regla A: Protocolo obligatorio HTTPS
      if (parsedUrl.protocol !== 'https:') {
        log(`   [DENY-BY-DEFAULT] Protocolo inseguro bloqueado: ${parsedUrl.protocol} (${urlStr})`);
        throw new TypeError(`[DENY-BY-DEFAULT] Solo se permite HTTPS: ${urlStr}`);
      }

      // Regla B: Host exacto de Supabase (sin usar includes)
      if (parsedUrl.hostname !== ALLOWED_HOST) {
        log(`   [DENY-BY-DEFAULT] Host no autorizado bloqueado: ${parsedUrl.hostname}`);
        throw new TypeError(`[DENY-BY-DEFAULT] Host no autorizado: ${parsedUrl.hostname}`);
      }

      // Regla C: Método estrictamente GET (Prohibido POST, PUT, PATCH, DELETE)
      if (method !== 'GET') {
        log(`   [DENY-BY-DEFAULT] Método no autorizado bloqueado: ${method} en ${parsedUrl.pathname}`);
        throw new TypeError(`[DENY-BY-DEFAULT] Método no autorizado: ${method}`);
      }

      // Regla D: Rutas exactas autorizadas de campañas (sin usar includes)
      const isAllowedEdge = parsedUrl.pathname === ALLOWED_EDGE_PATH;
      const isAllowedRest = parsedUrl.pathname === ALLOWED_REST_PATH;
      if (!isAllowedEdge && !isAllowedRest) {
        log(`   [DENY-BY-DEFAULT] Ruta no autorizada bloqueada: ${parsedUrl.pathname}`);
        throw new TypeError(`[DENY-BY-DEFAULT] Ruta no autorizada: ${parsedUrl.pathname}`);
      }

      // Registrar última URL y encabezados verificados
      lastSyncUrl = urlStr;
      lastSyncHeaders = (init && init.headers) || {};

      // Impedir redirecciones arbitrarias hacia destinos no autorizados
      const strictInit = { ...(init || {}), redirect: 'error' };

      const resp = await realFetch(input, strictInit);
      if (isAllowedEdge) {
        lastSyncStatus = resp.status;
        if (resp.ok) {
          try {
            const clone = resp.clone();
            lastRawSyncPayload = await clone.json();
          } catch (e) {}
        }
      }
      return resp;
    };

    // PASO 1: Inyectar credenciales y configuración en perfil aislado
    log('2. Inyectando credenciales y configuración en perfil aislado...');
    localStorage.setItem('kioscoprox_installation_id', pilotConfig.installationId);
    await storeTerminalToken(pilotConfig.terminalToken);

    setAdConfig({
      enabled: true,
      supabaseUrl: pilotConfig.supabaseUrl,
      supabaseKey: pilotConfig.supabaseKey,
      useTerminalSyncCampaigns: true
    });

    const storedToken = await getStoredTerminalToken();
    const isTokenStored = storedToken === pilotConfig.terminalToken;
    results.step1_credentials_stored = isTokenStored;
    log('   Credencial almacenada en perfil aislado: ' + (isTokenStored ? 'OK' : 'ERROR'));

    // PASO 2 & 3: Ejecutar syncCampaignsRemotely autenticado
    log('3. Ejecutando syncCampaignsRemotely() autenticado contra terminal-sync/campaigns...');
    localStorage.removeItem('kioscoprox_offers_cache');

    const downloadedCampaigns = await syncCampaignsRemotely({
      installationId: pilotConfig.installationId
    });

    const isHttp200AndArray = Array.isArray(downloadedCampaigns) && lastSyncStatus === 200;
    results.step2_http_200_sync = Boolean(isHttp200AndArray && lastSyncUrl && lastSyncUrl.includes('/terminal-sync/campaigns'));
    
    // Validar vigencia de cada campaña devuelta
    const allActive = downloadedCampaigns.every(c => {
      const st = getCampaignStatus(c);
      return st === 'active';
    });
    results.step3_campaigns_valid = isHttp200AndArray && allActive;

    // PASO 3B: Verificación de la campaña piloto (Presencia o Exclusión según expectExclusion)
    const expectExclusion = Boolean(pilotConfig.expectExclusion);
    const PILOT_UUID = 'b2b00000-7e57-4000-8000-000000000001';

    const rawMatches = Array.isArray(lastRawSyncPayload)
      ? lastRawSyncPayload.filter(c => c.id === PILOT_UUID)
      : [];
    const clientMatches = Array.isArray(downloadedCampaigns)
      ? downloadedCampaigns.filter(c => c.id === PILOT_UUID)
      : [];
    const cachedCampaigns = getCachedCampaigns();
    const cacheMatches = Array.isArray(cachedCampaigns)
      ? cachedCampaigns.filter(c => c.id === PILOT_UUID)
      : [];

    let isPilotConditionMet = false;

    if (expectExclusion) {
      log('3b. Verificando exclusión estricta de campaña piloto por cupo agotado...');
      const rawExcluded = rawMatches.length === 0;
      const clientExcluded = clientMatches.length === 0;
      const cacheExcluded = cacheMatches.length === 0;
      const commercialPresent = downloadedCampaigns.length > 0 && allActive;

      isPilotConditionMet = isHttp200AndArray &&
        rawExcluded &&
        clientExcluded &&
        cacheExcluded &&
        commercialPresent;

      results.step3b_pilot_campaign_verified = isPilotConditionMet;
      results.step3b_pilot_campaign_excluded = isPilotConditionMet;
      log('   Campaña piloto excluida en red, cliente y caché: ' + (isPilotConditionMet ? 'OK' : 'ERROR'));
      if (!rawExcluded) log('   [FALLO EXCLUSIÓN] Campaña piloto encontrada en payload crudo de red');
      if (!clientExcluded) log('   [FALLO EXCLUSIÓN] Campaña piloto encontrada en array procesado por el cliente');
      if (!cacheExcluded) log('   [FALLO EXCLUSIÓN] Campaña piloto encontrada en caché local');
      if (!commercialPresent) log('   [FALLO EXCLUSIÓN] Campañas comerciales vigentes ausentes o inactivas');

      results.details.pilotCampaign = {
        id: PILOT_UUID,
        expectedExclusion: true,
        excludedFromRaw: rawExcluded,
        excludedFromClient: clientExcluded,
        excludedFromCache: cacheExcluded,
        commercialCampaignsActive: commercialPresent
      };
    } else {
      log('3b. Verificando presencia y configuración exacta de la campaña piloto con cupo...');
      const rawPilot = rawMatches.length === 1 ? rawMatches[0] : null;
      const clientPilot = clientMatches.length === 1 ? clientMatches[0] : null;

      const pilotPresent = rawPilot !== null && clientPilot !== null;
      const pilotStatusActive = (rawPilot?.status ?? clientPilot?.status) === 'active';
      const rawDailyLimit = rawPilot?.daily_limit ?? rawPilot?.dailyLimit ?? clientPilot?.daily_limit ?? clientPilot?.dailyLimit;
      const pilotDailyLimitIs3 = Number(rawDailyLimit) === 3;
      const rawLimitEnabled = rawPilot?.is_daily_limit_enabled ?? rawPilot?.isDailyLimitEnabled ?? clientPilot?.is_daily_limit_enabled ?? clientPilot?.isDailyLimitEnabled;
      const pilotLimitEnabled = rawLimitEnabled === true;
      const pilotVigente = clientPilot ? getCampaignStatus(clientPilot) === 'active' : false;

      isPilotConditionMet = pilotPresent &&
        pilotStatusActive &&
        pilotDailyLimitIs3 &&
        pilotLimitEnabled &&
        pilotVigente;

      results.step3b_pilot_campaign_verified = isPilotConditionMet;
      results.step3b_pilot_campaign_excluded = false;
      log('   Campaña piloto presente y verificada con cupo=3: ' + (isPilotConditionMet ? 'OK' : 'ERROR'));

      results.details.pilotCampaign = rawPilot ? {
        id: rawPilot.id,
        title: rawPilot.title,
        daily_limit: rawPilot.daily_limit ?? rawPilot.dailyLimit,
        is_daily_limit_enabled: rawPilot.is_daily_limit_enabled ?? rawPilot.isDailyLimitEnabled,
        status: rawPilot.status,
        vigente: pilotVigente
      } : null;
    }

    // PASO 4: Comprobar caché local
    log('4. Verificando persistencia en caché local...');
    const isCacheConsistent = cachedCampaigns.length === downloadedCampaigns.length &&
      JSON.stringify(cachedCampaigns.map(c => c.id)) === JSON.stringify(downloadedCampaigns.map(c => c.id));
    results.step4_cache_updated = isCacheConsistent;

    results.details.syncStats = {
      endpointCalled: lastSyncUrl,
      hasAuthHeaders: Boolean(lastSyncHeaders['x-terminal-id'] && lastSyncHeaders['x-terminal-token']),
      downloadedCount: downloadedCampaigns.length,
      cachedCount: cachedCampaigns.length,
      allVigentes: allActive,
      pilotCampaignFound: !expectExclusion && isPilotConditionMet,
      pilotCampaignExcluded: expectExclusion && isPilotConditionMet
    };

    // PASO 5: Prueba de resiliencia Offline
    log('5. Ejecutando prueba de resiliencia Offline...');
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const offlineCampaigns = await syncCampaignsRemotely({
      installationId: pilotConfig.installationId
    });

    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });

    const isOfflinePreserved = offlineCampaigns.length === cachedCampaigns.length && offlineCampaigns.length > 0;
    const offlineExclusionPreserved = expectExclusion
      ? !offlineCampaigns.some(c => c.id === PILOT_UUID)
      : true;

    results.step5_offline_resilience = isOfflinePreserved && offlineExclusionPreserved;
    log('   Caché preservado en modo offline: ' + (results.step5_offline_resilience ? 'OK' : 'ERROR'));
    if (expectExclusion && !offlineExclusionPreserved) {
      log('   [FALLO OFFLINE] Modo offline reintrodujo la campaña piloto');
    }

    // PASO 6: Reversión a modo legacy
    log('6. Verificando reversión limpia a modo legacy (useTerminalSyncCampaigns = false)...');
    setAdConfig({
      enabled: true,
      supabaseUrl: pilotConfig.supabaseUrl,
      supabaseKey: pilotConfig.supabaseKey,
      useTerminalSyncCampaigns: false
    });

    await syncCampaignsRemotely({ installationId: pilotConfig.installationId });
    const isRevertedToLegacy = lastSyncUrl && lastSyncUrl.includes('/rest/v1/campaigns');
    results.step6_legacy_reversion = Boolean(isRevertedToLegacy);
    log('   Ruta revertida a REST legacy: ' + (isRevertedToLegacy ? 'OK' : 'ERROR'));

  } catch (err) {
    log('ERROR EN RUNNER SUITE: ' + err.message);
    results.error = err.message;
  } finally {
    window.fetch = realFetch;
  }

  const allPassed = results.step1_credentials_stored &&
    results.step2_http_200_sync &&
    results.step3_campaigns_valid &&
    results.step3b_pilot_campaign_verified &&
    results.step4_cache_updated &&
    results.step5_offline_resilience &&
    results.step6_legacy_reversion;

  return {
    success: allPassed,
    results,
    logs
  };
};
