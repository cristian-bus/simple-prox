// Servicio de Identidad, Terminal y Perfil del Comercio para Simple ProX
// Garantiza la separación estricta entre installationId, commerceId y licenseId.
// REGLA DE ORO: Preserva con exactitud absoluta cualquier installationId preexistente.

import { matchProvinceAndCity } from '../utils/argentinaGeo.js';
import { APP_VERSION } from '../constants/version.js';

const STORAGE_KEYS = {
  INSTALLATION_ID: 'kioscoprox_installation_id',
  COMMERCE_PROFILE: 'kioscoprox_commerce_profile',
  BUSINESS_CONFIG: 'kioscoprox_business_config',
  MERCHANT_REGISTRATION: 'kioscoprox_merchant_registration'
};

const CURRENT_APP_VERSION = APP_VERSION;

/**
 * Valida de forma local y offline si un certificado Pro es válido para el installationId indicado.
 * Requiere exclusivamente un certificado digital Ed25519 firmado por el administrador.
 * 
 * @param {string} installationId - installationId de la terminal
 * @param {string} licenseKeyOrToken - Certificado Ed25519 Pro
 * @returns {Promise<boolean>}
 */
export async function isValidProLicense(installationId, licenseKeyOrToken) {
  if (!installationId || !licenseKeyOrToken) return false;

  const str = String(licenseKeyOrToken).trim();

  // En entorno de desarrollo (exclusivo import.meta.env.DEV, eliminado por dead-code en build de producción)
  if (import.meta.env.DEV && str === 'DEV_SIMULATED_PRO_LICENSE') {
    return true;
  }

  // Las licencias Pro legítimas son certificados digitales Ed25519 (Base64.Base64)
  if (str.includes('.')) {
    try {
      const { verifyProLicenseCertificate } = await import('../utils/licenseCrypto.js');
      const res = await verifyProLicenseCertificate(str, installationId);
      return res.valid === true;
    } catch (e) {
      console.error('[InstallationService] Error verificando certificado Pro Ed25519:', e);
      return false;
    }
  }

  // Cualquier formato sin firma digital asimétrica (incluyendo claves legadas) es rechazado
  return false;
}

/**
 * Genera un identificador universal seguro (UUID v4) con fallback
 */
function generateSecureUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Obtiene el installationId único y persistente.
 * CRÍTICO: Si ya existe un ID previo (ej: LTMEI6YT, WG6KX8UI), SE PRESERVA INTACTO.
 */
export function getInstallationId() {
  // 1. Verificar si ya fue formalizado en STORAGE_KEYS.INSTALLATION_ID
  let id = localStorage.getItem(STORAGE_KEYS.INSTALLATION_ID);
  if (id && id.trim()) return id.trim();

  // 2. Verificar si existe en la configuración de negocio preexistente (MIGRACIÓN RETROCOMPATIBLE)
  try {
    const rawBiz = localStorage.getItem(STORAGE_KEYS.BUSINESS_CONFIG);
    if (rawBiz) {
      const biz = JSON.parse(rawBiz);
      if (biz.installationId && biz.installationId.trim()) {
        id = biz.installationId.trim();
        localStorage.setItem(STORAGE_KEYS.INSTALLATION_ID, id);
        return id;
      }
    }
  } catch (e) {
    console.warn('[InstallationService] Error leyendo businessConfig para installationId:', e);
  }

  // 3. Verificar si existe en el registro previo de merchants
  try {
    const rawReg = localStorage.getItem(STORAGE_KEYS.MERCHANT_REGISTRATION);
    if (rawReg) {
      const reg = JSON.parse(rawReg);
      if (reg.installationId && reg.installationId.trim() && reg.installationId !== 'PC-ANONIMO') {
        id = reg.installationId.trim();
        localStorage.setItem(STORAGE_KEYS.INSTALLATION_ID, id);
        return id;
      }
    }
  } catch (e) {}

  // 4. Si es una instalación 100% nueva desde cero, generar un UUID seguro
  id = generateSecureUUID();
  localStorage.setItem(STORAGE_KEYS.INSTALLATION_ID, id);

  // Asegurar que también esté reflejado en businessConfig para que useKiosco y generador coincidan
  try {
    const rawBiz = localStorage.getItem(STORAGE_KEYS.BUSINESS_CONFIG);
    const biz = rawBiz ? JSON.parse(rawBiz) : {};
    biz.installationId = id;
    localStorage.setItem(STORAGE_KEYS.BUSINESS_CONFIG, JSON.stringify(biz));
  } catch (e) {}

  return id;
}

/**
 * Obtiene o crea el commerceId (identificador único del comercio en la nube)
 * Permite que en el futuro un comercio asocie múltiples terminales (installationId) al mismo commerceId.
 */
export function getCommerceId() {
  try {
    const rawProfile = localStorage.getItem(STORAGE_KEYS.COMMERCE_PROFILE);
    if (rawProfile) {
      const profile = JSON.parse(rawProfile);
      if (profile.commerceId) return profile.commerceId;
    }
  } catch (e) {}

  // Generar un ID de comercio persistente
  const newCommerceId = 'COMM-' + generateSecureUUID().substring(0, 8).toUpperCase();
  return newCommerceId;
}

/**
 * Obtiene el perfil completo y normalizado del comercio (CommerceProfile)
 */
export function getCommerceProfile() {
  const installationId = getInstallationId();
  let storedProfile = null;

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COMMERCE_PROFILE);
    if (raw) storedProfile = JSON.parse(raw);
  } catch (e) {}

  // Extraer datos preexistentes para migración limpia
  let bizConfig = {};
  try {
    const rawBiz = localStorage.getItem(STORAGE_KEYS.BUSINESS_CONFIG);
    if (rawBiz) bizConfig = JSON.parse(rawBiz);
  } catch (e) {}

  let regData = {};
  try {
    const rawReg = localStorage.getItem(STORAGE_KEYS.MERCHANT_REGISTRATION);
    if (rawReg) regData = JSON.parse(rawReg);
  } catch (e) {}

  const activation = bizConfig.activationData || {};

  const storeName = storedProfile?.storeName 
    || bizConfig.storeName 
    || bizConfig.name 
    || regData.storeName 
    || activation.negocio 
    || '';

  const address = storedProfile?.address 
    || bizConfig.address 
    || regData.address 
    || activation.direccion 
    || '';

  const phone = storedProfile?.phone 
    || bizConfig.phone 
    || regData.phone 
    || activation.telefono 
    || '';

  const businessType = storedProfile?.businessType 
    || bizConfig.businessType 
    || 'kiosco';

  // Normalizar ubicación (provincia y ciudad)
  let geo = {
    provinceCode: storedProfile?.provinceCode || 'AR-D',
    provinceName: storedProfile?.provinceName || 'San Luis',
    cityCode: storedProfile?.cityCode || 'SL-CAPITAL',
    cityName: storedProfile?.cityName || 'San Luis Capital'
  };

  if (!storedProfile?.provinceCode) {
    const rawCity = regData.city || activation.ciudad || bizConfig.city || '';
    const inferred = matchProvinceAndCity('', rawCity);
    geo = inferred;
  }

  const profile = {
    installationId,
    commerceId: storedProfile?.commerceId || getCommerceId(),
    storeName,
    businessType,
    provinceCode: geo.provinceCode,
    provinceName: geo.provinceName,
    cityCode: geo.cityCode,
    cityName: geo.cityName,
    postalCode: storedProfile?.postalCode || '',
    address,
    phone,
    installer: storedProfile?.installer || activation.instalador || regData.installer || '',
    appVersion: CURRENT_APP_VERSION,
    plan: bizConfig.plan || 'Básico',
    status: storedProfile?.status || 'active',
    registeredAt: storedProfile?.registeredAt || new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    configVersion: storedProfile?.configVersion || '1.0.0'
  };

  // Persistir en caché local si no estaba guardado
  if (!storedProfile) {
    saveCommerceProfile(profile);
  }

  return profile;
}

/**
 * Guarda y actualiza el CommerceProfile tanto en su clave dedicada como en la configuración local
 */
export function saveCommerceProfile(updates = {}) {
  try {
    const current = getCommerceProfile();
    const updated = {
      ...current,
      ...updates,
      installationId: current.installationId, // INMUTABLE
      commerceId: current.commerceId,         // INMUTABLE
      lastSeenAt: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEYS.COMMERCE_PROFILE, JSON.stringify(updated));

    // Mantener sincronizado kioscoprox_business_config para que useKiosco no tenga discrepancias
    const rawBiz = localStorage.getItem(STORAGE_KEYS.BUSINESS_CONFIG);
    const biz = rawBiz ? JSON.parse(rawBiz) : {};
    biz.installationId = updated.installationId;
    biz.storeName = updated.storeName;
    biz.name = updated.storeName;
    biz.address = updated.address;
    biz.phone = updated.phone;
    biz.businessType = updated.businessType;
    biz.provinceCode = updated.provinceCode;
    biz.provinceName = updated.provinceName;
    biz.cityCode = updated.cityCode;
    biz.cityName = updated.cityName;
    localStorage.setItem(STORAGE_KEYS.BUSINESS_CONFIG, JSON.stringify(biz));

    return updated;
  } catch (e) {
    console.error('[InstallationService] Error al guardar perfil de comercio:', e);
    return null;
  }
}
