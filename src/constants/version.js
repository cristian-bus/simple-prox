/**
 * Versión canónica del sistema Simple ProX.
 * Se sincroniza con package.json.
 */
export const APP_VERSION = '1.3.3';

/**
 * Obtiene la versión real de la aplicación desde Electron o el fallback canónico.
 */
export async function getRuntimeAppVersion() {
  if (typeof window !== 'undefined' && window.api?.getAppVersion) {
    try {
      const v = await window.api.getAppVersion();
      if (v) return v;
    } catch (e) {
      // Fallback
    }
  }
  return APP_VERSION;
}
