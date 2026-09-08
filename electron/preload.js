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
  getAppVersion: () => {
    return ipcRenderer.invoke('get-app-version');
  },
  checkForUpdates: () => {
    ipcRenderer.send('check-for-updates');
  },
  applyUpdate: () => {
    ipcRenderer.send('apply-update');
  }
});
