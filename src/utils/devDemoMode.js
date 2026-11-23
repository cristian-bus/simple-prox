// Módulo Auxiliar de Modo Demostración Local (Solo Desarrollo)
// Simple ProX - Excluido de builds de producción mediante dead-code elimination (import.meta.env.DEV)

import { generate5MonthsDemoData } from './demoDataGenerator.js';

const DEMO_STORAGE_FLAG = 'kioscoprox_demo_active';

// Campañas B2B simuladas locales para probar visualmente la publicidad inteligente en el POS
export const DEMO_MOCK_CAMPAIGNS = [
  {
    id: 'demo-b2b-sidra',
    title: 'Oferta Sidra Real',
    supplier_name: 'Distribuidora Cuyo Mayorista',
    category: 'Bebidas',
    price: 3000,
    regular_price: 3800,
    status: 'active',
    banner_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><defs><linearGradient id="gs" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2315803d"/><stop offset="100%" stop-color="%2322c55e"/></linearGradient></defs><rect width="800" height="400" fill="url(%23gs)" rx="16"/><text x="40" y="90" font-family="sans-serif" font-size="34" font-weight="bold" fill="%23ffffff">🍎 OFERTA INTELIGENTE B2B</text><text x="40" y="150" font-family="sans-serif" font-size="44" font-weight="900" fill="%23fef08a">SIDRA REAL 750ml</text><text x="40" y="210" font-family="sans-serif" font-size="24" fill="%23dcfce7">Precio especial por reposición de stock</text><rect x="40" y="260" width="300" height="70" rx="12" fill="%23166534"/><text x="70" y="305" font-family="sans-serif" font-size="24" font-weight="bold" fill="%23ffffff">PEDIR POR WHATSAPP</text><text x="500" y="280" font-family="sans-serif" font-size="48" font-weight="900" fill="%23ffffff">$3.000</text><text x="500" y="320" font-family="sans-serif" font-size="22" text-decoration="line-through" fill="%23bbf7d0">$3.800</text></svg>',
    description: 'Oferta mayorista especial para kioscos: Sidra Real 750ml.\n<!--B2B_META:{"minPurchase":6,"minPurchaseType":"unidades","conditions":"Pago contado contra entrega","targetProvinces":["ALL"],"isSmartAdvertising":true}-->',
    whatsapp_number: '5491100000000',
    cta_text: 'Pedir por WhatsApp',
    start_date: '2026-01-01',
    end_date: '2026-12-31'
  },
  {
    id: 'demo-b2b-01',
    title: 'Promo Kiosquera: Quilmes Clásica 1L',
    supplier_name: 'Cervecería Quilmes Distribuidora',
    category: 'Bebidas',
    price: 15500,
    regular_price: 19000,
    status: 'active',
    banner_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%231e3a8a"/><stop offset="100%" stop-color="%230284c7"/></linearGradient></defs><rect width="800" height="400" fill="url(%23g1)" rx="16"/><text x="40" y="90" font-family="sans-serif" font-size="34" font-weight="bold" fill="%23ffffff">🍺 PROMO KIOSQUERA B2B</text><text x="40" y="150" font-family="sans-serif" font-size="44" font-weight="900" fill="%23fbbf24">QUILMES CLÁSICA 1L</text><text x="40" y="210" font-family="sans-serif" font-size="24" fill="%23e0f2fe">Llevando 5 cajones o más • Bonificación 18%</text><rect x="40" y="260" width="300" height="70" rx="12" fill="%2322c55e"/><text x="70" y="305" font-family="sans-serif" font-size="24" font-weight="bold" fill="%23ffffff">PEDIR POR WHATSAPP</text><text x="500" y="280" font-family="sans-serif" font-size="48" font-weight="900" fill="%23ffffff">$15.500</text><text x="500" y="320" font-family="sans-serif" font-size="22" text-decoration="line-through" fill="%2393c5fd">$19.000</text></svg>',
    description: 'Promoción mayorista para kioscos y despensas. Bonificación del 18% comprando a partir de 5 cajones. Entrega garantizada en 24 horas hábiles directamente en el comercio.\n<!--B2B_META:{"minPurchase":5,"minPurchaseType":"cajones","conditions":"Entrega sin cargo en radio comercial","targetProvinces":["ALL"],"isSmartAdvertising":false}-->',
    whatsapp_number: '5491100000000',
    cta_text: 'Pedir por WhatsApp',
    start_date: '2026-01-01',
    end_date: '2026-12-31'
  },
  {
    id: 'demo-b2b-02',
    title: 'Pallet Mayorista: Coca-Cola 2.25L Sabor Original',
    supplier_name: 'Coca Cola Femsa',
    category: 'Bebidas',
    price: 18200,
    regular_price: 22800,
    status: 'active',
    banner_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><defs><linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23991b1b"/><stop offset="100%" stop-color="%23dc2626"/></linearGradient></defs><rect width="800" height="400" fill="url(%23g2)" rx="16"/><text x="40" y="90" font-family="sans-serif" font-size="34" font-weight="bold" fill="%23ffffff">🥤 OFERTA OFICIAL FEMSA</text><text x="40" y="150" font-family="sans-serif" font-size="44" font-weight="900" fill="%23ffffff">COCA-COLA 2.25L x 8 PACKS</text><text x="40" y="210" font-family="sans-serif" font-size="24" fill="%23fecaca">Precio especial de reposición semanal para comercios</text><rect x="40" y="260" width="300" height="70" rx="12" fill="%2322c55e"/><text x="70" y="305" font-family="sans-serif" font-size="24" font-weight="bold" fill="%23ffffff">CONSULTAR OFERTA</text><text x="500" y="280" font-family="sans-serif" font-size="48" font-weight="900" fill="%23ffffff">$18.200</text><text x="500" y="320" font-family="sans-serif" font-size="22" text-decoration="line-through" fill="%23fca5a5">$22.800</text></svg>',
    description: 'Pack mayorista de Coca-Cola 2.25L Sabor Original x 8 bultos. Descuento exclusivo para terminales Simple ProX conectadas.\n<!--B2B_META:{"minPurchase":1,"minPurchaseType":"pallet","conditions":"Pago contado / transferencia al recibir","targetProvinces":["ALL"],"isSmartAdvertising":false}-->',
    whatsapp_number: '5491100000000',
    cta_text: 'Pedir por WhatsApp',
    start_date: '2026-01-01',
    end_date: '2026-12-31'
  },
  {
    id: 'demo-b2b-03',
    title: 'Display Mostrador: Alfajores Guaymallén Triple x 40u',
    supplier_name: 'Distribuidora Don Pedro',
    category: 'Golosinas',
    price: 9800,
    regular_price: 12500,
    status: 'active',
    banner_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><defs><linearGradient id="g3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23854d0e"/><stop offset="100%" stop-color="%23d97706"/></linearGradient></defs><rect width="800" height="400" fill="url(%23g3)" rx="16"/><text x="40" y="90" font-family="sans-serif" font-size="34" font-weight="bold" fill="%23ffffff">🍫 MÁXIMA ROTACIÓN</text><text x="40" y="150" font-family="sans-serif" font-size="44" font-weight="900" fill="%23fef08a">GUAYMALLÉN TRIPLE x 40</text><text x="40" y="210" font-family="sans-serif" font-size="24" fill="%23fef9c3">Display de mostrador listo para venta</text><rect x="40" y="260" width="300" height="70" rx="12" fill="%2322c55e"/><text x="70" y="305" font-family="sans-serif" font-size="24" font-weight="bold" fill="%23ffffff">PEDIR AHORA</text><text x="500" y="280" font-family="sans-serif" font-size="48" font-weight="900" fill="%23ffffff">$9.800</text><text x="500" y="320" font-family="sans-serif" font-size="22" text-decoration="line-through" fill="%23fde68a">$12.500</text></svg>',
    description: 'Caja expositora de 40 unidades de alfajores Guaymallén Triple Chocolate. Margen comercial superior al 65% en reventa unitaria.\n<!--B2B_META:{"minPurchase":2,"minPurchaseType":"cajas","conditions":"Entrega semanal coordinada","targetProvinces":["ALL"],"isSmartAdvertising":false}-->',
    whatsapp_number: '5491100000000',
    cta_text: 'Pedir por WhatsApp',
    start_date: '2026-01-01',
    end_date: '2026-12-31'
  }
];

export function isLocalDemoActive() {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return false;
  try {
    return sessionStorage.getItem(DEMO_STORAGE_FLAG) === 'true';
  } catch {
    return false;
  }
}

export function startLocalDemo() {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return;
  try {
    sessionStorage.setItem(DEMO_STORAGE_FLAG, 'true');

    // Cargar datos demo en sessionStorage (completamente aislado de localStorage normal)
    const demo = generate5MonthsDemoData();
    
    // Inyectar producto simulado del escenario de prueba: Sidras (stock 2, mínimo 5)
    const demoProducts = [
      {
        id: 'demo-prod-sidras',
        name: 'Sidras',
        barcode: '779000000001',
        category: 'Bebidas',
        cost: 2000,
        price: 3500,
        stock: 2,
        stockAlert: 5,
        isActive: true
      },
      ...demo.products
    ];

    sessionStorage.setItem('kioscoprox_products', JSON.stringify(demoProducts));
    sessionStorage.setItem('kioscoprox_sales', JSON.stringify(demo.sales));
    sessionStorage.setItem('kioscoprox_purchases', JSON.stringify(demo.purchases));
    sessionStorage.setItem('kioscoprox_clients', JSON.stringify(demo.clients));
    sessionStorage.setItem('kioscoprox_caja', JSON.stringify({ isOpen: true, efectivo: 25000, openedAt: new Date().toISOString() }));
    sessionStorage.setItem('kioscoprox_shifts', JSON.stringify(demo.shifts));
    sessionStorage.setItem('kioscoprox_categories', JSON.stringify(demo.categoryTree));
    sessionStorage.setItem('kioscoprox_suppliers', JSON.stringify(demo.suppliers));
    sessionStorage.setItem('kioscoprox_users', JSON.stringify([
      { id: 1, name: "Operador Demo", email: "", role: "Admin", pin: "1234", isActive: true }
    ]));
    sessionStorage.setItem('kioscoprox_business_config', JSON.stringify({
      isActivated: true,
      isOnboarded: true,
      storeName: 'Kiosco Demo Local',
      cuit: '20-99999999-9',
      country: 'Argentina',
      businessType: 'kiosco',
      plan: 'Básico',
      installationId: 'DEV-DEMO-LOCAL-001',
      address: 'Av. Corrientes 1234 (Modo Prueba)',
      phone: '11 5555-5555',
      provinceCode: 'AR-D',
      provinceName: 'San Luis',
      cityCode: 'SL-CAPITAL',
      cityName: 'San Luis Capital'
    }));
    sessionStorage.setItem('kioscoprox_b2b_campaigns', JSON.stringify(DEMO_MOCK_CAMPAIGNS));
    sessionStorage.setItem('kioscoprox_ad_config', JSON.stringify({
      supabaseUrl: 'https://qtixbiikhvhzwshfgyeo.supabase.co',
      supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0aXhiaWlraHZoendzaGZneWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTU1OTIsImV4cCI6MjEwMzE5MTU5Mn0.VxLd2eJChGHmTDuQT72mtHILUC6iWDAUVgH4ak1OHHE',
      enabled: true
    }));
    sessionStorage.setItem('kioscoprox_commerce_profile', JSON.stringify({
      installationId: 'DEV-DEMO-LOCAL-001',
      storeName: 'Kiosco Demo Local',
      businessType: 'kiosco',
      provinceCode: 'AR-D',
      provinceName: 'San Luis',
      cityCode: 'SL-CAPITAL',
      cityName: 'San Luis Capital'
    }));

    window.location.reload();
  } catch (err) {
    console.error('[devDemoMode] Error iniciando modo demo:', err);
  }
}

export function stopLocalDemo() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(DEMO_STORAGE_FLAG);
    // Remover únicamente las claves de Simple ProX para no alterar datos de sesión ajenos a la prueba
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('kioscoprox_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
    window.location.reload();
  } catch (err) {
    console.error('[devDemoMode] Error deteniendo modo demo:', err);
  }
}

// Instalar interceptores de aislamiento (Solo en desarrollo)
export function initDevDemoMode() {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return;

  // 1. Interceptar Storage: Redirigir claves kioscoprox_* a sessionStorage durante la sesión demo
  const origGetItem = Storage.prototype.getItem;
  const origSetItem = Storage.prototype.setItem;
  const origRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.getItem = function (key) {
    if (this === window.localStorage && isLocalDemoActive() && typeof key === 'string' && key.startsWith('kioscoprox_')) {
      const val = sessionStorage.getItem(key);
      return val;
    }
    return origGetItem.call(this, key);
  };

  Storage.prototype.setItem = function (key, value) {
    if (this === window.localStorage && isLocalDemoActive() && typeof key === 'string' && key.startsWith('kioscoprox_')) {
      return sessionStorage.setItem(key, value);
    }
    return origSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function (key) {
    if (this === window.localStorage && isLocalDemoActive() && typeof key === 'string' && key.startsWith('kioscoprox_')) {
      return sessionStorage.removeItem(key);
    }
    return origRemoveItem.call(this, key);
  };

  // 2. Interceptar red (fetch): Servir mock local de campañas y bloquear 100% de escrituras y Edge Functions
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const method = (init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();

    if (isLocalDemoActive() && (url.includes('supabase.co') || url.includes('/functions/v1/'))) {
      const isPublicCampaignsGet = method === 'GET' && (url.includes('/rest/v1/campaigns') || url.includes('/campaigns?select=*') || url.includes('/campaigns'));

      if (isPublicCampaignsGet) {
        console.info('[DEMO MODE] Retornando campañas simuladas mock (aislamiento total sin consultar Supabase)');
        return new Response(JSON.stringify(DEMO_MOCK_CAMPAIGNS), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.warn(`[DEMO MODE] Solicitud remota ${method} bloqueada por seguridad:`, url);
      return new Response(JSON.stringify({ success: true, mocked: true, message: 'Operación remota bloqueada en modo demo' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return origFetch.apply(this, arguments);
  };

  // 3. Interceptar WhatsApp (window.open): Simular envío sin abrir clientes reales
  const origOpen = window.open;
  window.open = function (url, target, features) {
    if (isLocalDemoActive() && typeof url === 'string' && (url.includes('whatsapp.com') || url.includes('wa.me'))) {
      console.info('[DEMO MODE] WhatsApp interceptado y simulado:', url);
      alert(`[MODO DEMOSTRACIÓN]\nSimulación de pedido B2B por WhatsApp.\n(No se contactó a ningún número real ni se abrió WhatsApp).\n\nEnlace generado:\n${url}`);
      return null;
    }
    return origOpen.apply(this, arguments);
  };

  // 4. Helper de consola para ajustar interactivamente el stock de Sidras en la prueba visual
  window.setDemoSidrasStock = (newStock) => {
    try {
      const prods = JSON.parse(sessionStorage.getItem('kioscoprox_products') || '[]');
      const sidra = prods.find(p => p.id === 'demo-prod-sidras' || p.name.toLowerCase() === 'sidras');
      if (sidra) {
        sidra.stock = Number(newStock);
        sessionStorage.setItem('kioscoprox_products', JSON.stringify(prods));
        console.log(`[DEMO MODE] Stock de Sidras actualizado a ${newStock}. Recargando interfaz...`);
        window.location.reload();
      }
    } catch (e) {
      console.error('[devDemoMode] Error actualizando stock simulado:', e);
    }
  };

  console.info('[devDemoMode] Puente de desarrollo inicializado con aislamiento total.');
}
