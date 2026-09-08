// Servicio de Actualizaciones Automáticas en el Frontend (Renderer) para Simple ProX
// Monitorea el ciclo de vida del update y asegura que NO se reinicie si la caja está abierta

export const UPDATE_STATUS = {
  IDLE: 'IDLE',
  CHECKING: 'CHECKING',
  AVAILABLE: 'AVAILABLE',
  DOWNLOADING: 'DOWNLOADING',
  READY_TO_INSTALL: 'READY_TO_INSTALL',
  UP_TO_DATE: 'UP_TO_DATE',
  ERROR: 'ERROR'
};

let currentUpdateState = {
  status: UPDATE_STATUS.IDLE,
  updateInfo: null,
  progress: null,
  error: null
};

const listeners = new Set();

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn({ ...currentUpdateState });
    } catch (e) {}
  });
}

export function getUpdateState() {
  return { ...currentUpdateState };
}

export function subscribeUpdate(listener) {
  listeners.add(listener);
  listener({ ...currentUpdateState });
  return () => listeners.delete(listener);
}

let checkTimeout = null;

/**
 * Solicita comprobar actualizaciones manualmente
 */
export function checkForUpdatesManual() {
  if (window.api?.checkForUpdates) {
    if (checkTimeout) clearTimeout(checkTimeout);
    currentUpdateState = {
      ...currentUpdateState,
      status: UPDATE_STATUS.CHECKING,
      error: null
    };
    notifyListeners();
    window.api.checkForUpdates();

    // Timeout de seguridad: si pasaron 12s sin respuesta, volver a UP_TO_DATE o IDLE
    checkTimeout = setTimeout(() => {
      if (currentUpdateState.status === UPDATE_STATUS.CHECKING) {
        currentUpdateState = {
          ...currentUpdateState,
          status: UPDATE_STATUS.UP_TO_DATE,
          error: null
        };
        notifyListeners();
      }
    }, 12000);
  }
}

/**
 * Aplica la actualización y reinicia.
 * REGLA CRÍTICA: isSafeToRestart debe ser validado por el llamador (caja.isOpen === false).
 */
export function applyUpdateSafe(isSafeToRestart = true) {
  if (!isSafeToRestart) {
    console.warn('[UpdateService] Bloqueado: No se puede reiniciar con operaciones de caja abiertas.');
    return { success: false, reason: 'CAJA_OPEN' };
  }

  if (window.api?.applyUpdate && currentUpdateState.status === UPDATE_STATUS.READY_TO_INSTALL) {
    window.api.applyUpdate();
    return { success: true };
  }

  return { success: false, reason: 'NO_UPDATE_READY' };
}

// Inicializar listeners nativos de Electron si estamos corriendo en la app desktop
if (typeof window !== 'undefined' && window.api) {
  if (window.api.onUpdateAvailable) {
    window.api.onUpdateAvailable((info) => {
      currentUpdateState = {
        status: UPDATE_STATUS.AVAILABLE,
        updateInfo: info,
        error: null
      };
      notifyListeners();
      console.log('[UpdateService] Nueva versión disponible:', info?.version);
    });
  }

  if (window.api.onUpdateNotAvailable) {
    window.api.onUpdateNotAvailable((info) => {
      if (checkTimeout) clearTimeout(checkTimeout);
      currentUpdateState = {
        ...currentUpdateState,
        status: UPDATE_STATUS.UP_TO_DATE,
        updateInfo: info,
        error: null
      };
      notifyListeners();
      console.log('[UpdateService] El sistema ya está actualizado a la última versión.');
    });
  }

  if (window.api.onUpdateDownloadProgress) {
    window.api.onUpdateDownloadProgress((progress) => {
      currentUpdateState = {
        ...currentUpdateState,
        status: UPDATE_STATUS.DOWNLOADING,
        progress: progress,
        error: null
      };
      notifyListeners();
    });
  }

  if (window.api.onUpdateDownloaded) {
    window.api.onUpdateDownloaded((info) => {
      currentUpdateState = {
        status: UPDATE_STATUS.READY_TO_INSTALL,
        updateInfo: info,
        error: null
      };
      notifyListeners();
      console.log('[UpdateService] Actualización descargada y lista para instalar:', info?.version);
    });
  }

  if (window.api.onUpdateError) {
    window.api.onUpdateError((err) => {
      currentUpdateState = {
        ...currentUpdateState,
        status: UPDATE_STATUS.ERROR,
        error: err
      };
      notifyListeners();
    });
  }
}
