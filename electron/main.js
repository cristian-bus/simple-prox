import { app, BrowserWindow, ipcMain, shell, safeStorage, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeBackupFileAtomic } from './safeBackupWriter.js';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

// Resolviendo el equivalente a __dirname en Módulos ES (import)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración defensiva de auto-update
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true; // Se aplica automáticamente al cerrar la app si ya se descargó

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    icon: path.join(__dirname, '../public/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      devTools: process.env.NODE_ENV === 'development'
    },
    autoHideMenuBar: true, // Ocultar la barra de Archivo/Edición de Windows
    title: "Simple ProX",
    show: false
  });

  // Eventos de AutoUpdater hacia el renderer
  autoUpdater.on('update-available', (info) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-available', {
        version: info?.version,
        releaseDate: info?.releaseDate
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-not-available', {
        version: info?.version
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-download-progress', {
        percent: progressObj.percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-downloaded', {
        version: info?.version,
        releaseDate: info?.releaseDate,
        releaseNotes: info?.releaseNotes
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.warn('[Main] AutoUpdater warning/error:', err?.message || err);
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-error', err?.message || 'Error de actualización');
    }
  });

// Validación defensiva estricta de URLs externas (Deny-by-Default)
function isSafeExternalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    // Permitir solo protocolos web seguros y correo
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

  // Interceptar TODAS las aperturas de ventanas (window.open, target="_blank", enlaces de WhatsApp)
  // Deny-by-default: las URLs válidas se abren en navegador externo y nunca se permite crear ventanas hijas arbitrarias
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch(err => console.error('[Main] Error abriendo external URL con setWindowOpenHandler:', err));
    } else {
      console.warn('[Main] Apertura bloqueada por política de seguridad (URL no segura):', url);
    }
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
    win.webContents.focus();

    // Comprobar actualizaciones en background 4 segundos tras el inicio (en producción)
    if (process.env.NODE_ENV !== 'development') {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(e => console.warn('[Main] Error chequeando updates iniciales:', e));
      }, 4000);

      // Comprobar actualizaciones periódicamente cada 4 horas
      setInterval(() => {
        autoUpdater.checkForUpdates().catch(e => console.warn('[Main] Error chequeando updates periódicos:', e));
      }, 4 * 60 * 60 * 1000);
    }
  });

  // En modo desarrollo usamos el puerto de Vite (si corres npm run dev)
  // En producción (el .exe real) cargamos el archivo de la carpeta dist/
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5180');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('close', (e) => {
    if (!win.isDestroyed()) {
      e.preventDefault();
      win.webContents.send('app-close-requested');
    }
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('secure-store-encrypt', async (event, plainText) => {
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(plainText);
        return { success: true, encrypted: buffer.toString('hex') };
      }
    } catch (e) {
      console.warn('[SafeStorage] Error cifrando:', e);
    }
    return { success: false };
  });

  ipcMain.handle('secure-store-decrypt', async (event, encryptedHex) => {
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encryptedHex, 'hex');
        const decrypted = safeStorage.decryptString(buffer);
        return { success: true, decrypted };
      }
    } catch (e) {
      console.warn('[SafeStorage] Error descifrando:', e);
    }
    return { success: false };
  });

  ipcMain.on('check-for-updates', () => {
    if (process.env.NODE_ENV !== 'development') {
      autoUpdater.checkForUpdates().catch(e => {
        console.warn('[Main] Error manual check updates:', e);
        if (win && !win.isDestroyed()) {
          win.webContents.send('update-error', e?.message || 'Error al comprobar actualizaciones');
        }
      });
    } else {
      setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('update-not-available', { version: app.getVersion() });
        }
      }, 1000);
    }
  });

  ipcMain.on('apply-update', () => {
    // Aplica la actualización en modo silencioso y reinicia automáticamente de forma forzada
    autoUpdater.quitAndInstall(true, true);
  });

  ipcMain.on('confirm-close', () => {
    if (win) {
      win.destroy();
    }
  });

  ipcMain.on('open-external', (event, url) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch(err => console.error('[Main] Error abriendo external URL:', err));
    } else {
      console.warn('[Main] Intento bloqueado por política de seguridad en open-external:', url);
    }
  });

  ipcMain.handle('save-backup-file', async (event, { defaultFileName, fileContent }) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Guardar copia de seguridad - Simple ProX',
        defaultPath: defaultFileName,
        filters: [
          { name: 'Copia de Seguridad Simple ProX (*.spx)', extensions: ['spx'] },
          { name: 'Archivo JSON (*.json)', extensions: ['json'] }
        ]
      });

      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }

      return await writeBackupFileAtomic(filePath, fileContent);
    } catch (err) {
      console.error('[Main] Error en diálogo o guardado de respaldo:', err);
      return { success: false, error: err?.message || 'Error al procesar la copia de seguridad' };
    }
  });

  ipcMain.handle('read-backup-file', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Seleccionar copia de seguridad - Simple ProX',
        filters: [
          { name: 'Copia de Seguridad Simple ProX (*.spx)', extensions: ['spx'] },
          { name: 'Archivo JSON (*.json)', extensions: ['json'] },
          { name: 'Todos los archivos (*.*)', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const filePath = filePaths[0];
      const fileContent = await fs.promises.readFile(filePath, 'utf8');
      return { success: true, filePath, fileContent };
    } catch (err) {
      console.error('[Main] Error abriendo archivo de respaldo:', err);
      return { success: false, error: err?.message || 'Error al leer el archivo seleccionado' };
    }
  });

  // =========================================================================
  // INFRAESTRUCTURA DE RECUPERACIÓN ANTE RESTAURACIONES INTERRUMPIDAS (ETAPA 5B.2)
  // =========================================================================
  const getRecoveryDirs = () => {
    const recoveryDir = path.join(app.getPath('userData'), 'recovery');
    const snapshotsDir = path.join(recoveryDir, 'snapshots');
    const journalPath = path.join(recoveryDir, 'restore_journal.json');
    return { recoveryDir, snapshotsDir, journalPath };
  };

  ipcMain.handle('recovery-check-journal', async () => {
    try {
      const { journalPath } = getRecoveryDirs();
      if (fs.existsSync(journalPath)) {
        const raw = await fs.promises.readFile(journalPath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[Main] Advertencia leyendo journal de recuperación:', e);
    }
    return null;
  });

  ipcMain.handle('recovery-save-journal', async (event, journal) => {
    try {
      const { recoveryDir, journalPath } = getRecoveryDirs();
      await fs.promises.mkdir(recoveryDir, { recursive: true });
      const content = JSON.stringify(journal, null, 2);
      return await writeBackupFileAtomic(journalPath, content);
    } catch (err) {
      console.error('[Main] Error guardando journal de recuperación:', err);
      return { success: false, error: err?.message || 'Error al guardar journal' };
    }
  });

  ipcMain.handle('recovery-clear-journal', async () => {
    try {
      const { journalPath } = getRecoveryDirs();
      if (fs.existsSync(journalPath)) {
        await fs.promises.unlink(journalPath);
      }
      return { success: true };
    } catch (err) {
      console.warn('[Main] Advertencia eliminando journal de recuperación:', err);
      return { success: false, error: err?.message || 'Error al limpiar journal' };
    }
  });

  ipcMain.handle('recovery-save-snapshot', async (event, snapshot) => {
    try {
      const { snapshotsDir } = getRecoveryDirs();
      await fs.promises.mkdir(snapshotsDir, { recursive: true });
      const snapFileName = `emergency_snapshot_${snapshot.snapshotId || Date.now()}.json`;
      const snapPath = path.join(snapshotsDir, snapFileName);
      const content = JSON.stringify(snapshot, null, 2);
      const writeRes = await writeBackupFileAtomic(snapPath, content);
      if (writeRes.success) {
        return { success: true, snapshotPath: snapPath };
      }
      return writeRes;
    } catch (err) {
      console.error('[Main] Error guardando snapshot interno de emergencia:', err);
      return { success: false, error: err?.message || 'Error al guardar snapshot' };
    }
  });

  ipcMain.handle('recovery-read-snapshot', async (event, snapshotPath) => {
    try {
      if (!snapshotPath || typeof snapshotPath !== 'string') {
        return { success: false, error: 'Ruta de snapshot no especificada.' };
      }
      const resolved = path.resolve(snapshotPath);
      const resolvedUserData = path.resolve(app.getPath('userData'));
      if (!resolved.toLowerCase().startsWith(resolvedUserData.toLowerCase())) {
        return { success: false, error: 'Acceso denegado: la ruta del snapshot debe pertenecer al perfil de usuario.' };
      }
      if (!fs.existsSync(resolved)) {
        return { success: false, error: 'Archivo de snapshot no encontrado en disco.' };
      }
      const raw = await fs.promises.readFile(resolved, 'utf8');
      const snapshot = JSON.parse(raw);
      return { success: true, snapshot };
    } catch (err) {
      console.error('[Main] Error leyendo snapshot interno:', err);
      return { success: false, error: err?.message || 'Error al leer snapshot' };
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // En Windows cerramos la app al cerrar la última ventana
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
