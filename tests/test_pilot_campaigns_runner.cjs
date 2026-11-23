/**
 * SIMPLE PROX - Runner Aislado de Electron para Piloto de Campañas
 * FASE 5C.4D.4B
 * 
 * Ejecuta la verificación real de terminal-sync/campaigns en un perfil Chromium
 * 100% aislado. No accede a %APPDATA%\Simple ProX ni toca datos comerciales.
 * Garantiza cierre seguro y sanitización de credenciales.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// 1. Directorio temporal nuevo y exclusivo
const isolatedDir = path.resolve(__dirname, '../.test_isolated_pilot');

// 2. Configurar app.setPath('userData') ANTES de cualquier inicialización
app.setPath('userData', isolatedDir);

app.whenReady().then(async () => {
  let exitCode = 0;
  let win = null;

  try {
    const actualUserData = app.getPath('userData');
    console.log('[RUNNER] Perfil Electron efectivo:', actualUserData);

    // Verificación estricta de aislamiento
    if (actualUserData.toLowerCase() !== isolatedDir.toLowerCase()) {
      console.error('[RUNNER ERROR CRÍTICO] userData no coincide con el directorio aislado. Abortando.');
      app.exit(1);
      return;
    }

    // Comprobar parámetros de credenciales para la prueba
    const credPath = path.resolve(__dirname, '.pilot_cred_active.json');
    const cleanupPath = path.resolve(__dirname, '.pilot_cleanup_pending.json');
    let creds = null;

    if (fs.existsSync(credPath)) {
      try {
        creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      } catch (e) {
        console.error('[RUNNER ERROR] Error al parsear .pilot_cred_active.json:', e.message);
      }
    }

    if (!creds || !creds.installationId || !creds.terminalToken) {
      console.error('[RUNNER ERROR] No se encontró .pilot_cred_active.json con credenciales completas.');
      console.error('[RUNNER ABORT] Abortando runner. Estado: FALLO POR CREDENCIALES AUSENTES.');
      app.exit(1);
      return;
    }

    // 1. Escribir y verificar atómicamente el archivo de recuperación ANTES de eliminar credPath
    // Preserva la información mínima de limpieza (SIN TOKEN EN TEXTO PLANO)
    try {
      const cleanupData = {
        installationId: creds.installationId,
        tokenHash: creds.tokenHash || '[HASH_CALCULADO]',
        sqlCleanup: creds.sqlCleanup || `DELETE FROM public.terminal_identities WHERE installation_id = '${creds.installationId}' AND token_hash = '${creds.tokenHash}';`,
        sqlVerify: creds.sqlVerify || `SELECT count(*) AS remaining_count FROM public.terminal_identities WHERE installation_id = '${creds.installationId}';`,
        generatedAt: creds.createdAt || new Date().toISOString()
      };

      fs.writeFileSync(cleanupPath, JSON.stringify(cleanupData, null, 2), { encoding: 'utf8', mode: 0o600 });

      // Verificación explícita de lectura e integridad del archivo persistido
      const verifyRead = fs.readFileSync(cleanupPath, 'utf8');
      const parsedVerify = JSON.parse(verifyRead);
      if (
        !parsedVerify.installationId || 
        !parsedVerify.tokenHash || 
        !parsedVerify.sqlCleanup ||
        parsedVerify.installationId !== creds.installationId ||
        parsedVerify.tokenHash !== creds.tokenHash
      ) {
        throw new Error('El archivo de recuperación no pasó la verificación de integridad exacta.');
      }

      console.log('[RUNNER] Datos de limpieza guardados y verificados en .pilot_cleanup_pending.json (sin secretos).');
    } catch (e) {
      console.error('[RUNNER FATAL] Falló la persistencia verificable del archivo de recuperación:', e.message);
      console.error('[RUNNER ABORT] Abortando runner SIN eliminar credenciales activas y SIN iniciar conexiones.');
      app.exit(1);
      return;
    }

    // 2. Solo tras confirmar la persistencia verificable del archivo de recuperación, consumir credPath
    try {
      fs.unlinkSync(credPath);
      console.log('[RUNNER] Archivo de credenciales activas consumido y eliminado para prevenir reutilización.');
    } catch (e) {
      console.warn('[RUNNER AVISO] No se pudo desvincular credPath:', e.message);
    }

    // 3. Verificación de seguridad de credenciales en memoria (impide ejecución accidental sin token)
    if (!creds.installationId || !creds.terminalToken || typeof creds.terminalToken !== 'string' || creds.terminalToken.length < 20) {
      console.error('[RUNNER FATAL] Credencial en memoria inválida o incompleta tras la lectura.');
      app.exit(1);
      return;
    }

    const expectExclusion = Boolean(creds.expectExclusion || process.argv.includes('--expect-exclusion') || process.argv.includes('--expect-exhaustion'));
    console.log(`[RUNNER] Ejecutando piloto con Installation ID: ${creds.installationId}`);
    console.log('[RUNNER] Token: [PROTEGIDO - ALTA ENTROPÍA EN MEMORIA]');
    console.log(`[RUNNER] Modo de verificación: ${expectExclusion ? 'EXCLUSIÓN ESTRICTA (Cupo Agotado)' : 'PRESENCIA (Cupo Activo)'}`);

    win = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false
      }
    });

    const pagePath = path.join(__dirname, 'test_pilot_campaigns_page.html');
    await win.loadFile(pagePath);

    console.log('[RUNNER] Ejecutando suite de campañas en Chromium...');
    const result = await win.webContents.executeJavaScript(
      `window.__RUN_PILOT_CAMPAIGNS_TEST(${JSON.stringify({
        installationId: creds.installationId,
        terminalToken: creds.terminalToken,
        expectExclusion: expectExclusion,
        supabaseUrl: creds.supabaseUrl || 'https://qtixbiikhvhzwshfgyeo.supabase.co',
        supabaseKey: creds.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0aXhiaWlraHZoendzaGZneWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTU1OTIsImV4cCI6MjEwMzE5MTU5Mn0.VxLd2eJChGHmTDuQT72mtHILUC6iWDAUVgH4ak1OHHE'
      })})`
    );

    console.log('\n=== RESULTADO DEL PILOTO DE CAMPAÑAS (SANITIZADO) ===');
    console.log(JSON.stringify(result, null, 2));

    if (!result || !result.success) {
      exitCode = 1;
    }
  } catch (err) {
    console.error('[RUNNER FATAL ERROR]:', err);
    exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
    // Limpieza segura del perfil temporal: solo si coincide exactamente con la ruta aislada designada
    try {
      const expectedIsolatedDir = path.resolve(__dirname, '../.test_isolated_pilot');
      if (
        isolatedDir === expectedIsolatedDir &&
        path.basename(isolatedDir) === '.test_isolated_pilot' &&
        fs.existsSync(isolatedDir)
      ) {
        fs.rmSync(isolatedDir, { recursive: true, force: true });
        console.log('[RUNNER] Directorio temporal aislado eliminado exitosamente.');
      }
    } catch (e) {
      console.warn('[RUNNER] Advertencia al eliminar directorio temporal:', e.message);
    }
    app.exit(exitCode);
  }
});
