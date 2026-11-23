/**
 * SIMPLE PROX - Validación Local de Escenarios de la Suite (Modo Cupo Agotado vs Presencia)
 * FASE 5C.5F.6B
 * 
 * Ejecuta pruebas unitarias 100% locales simuladas (sin red, sin Supabase, sin Electron).
 * Verifica los 7 escenarios requeridos por AGENTS.md para validar que la suite discrimina
 * correctamente entre presencia y exclusión estricta en red, cliente y caché.
 */

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

console.log('=== TEST UNITARIO LOCAL: ESCENARIOS DE SUITE (EXCLUSIÓN VS PRESENCIA) ===\n');

const bundleCode = fs.readFileSync('tests/test_pilot_campaigns_bundle.js', 'utf8');

const PILOT_UUID = 'b2b00000-7e57-4000-8000-000000000001';

const sampleCommercialCampaign = {
  id: '00000000-0000-4000-a000-000000000001',
  title: 'Comercial Vigente',
  status: 'active',
  is_daily_limit_enabled: false,
  start_date: '2026-01-01T00:00:00Z',
  end_date: '2026-12-31T23:59:59Z'
};

const samplePilotCampaign = {
  id: PILOT_UUID,
  title: '[TEST-PILOTO] Campaña de Prueba Cupo Diario',
  status: 'active',
  daily_limit: 3,
  is_daily_limit_enabled: true,
  start_date: '2026-01-01T00:00:00Z',
  end_date: '2026-12-31T23:59:59Z'
};

function createMockEnvironment(options = {}) {
  const {
    networkCampaigns = [],
    initialCache = [],
    httpOk = true,
    httpStatus = 200
  } = options;

  const storage = {};
  if (initialCache.length > 0) {
    storage['kioscoprox_offers_cache'] = JSON.stringify(initialCache);
  }

  const mockLocalStorage = {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };

  const win = {
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: 'https://localhost/test' },
    localStorage: mockLocalStorage,
    navigator: { onLine: true },
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    URL: URL,
    TypeError: TypeError,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: () => {},
    clearInterval: () => {},
    fetch: async (url, init) => {
      const urlStr = String(url);
      const makeResp = (data, ok = true, status = 200) => {
        const r = {
          ok,
          status,
          json: async () => JSON.parse(JSON.stringify(data)),
          text: async () => JSON.stringify(data),
          clone: () => makeResp(data, ok, status)
        };
        return r;
      };

      if (urlStr.includes('/terminal-sync/campaigns')) {
        if (!httpOk) {
          return makeResp({ error: 'Unauthorized' }, false, httpStatus);
        }
        return makeResp(networkCampaigns, true, 200);
      }
      if (urlStr.includes('/rest/v1/campaigns')) {
        return makeResp(networkCampaigns, true, 200);
      }
      return makeResp({}, true, 200);
    }
  };
  win.window = win;

  const ctx = vm.createContext(win);
  vm.runInContext(bundleCode, ctx);
  return win;
}

async function runTests() {
  let passedCount = 0;

  // Escenario A: expectExclusion=true y piloto ausente -> PASS
  {
    console.log('1. Escenario A: expectExclusion=true y piloto ausente...');
    const win = createMockEnvironment({
      networkCampaigns: [sampleCommercialCampaign]
    });
    const res = await win.__RUN_PILOT_CAMPAIGNS_TEST({
      installationId: 'test_inst_01',
      terminalToken: 'spx_term_valid_test_token_1234567890',
      expectExclusion: true
    });
    assert.strictEqual(res.success, true, 'Escenario A debe ser PASS');
    assert.strictEqual(res.results.step3b_pilot_campaign_verified, true);
    assert.strictEqual(res.results.step3b_pilot_campaign_excluded, true);
    assert.strictEqual(res.results.details.pilotCampaign.excludedFromRaw, true);
    assert.strictEqual(res.results.details.pilotCampaign.excludedFromClient, true);
    assert.strictEqual(res.results.details.pilotCampaign.excludedFromCache, true);
    console.log('   -> PASS');
    passedCount++;
  }

  // Escenario B: expectExclusion=true y piloto presente en red -> FAIL
  {
    console.log('2. Escenario B: expectExclusion=true y piloto presente en red...');
    const win = createMockEnvironment({
      networkCampaigns: [sampleCommercialCampaign, samplePilotCampaign]
    });
    const res = await win.__RUN_PILOT_CAMPAIGNS_TEST({
      installationId: 'test_inst_01',
      terminalToken: 'spx_term_valid_test_token_1234567890',
      expectExclusion: true
    });
    assert.strictEqual(res.success, false, 'Escenario B debe ser FAIL');
    assert.strictEqual(res.results.step3b_pilot_campaign_verified, false);
    assert.strictEqual(res.results.details.pilotCampaign.excludedFromRaw, false);
    console.log('   -> PASS (Rechazado correctamente)');
    passedCount++;
  }

  // Escenario C: expectExclusion=true y piloto presente en caché local -> FAIL
  {
    console.log('3. Escenario C: expectExclusion=true y piloto en caché local...');
    // Simulamos que por alguna razón getCachedCampaigns() sigue conteniendo al piloto
    const win = createMockEnvironment({
      networkCampaigns: [sampleCommercialCampaign]
    });
    // Forzamos inyección en caché después de la descarga
    const origSet = win.localStorage.setItem;
    win.localStorage.setItem = (k, v) => {
      if (k === 'kioscoprox_offers_cache') {
        const parsed = JSON.parse(v);
        parsed.push(samplePilotCampaign);
        origSet(k, JSON.stringify(parsed));
      } else {
        origSet(k, v);
      }
    };
    const res = await win.__RUN_PILOT_CAMPAIGNS_TEST({
      installationId: 'test_inst_01',
      terminalToken: 'spx_term_valid_test_token_1234567890',
      expectExclusion: true
    });
    assert.strictEqual(res.success, false, 'Escenario C debe ser FAIL si la caché contiene el piloto');
    assert.strictEqual(res.results.details.pilotCampaign.excludedFromCache, false);
    console.log('   -> PASS (Rechazado correctamente)');
    passedCount++;
  }

  // Escenario D: expectExclusion=false y piloto presente correctamente -> PASS
  {
    console.log('4. Escenario D: expectExclusion=false y piloto presente...');
    const win = createMockEnvironment({
      networkCampaigns: [sampleCommercialCampaign, samplePilotCampaign]
    });
    const res = await win.__RUN_PILOT_CAMPAIGNS_TEST({
      installationId: 'test_inst_01',
      terminalToken: 'spx_term_valid_test_token_1234567890',
      expectExclusion: false
    });
    assert.strictEqual(res.success, true, 'Escenario D debe ser PASS');
    assert.strictEqual(res.results.step3b_pilot_campaign_verified, true);
    assert.strictEqual(res.results.details.pilotCampaign.id, PILOT_UUID);
    assert.strictEqual(res.results.details.pilotCampaign.daily_limit, 3);
    console.log('   -> PASS');
    passedCount++;
  }

  // Escenario E: expectExclusion=false y piloto ausente -> FAIL
  {
    console.log('5. Escenario E: expectExclusion=false y piloto ausente...');
    const win = createMockEnvironment({
      networkCampaigns: [sampleCommercialCampaign]
    });
    const res = await win.__RUN_PILOT_CAMPAIGNS_TEST({
      installationId: 'test_inst_01',
      terminalToken: 'spx_term_valid_test_token_1234567890',
      expectExclusion: false
    });
    assert.strictEqual(res.success, false, 'Escenario E debe ser FAIL');
    assert.strictEqual(res.results.step3b_pilot_campaign_verified, false);
    console.log('   -> PASS (Rechazado correctamente)');
    passedCount++;
  }

  // Escenario F: Campañas comerciales ausentes -> FAIL
  {
    console.log('6. Escenario F: Campañas comerciales ausentes...');
    const win = createMockEnvironment({
      networkCampaigns: [] // Array vacío
    });
    const res = await win.__RUN_PILOT_CAMPAIGNS_TEST({
      installationId: 'test_inst_01',
      terminalToken: 'spx_term_valid_test_token_1234567890',
      expectExclusion: true
    });
    assert.strictEqual(res.success, false, 'Escenario F debe ser FAIL cuando no hay comerciales');
    console.log('   -> PASS (Rechazado correctamente)');
    passedCount++;
  }

  // Escenario G: Fallo de HTTP / Autenticación -> FAIL
  {
    console.log('7. Escenario G: Fallo de HTTP / Autenticación 401...');
    const win = createMockEnvironment({
      networkCampaigns: [sampleCommercialCampaign],
      httpOk: false,
      httpStatus: 401
    });
    const res = await win.__RUN_PILOT_CAMPAIGNS_TEST({
      installationId: 'test_inst_01',
      terminalToken: 'spx_term_valid_test_token_1234567890',
      expectExclusion: true
    });
    assert.strictEqual(res.success, false, 'Escenario G debe ser FAIL');
    assert.strictEqual(res.results.step2_http_200_sync, false);
    console.log('   -> PASS (Rechazado correctamente)');
    passedCount++;
  }

  // Escenario Extra: Modo Offline no debe reintroducir la campaña piloto
  {
    console.log('8. Escenario Extra: Resiliencia Offline sin reintroducción de piloto...');
    const win = createMockEnvironment({
      networkCampaigns: [sampleCommercialCampaign]
    });
    const res = await win.__RUN_PILOT_CAMPAIGNS_TEST({
      installationId: 'test_inst_01',
      terminalToken: 'spx_term_valid_test_token_1234567890',
      expectExclusion: true
    });
    assert.strictEqual(res.results.step5_offline_resilience, true, 'Modo offline debe preservar caché excluyendo al piloto');
    console.log('   -> PASS');
    passedCount++;
  }

  console.log(`\n=== TODOS LOS ESCENARIOS LOCALES COMPLETADOS EXITOSAMENTE (${passedCount}/8) ===`);
}

runTests().catch(err => {
  console.error('\n[ERROR EN TEST]:', err);
  process.exit(1);
});
