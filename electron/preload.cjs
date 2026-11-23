const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openExternal: (url) => {
    if (url && url !== '#') {
      ipcRenderer.send('open-external', url);
    }
  },
  onAppCloseRequested: (callback) => {
    ipcRenderer.on('app-close-requested', () => callback());
  },
  removeAppCloseListener: () => {
    ipcRenderer.removeAllListeners('app-close-requested');
  },
  confirmClose: () => {
    ipcRenderer.send('confirm-close');
  },
  // Guardado y lectura nativa de archivos de respaldo
  saveBackupFile: (data) => ipcRenderer.invoke('save-backup-file', data),
  readBackupFile: () => ipcRenderer.invoke('read-backup-file'),
  // Infraestructura de recuperación ante restauraciones interrumpidas
  recoveryCheckJournal: () => ipcRenderer.invoke('recovery-check-journal'),
  recoverySaveJournal: (journal) => ipcRenderer.invoke('recovery-save-journal', journal),
  recoveryClearJournal: () => ipcRenderer.invoke('recovery-clear-journal'),
  recoverySaveSnapshot: (snapshot) => ipcRenderer.invoke('recovery-save-snapshot', snapshot),
  recoveryReadSnapshot: (snapshotPath) => ipcRenderer.invoke('recovery-read-snapshot', snapshotPath),
  // Almacenamiento seguro DPAPI
  secureStoreEncrypt: (plainText) => ipcRenderer.invoke('secure-store-encrypt', plainText),
  secureStoreDecrypt: (encryptedHex) => ipcRenderer.invoke('secure-store-decrypt', encryptedHex),
  // API de Versionado y AutoUpdate
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  applyUpdate: () => ipcRenderer.send('apply-update'),
  onUpdateAvailable: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateNotAvailable: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-not-available', handler);
    return () => ipcRenderer.removeListener('update-not-available', handler);
  },
  onUpdateDownloadProgress: (callback) => {
    const handler = (event, progress) => callback(progress);
    ipcRenderer.on('update-download-progress', handler);
    return () => ipcRenderer.removeListener('update-download-progress', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
  onUpdateError: (callback) => {
    const handler = (event, err) => callback(err);
    ipcRenderer.on('update-error', handler);
    return () => ipcRenderer.removeListener('update-error', handler);
  }
});
