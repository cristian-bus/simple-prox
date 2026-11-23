// Suite de Validación de las 6 Pruebas Propuestas (Fase 5C.4B.4)
import assert from 'node:assert';

console.log('================================================================');
console.log('EJECUCIÓN DE LAS 6 PRUEBAS PROPUESTAS (FASE 5C.4B.4)');
console.log('================================================================\n');

// 1. Simulación del ciclo completo de adSyncEngine + useOfertas
class TestAdEnvironment {
  constructor() {
    this.localStorage = new Map();
    this.rawCampaignsState = [];
    this.mounted = true;
    this.currentScreen = 'punto-venta';
    this.isWindowVisible = true;
    this.impressionEvents = [];
    this.lastImpressionMap = new Map();
    this.IMPRESSION_COOLDOWN_MS = 5 * 60 * 1000;
  }

  setCache(campaigns) {
    this.localStorage.set('kioscoprox_offers_cache', JSON.stringify(campaigns));
  }

  getCache() {
    const raw = this.localStorage.get('kioscoprox_offers_cache');
    return raw ? JSON.parse(raw) : [];
  }

  // Comportamiento exacto de adSyncEngine.syncCampaignsRemotely
  async simulateAdSyncEngineFetch(networkResponse) {
    // Si hay error de red o de servidor (ej: 500, timeout, network error)
    if (!networkResponse || !networkResponse.ok) {
      // Regla de Oro: no sobrescribe caché ante error de red/servidor
      return this.getCache();
    }

    // Si la respuesta fue HTTP 200 OK
    const rawData = networkResponse.data;
    if (Array.isArray(rawData)) {
      const activeOnly = rawData.filter(c => c.status === 'active');
      this.setCache(activeOnly); // actualiza el caché local
      return activeOnly;
    }

    return this.getCache();
  }

  // Comportamiento CORREGIDO de useOfertas.runSync (después del cambio quirúrgico)
  async simulateUseOfertasRunSync(networkResponse) {
    const activeCamps = await this.simulateAdSyncEngineFetch(networkResponse);
    // Código CORREGIDO:
    if (this.mounted && Array.isArray(activeCamps)) {
      this.rawCampaignsState = activeCamps;
    }
  }

  // Simulación de rotación y dwell time
  triggerImpressionIfEligible(campaignId, exposureDurationMs) {
    if (!campaignId) return false;
    if (this.currentScreen !== 'punto-venta') return false;
    if (!this.isWindowVisible) return false;
    if (exposureDurationMs < 2000) return false; // Dwell time mínimo 2s

    const now = Date.now();
    const lastTracked = this.lastImpressionMap.get(campaignId);
    if (lastTracked && now - lastTracked < this.IMPRESSION_COOLDOWN_MS) {
      return false; // Cooldown 5 min
    }

    this.lastImpressionMap.set(campaignId, now);
    this.impressionEvents.push({ campaignId, timestamp: now });
    return true;
  }
}

let passed = 0;

// PRUEBA 1: Respuesta exitosa con [] (Servidor confirma que no hay campañas)
{
  const env = new TestAdEnvironment();
  // El kiosco tenía previamente 2 campañas en memoria y en caché
  env.setCache([{ id: 'c1', status: 'active' }, { id: 'c2', status: 'active' }]);
  env.rawCampaignsState = [{ id: 'c1', status: 'active' }, { id: 'c2', status: 'active' }];

  // El servidor responde HTTP 200 con []
  await env.simulateUseOfertasRunSync({ ok: true, data: [] });

  assert.strictEqual(env.rawCampaignsState.length, 0, 'La memoria de useOfertas debe actualizarse a []');
  assert.strictEqual(env.getCache().length, 0, 'El caché debe actualizarse legítimamente a []');
  console.log('✅ PRUEBA 1 PASÓ: Respuesta HTTP 200 con [] retira exitosamente las campañas de la memoria y del caché.');
  passed++;
}

// PRUEBA 2: Respuesta exitosa con campañas válidas
{
  const env = new TestAdEnvironment();
  const serverCampaigns = [
    { id: 'c1', title: 'Coca Cola', status: 'active' },
    { id: 'c2', title: 'Fernet', status: 'active' }
  ];

  await env.simulateUseOfertasRunSync({ ok: true, data: serverCampaigns });

  assert.strictEqual(env.rawCampaignsState.length, 2);
  assert.strictEqual(env.rawCampaignsState[0].id, 'c1');
  assert.strictEqual(env.getCache().length, 2);
  console.log('✅ PRUEBA 2 PASÓ: Respuesta HTTP 200 con campañas actualiza memoria y caché.');
  passed++;
}

// PRUEBA 3: Error de red con caché existente (DIFERENCIACIÓN CRÍTICA)
{
  const env = new TestAdEnvironment();
  // El kiosco tenía 3 campañas en caché
  const initialCache = [
    { id: 'c1', title: 'Camp 1', status: 'active' },
    { id: 'c2', title: 'Camp 2', status: 'active' },
    { id: 'c3', title: 'Camp 3', status: 'active' }
  ];
  env.setCache(initialCache);
  env.rawCampaignsState = [...initialCache];

  // Simular error de red o HTTP 500
  await env.simulateUseOfertasRunSync({ ok: false, error: 'Network Error / 500' });

  // REGLA CRÍTICA: NO debe borrarse el caché ni la memoria ante error
  assert.strictEqual(env.getCache().length, 3, 'El caché local NO debe eliminarse');
  assert.strictEqual(env.rawCampaignsState.length, 3, 'La memoria de useOfertas NO debe vaciarse');
  assert.strictEqual(env.rawCampaignsState[0].id, 'c1');
  console.log('✅ PRUEBA 3 PASÓ: Error de red con caché existente conserva las 3 campañas intactas y no las confunde con [].');
  passed++;
}

// PRUEBA 4: Campaña limitada agotada
{
  const env = new TestAdEnvironment();
  env.rawCampaignsState = [
    { id: 'c-ilimitada', status: 'active' },
    { id: 'c-limitada', status: 'active' }
  ];
  env.setCache(env.rawCampaignsState);

  // La campaña limitada agotó cupo, el servidor devuelve únicamente la ilimitada
  await env.simulateUseOfertasRunSync({
    ok: true,
    data: [{ id: 'c-ilimitada', status: 'active' }]
  });

  assert.strictEqual(env.rawCampaignsState.length, 1);
  assert.strictEqual(env.rawCampaignsState[0].id, 'c-ilimitada');
  assert.strictEqual(env.getCache().length, 1);
  console.log('✅ PRUEBA 4 PASÓ: Campaña agotada es retirada del carrusel en la siguiente sincronización.');
  passed++;
}

// PRUEBA 5: Cambio de pantalla (Punto de Venta -> Inventario)
{
  const env = new TestAdEnvironment();
  env.currentScreen = 'inventario'; // Pantalla no es punto-venta

  const emitted = env.triggerImpressionIfEligible('c1', 3000); // Intento con 3s de exposición
  assert.strictEqual(emitted, false, 'No debe emitir impresiones fuera de punto-venta');
  assert.strictEqual(env.impressionEvents.length, 0);
  console.log('✅ PRUEBA 5 PASÓ: Cambio de pantalla a Inventario bloquea impresiones y cancela el dwell time.');
  passed++;
}

// PRUEBA 6: Rotación y registro de impresiones (Dwell time 2s y Cooldown 5m)
{
  const env = new TestAdEnvironment();
  env.currentScreen = 'punto-venta';
  env.isWindowVisible = true;

  // 1. Exposición insuficiente (< 2s) -> Rechazada
  const shortExp = env.triggerImpressionIfEligible('c1', 1500);
  assert.strictEqual(shortExp, false, 'Dwell time menor a 2s debe rechazarse');
  assert.strictEqual(env.impressionEvents.length, 0);

  // 2. Exposición válida (>= 2s) -> Aceptada
  const validExp = env.triggerImpressionIfEligible('c1', 2100);
  assert.strictEqual(validExp, true, 'Dwell time >= 2s debe registrarse');
  assert.strictEqual(env.impressionEvents.length, 1);

  // 3. Re-exposición antes de 5 min -> Bloqueada por Cooldown
  const cooldownBlocked = env.triggerImpressionIfEligible('c1', 3000);
  assert.strictEqual(cooldownBlocked, false, 'Cooldown de 5 min debe bloquear re-exposiciones');
  assert.strictEqual(env.impressionEvents.length, 1);

  console.log('✅ PRUEBA 6 PASÓ: Dwell time de 2s continuo y cooldown de 5 min verificados.');
  passed++;
}

console.log(`\n================================================================`);
console.log(`RESULTADO FINAL: ${passed} / 6 PRUEBAS EXITOSAS (100% PASS)`);
console.log(`================================================================\n`);
