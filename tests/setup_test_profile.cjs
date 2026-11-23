const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const userDataPath = app.getPath('userData');
console.log('[SETUP] EFFECTIVE_USER_DATA:', userDataPath);

const expectedPath = 'c:\\Users\\Pininas\\KioscoProX\\.test_isolated_data';
if (userDataPath.toLowerCase() !== expectedPath.toLowerCase()) {
  console.error('[SETUP ERROR] userData no coincide con el directorio aislado esperado:', userDataPath);
  app.exit(1);
}

const initHtmlPath = path.join(__dirname, 'init_test_storage.html');
fs.writeFileSync(initHtmlPath, `<!DOCTYPE html><html><body><script>
  window.__INIT_TEST_STORAGE = function() {
    // 1. Identidad de instalación técnica
    localStorage.setItem('kioscoprox_installation_id', 'spx_test_autoenroll_2026');

    // 2. Desactivar sincronización de anuncios (adConfig.enabled = false y supabaseKey = '')
    localStorage.setItem('kioscoprox_ad_config', JSON.stringify({
      enabled: false,
      supabaseUrl: 'https://qtixbiikhvhzwshfgyeo.supabase.co',
      supabaseKey: '',
      syncIntervalMinutes: 15
    }));

    // 3. Caché de ofertas vacía durante la activación
    localStorage.setItem('kioscoprox_offers_cache', JSON.stringify([]));

    // 4. Bloqueo de banners en Remote Config local
    localStorage.setItem('kioscoprox_remote_config_v2', JSON.stringify({
      bannerEnabled: false,
      b2bEnabled: false
    }));

    // 5. Configuración de negocio tipo kiosco, no activado aún
    localStorage.setItem('kioscoprox_business_config', JSON.stringify({
      installationId: 'spx_test_autoenroll_2026',
      storeName: 'Kiosco Test AutoEnroll',
      businessType: 'kiosco',
      plan: 'Básico',
      isActivated: false,
      isOnboarded: false
    }));

    // 6. Perfil de comercio
    localStorage.setItem('kioscoprox_commerce_profile', JSON.stringify({
      installationId: 'spx_test_autoenroll_2026',
      storeName: 'Kiosco Test AutoEnroll',
      businessType: 'kiosco',
      plan: 'Básico',
      provinceCode: 'AR-D',
      provinceName: 'San Luis',
      cityCode: 'SL-CAPITAL',
      cityName: 'San Luis Capital'
    }));

    // Limpieza de cualquier token o cola previa
    localStorage.removeItem('kioscoprox_license_token');
    localStorage.removeItem('kioscoprox_terminal_cred_enc');
    localStorage.removeItem('kioscoprox_terminal_cred_token');
    localStorage.removeItem('kioscoprox_outbox_queue');
    localStorage.removeItem('kioscoprox_outbox_deadletter');

    return {
      installationId: localStorage.getItem('kioscoprox_installation_id'),
      offersCacheCount: JSON.parse(localStorage.getItem('kioscoprox_offers_cache') || '[]').length,
      adConfigEnabled: JSON.parse(localStorage.getItem('kioscoprox_ad_config') || '{}').enabled,
      bannerEnabled: JSON.parse(localStorage.getItem('kioscoprox_remote_config_v2') || '{}').bannerEnabled,
      isActivated: JSON.parse(localStorage.getItem('kioscoprox_business_config') || '{}').isActivated
    };
  };
</script></body></html>`);

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await win.loadFile(initHtmlPath);
    const result = await win.webContents.executeJavaScript('window.__INIT_TEST_STORAGE()');
    console.log('[SETUP SUCCESS] Configuración lista:');
    console.log(JSON.stringify(result, null, 2));

    if (fs.existsSync(initHtmlPath)) {
      fs.unlinkSync(initHtmlPath);
    }

    win.destroy();
    app.exit(0);
  } catch (err) {
    console.error('[SETUP ERROR]:', err);
    if (fs.existsSync(initHtmlPath)) {
      fs.unlinkSync(initHtmlPath);
    }
    app.exit(1);
  }
});
