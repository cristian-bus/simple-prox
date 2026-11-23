const { app, BrowserWindow, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// 1. Directorio temporal nuevo y exclusivo
const isolatedDir = path.resolve(__dirname, '../.test_isolated_profile_5c4d2');

if (fs.existsSync(isolatedDir)) {
  console.error('[RUNNER ERROR] El directorio aislado ya existía previamente. Abortando.');
  process.exit(1);
}

// 2. Configurar app.setPath('userData') ANTES de inicializar sesiones o ventanas
app.setPath('userData', isolatedDir);

const GROUND_TRUTH_ACTIVE_IDS = [
  '061e01d5-a41f-4109-942b-e093e50cb6e2',
  '0e1e9b31-5c8c-476b-b3c6-e9a3a43b5f8a',
  '156c2fac-4e94-4a27-ac00-68353b5e1027',
  '1d29425d-9ae6-40c8-8a6f-4ab6038f8aaf',
  '2ec03876-ae0d-4988-b857-545e64e68cc5',
  '4339dc9d-acdf-4ce7-89d2-986a85ab2876',
  '4fccc3ea-664b-498f-aa2c-ef87499d1c31',
  '5b682403-1486-40cc-8b02-24d4ae7278cc',
  '78f34abe-f65a-4b8f-bda9-bbabded28552',
  '79ffec76-6f32-487c-bd85-e34b063584bb',
  '8cc49d2a-7c7f-4071-8138-31c91d18b7b8',
  'c8497a41-c175-444f-a59c-e11a856ec13b',
  'd965a108-6dde-4c22-a143-c6eecc467228',
  'da8fa6ca-26a0-452d-a691-331782e5ca7c',
  'da8ff41b-fd8f-4a97-8272-24b54c61aeba',
  'e323c795-67fd-4577-80f0-d81a96edb81c',
  'ed6e0e09-e398-4b76-8996-0e16dd8dd93c'
];

app.whenReady().then(async () => {
  try {
    const actualUserData = app.getPath('userData');
    console.log('[RUNNER] EFFECTIVE_USER_DATA:', actualUserData);

    // 3. Comprobar que Electron está usando exclusivamente el perfil de prueba
    if (actualUserData.toLowerCase() !== isolatedDir.toLowerCase()) {
      console.error('[RUNNER ERROR] userData no coincide con el directorio aislado:', actualUserData);
      app.exit(1);
      return;
    }

    const win = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false
      }
    });

    const pagePath = path.join(__dirname, 'test_electron_isolated_page.html');
    await win.loadFile(pagePath);

    console.log('[RUNNER] Ejecutando suite de pruebas en Chromium Electron...');
    const result = await win.webContents.executeJavaScript(
      `window.__RUN_ELECTRON_ISOLATED_TESTS(${JSON.stringify(GROUND_TRUTH_ACTIVE_IDS)})`
    );

    console.log('=== TEST_SUITE_RESULT_START ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('=== TEST_SUITE_RESULT_END ===');

    win.destroy();
    app.exit(0);
  } catch (err) {
    console.error('[RUNNER FATAL ERROR]:', err);
    app.exit(1);
  }
});
