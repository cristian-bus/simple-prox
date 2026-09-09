import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
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
    icon: path.join(__dirname, '../public/logo.jpg'),
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

  // Interceptar TODAS las aperturas de ventanas (window.open, target="_blank", enlaces de WhatsApp)
  // y abrirlas en el navegador predeterminado del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('whatsapp:') || url.startsWith('mailto:'))) {
      shell.openExternal(url).catch(err => console.error('[Main] Error abriendo external URL con setWindowOpenHandler:', err));
      return { action: 'deny' };
    }
    return { action: 'allow' };
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
    // Aplica la actualización y reinicia de forma segura
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.on('confirm-close', () => {
    if (win) {
      win.destroy();
    }
  });

  ipcMain.on('open-external', (event, url) => {
    if (url && typeof url === 'string') {
      shell.openExternal(url).catch(err => console.error('[Main] Error abriendo external URL:', err));
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
