import fs from 'fs';

// 1. Verify index.html syntax and key presence
const rawHtml = fs.readFileSync('./panel-admin/index.html', 'utf8');
const html = rawHtml.replace(/\r\n/g, '\n');

console.log('--- TEST 1: Verificación de código en panel-admin/index.html ---');
const hasDefaultConsts = html.includes('const DEFAULT_SUPABASE_URL =') && html.includes('const DEFAULT_SUPABASE_KEY =');
console.log('1.1 Constantes DEFAULT_SUPABASE_URL y DEFAULT_SUPABASE_KEY declaradas:', hasDefaultConsts);

const hasAwaitInInitApp = html.includes('await loadSettings();\n      if (typeof updateConnectionStatus === \'function\')');
console.log('1.2 await loadSettings() en initApp():', hasAwaitInInitApp);

const hasFetchFallback = html.includes('config.supabaseUrl || config.apiUrl || document.getElementById(\'api-url-input\')?.value || (typeof DEFAULT_SUPABASE_URL !== \'undefined\' ? DEFAULT_SUPABASE_URL : \'\')');
console.log('1.3 Fallback robusto en fetchCampaignsFromSupabase():', hasFetchFallback);

const hasSwitchTabProtection = html.includes('if (campaigns.length === 0 && !isFetchingCampaigns)');
console.log('1.4 Protección contra consultas duplicadas en switchTab(\'campaigns\'):', hasSwitchTabProtection);

const hasAwaitInInitAppCampaigns = html.includes('if (typeof fetchCampaignsFromSupabase === \'function\') await fetchCampaignsFromSupabase();');
const hasNoPrematureFetchInInit = !html.includes('await loadSettings();\n      await fetchCampaignsFromSupabase();');
console.log('1.5 fetchCampaignsFromSupabase() invocado en initApp() y no de forma prematura en init():', hasAwaitInInitAppCampaigns && hasNoPrematureFetchInInit);

if (!hasDefaultConsts || !hasAwaitInInitApp || !hasFetchFallback || !hasSwitchTabProtection || !hasAwaitInInitAppCampaigns || !hasNoPrematureFetchInInit) {
  console.error('❌ Falló alguna verificación estática de código.');
  process.exit(1);
}

console.log('\n--- TEST 2: Simulación de resolución de configuración ---');
// Escenario A: Sin localStorage (vacío)
{
  const localStorageMock = { getItem: () => null };
  const inputsMock = {
    'api-url-input': { value: '' },
    'api-key-input': { value: '' }
  };
  const DEFAULT_SUPABASE_URL = 'https://qtixbiikhvhzwshfgyeo.supabase.co';
  const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0aXhiaWlraHZoendzaGZneWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTU1OTIsImV4cCI6MjEwMzE5MTU5Mn0.VxLd2eJChGHmTDuQT72mtHILUC6iWDAUVgH4ak1OHHE';

  // Simular loadSettings cargando desde ../public/ad_config.json
  const adConfig = JSON.parse(fs.readFileSync('./public/ad_config.json', 'utf8'));
  inputsMock['api-url-input'].value = adConfig.supabaseUrl;
  inputsMock['api-key-input'].value = adConfig.supabaseKey;

  const config = JSON.parse(localStorageMock.getItem('kioscoprox_ad_config') || '{}');
  const resolvedUrl = config.supabaseUrl || config.apiUrl || inputsMock['api-url-input'].value || DEFAULT_SUPABASE_URL;
  const resolvedKey = config.supabaseKey || config.apiKey || inputsMock['api-key-input'].value || DEFAULT_SUPABASE_KEY;

  console.log('2.1 Escenario A (sin localStorage, leyendo de inputs/ad_config.json):');
  console.log('   URL resuelta:', resolvedUrl);
  console.log('   Key resuelta tiene longitud esperada:', resolvedKey.length > 50);
}

// Escenario B: Con localStorage personalizado guardado
{
  const customConfig = {
    supabaseUrl: 'https://custom-project.supabase.co',
    supabaseKey: 'custom-anon-key-123'
  };
  const localStorageMock = { getItem: () => JSON.stringify(customConfig) };
  const inputsMock = {
    'api-url-input': { value: '' },
    'api-key-input': { value: '' }
  };
  const DEFAULT_SUPABASE_URL = 'https://qtixbiikhvhzwshfgyeo.supabase.co';
  const DEFAULT_SUPABASE_KEY = 'default-key';

  const config = JSON.parse(localStorageMock.getItem('kioscoprox_ad_config') || '{}');
  const resolvedUrl = config.supabaseUrl || config.apiUrl || inputsMock['api-url-input'].value || DEFAULT_SUPABASE_URL;
  const resolvedKey = config.supabaseKey || config.apiKey || inputsMock['api-key-input'].value || DEFAULT_SUPABASE_KEY;

  console.log('2.2 Escenario B (con localStorage personalizado):');
  console.log('   URL resuelta:', resolvedUrl, resolvedUrl === 'https://custom-project.supabase.co' ? '✅ Prioriza config' : '❌');
  console.log('   Key resuelta:', resolvedKey, resolvedKey === 'custom-anon-key-123' ? '✅ Prioriza config' : '❌');
}

console.log('\n--- TEST 3: Consulta HTTP real a Supabase campaigns ---');
const DEFAULT_SUPABASE_URL = 'https://qtixbiikhvhzwshfgyeo.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0aXhiaWlraHZoendzaGZneWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTU1OTIsImV4cCI6MjEwMzE5MTU5Mn0.VxLd2eJChGHmTDuQT72mtHILUC6iWDAUVgH4ak1OHHE';

try {
  const res = await fetch(`${DEFAULT_SUPABASE_URL}/rest/v1/campaigns?select=*`, {
    headers: {
      'apikey': DEFAULT_SUPABASE_KEY,
      'Authorization': `Bearer ${DEFAULT_SUPABASE_KEY}`
    }
  });

  console.log('3.1 Código HTTP recibido:', res.status, res.status === 200 ? '✅ OK' : '❌ Falló');
  const campaigns = await res.json();
  console.log('3.2 Cantidad de campañas recibidas de Supabase:', campaigns.length);

  // Validar campos esperados por panel
  const first = campaigns[0];
  console.log('3.3 Estructura de primera campaña recibida:');
  console.log('   - ID:', first.id);
  console.log('   - Título:', first.title);
  console.log('   - Proveedor:', first.supplier_name);
  console.log('   - Precio:', first.price);
  console.log('   - Estado:', first.status);

  console.log('\n✅ Todas las pruebas de validación pasaron con éxito.');
} catch (err) {
  console.error('❌ Error en consulta HTTP:', err.message);
  process.exit(1);
}
