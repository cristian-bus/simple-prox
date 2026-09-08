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
  // API de Versionado y AutoUpdate
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  applyUpdate: () => ipcRenderer.send('apply-update'),
  onUpdateAvailable: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
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
