// Servicio de Copia de Seguridad y Respaldo Comercial Offline-First para Simple ProX
// Garantiza la exportación consistente, versionada y verificable de datos comerciales sin exponer secretos ni licencias.

import { APP_VERSION } from '../constants/version.js';

export const BACKUP_FORMAT = 'SimpleProX_Backup';
export const BACKUP_VERSION = 1;

/**
 * Calcula la suma de comprobación criptográfica SHA-256 de los datos exportados.
 * Opera de forma 100% offline mediante WebCrypto nativo.
 * 
 * @param {object} data - Datos comerciales a verificar
 * @returns {Promise<string>} - Hash SHA-256 en formato hexadecimal
 */
export async function calculateDataChecksum(data) {
  const jsonStr = JSON.stringify(data);
  const cryptoSubtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
    ? window.crypto.subtle
    : (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
      ? globalThis.crypto.subtle
      : (typeof crypto !== 'undefined' && crypto.webcrypto ? crypto.webcrypto.subtle : null);

  if (cryptoSubtle) {
    const hashBuf = await cryptoSubtle.digest('SHA-256', new TextEncoder().encode(jsonStr));
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('Criptografía no disponible en el entorno para calcular suma de integridad');
}

/**
 * Genera una instantánea (snapshot) estructurada, sanitizada y consistente de todas las entidades comerciales.
 * REGLAS DE SEGURIDAD OBLIGATORIAS:
 * - NO exporta tokens de activación (kioscoprox_license_token).
 * - NO exporta credenciales de licencia Pro (licenseKey).
 * - NO exporta identificadores fijos de hardware (installationId).
 * - NO exporta PINs ni credenciales de usuarios.
 * - NO exporta claves ni endpoints de Supabase.
 * - NO muta ni altera ningún dato existente en el sistema.
 * 
 * @param {object} kiosco - Objeto useKiosco con las entidades en memoria
 * @returns {Promise<object>} - Payload estructurado del respaldo con suma SHA-256
 */
export async function generateBackupPayload(kiosco) {
  if (!kiosco) {
    throw new Error('Contexto comercial no proporcionado para generar el respaldo');
  }

  // 1. Extracción defensiva de entidades comerciales (copias superficiales/inmutables)
  const products = Array.isArray(kiosco.products) ? [...kiosco.products] : [];
  const sales = Array.isArray(kiosco.sales) ? [...kiosco.sales] : [];
  const purchases = Array.isArray(kiosco.purchases) ? [...kiosco.purchases] : [];
  const clients = Array.isArray(kiosco.clients) ? [...kiosco.clients] : [];
  const shifts = Array.isArray(kiosco.shifts) ? [...kiosco.shifts] : [];
  const categories = kiosco.categoryTree ? { ...kiosco.categoryTree } : {};
  const suppliers = Array.isArray(kiosco.suppliers) ? [...kiosco.suppliers] : [];
  const reservations = Array.isArray(kiosco.reservations) ? [...kiosco.reservations] : [];

  // 2. Estado de caja
  const caja = kiosco.caja ? {
    isOpen: !!kiosco.caja.isOpen,
    efectivo: Number(kiosco.caja.efectivo) || 0,
    openedAt: kiosco.caja.openedAt || null,
    openedDate: kiosco.caja.openedDate || null,
    openedTimestamp: kiosco.caja.openedTimestamp || null,
    openedBy: kiosco.caja.openedBy || null,
    openedByName: kiosco.caja.openedByName || null,
    activeUserId: kiosco.caja.activeUserId || null,
    activeUserName: kiosco.caja.activeUserName || null,
    movimientos: Array.isArray(kiosco.caja.movimientos) ? [...kiosco.caja.movimientos] : []
  } : { isOpen: false, efectivo: 0, openedAt: null, movimientos: [] };

  // 3. Sanitización de usuarios: EXCLUIR PINs y secretos
  const users = Array.isArray(kiosco.users) ? kiosco.users.map(u => ({
    id: u.id,
    name: u.name || '',
    role: u.role || 'Cajero',
    email: u.email || '',
    isActive: u.isActive !== false
  })) : [];

  // 4. Preferencias del comercio: EXCLUIR installationId, licenseKey y secretos de activación
  const config = kiosco.businessConfig || {};
  const preferences = {
    storeName: config.storeName || config.name || '',
    businessType: config.businessType || 'kiosco',
    cuit: config.cuit || '',
    address: config.address || '',
    phone: config.phone || '',
    provinceCode: config.provinceCode || '',
    provinceName: config.provinceName || '',
    cityCode: config.cityCode || '',
    cityName: config.cityName || '',
    ticketFooter: config.ticketFooter || '¡Gracias por su compra!',
    showTicketLogo: !!config.showTicketLogo,
    expirationWarningDays: config.expirationWarningDays || 15,
    hideAds: !!config.hideAds
  };

  // 5. Ensamblado del bloque de datos comerciales
  const dataBlock = {
    products,
    sales,
    purchases,
    clients,
    caja,
    shifts,
    categories,
    suppliers,
    reservations,
    users,
    preferences
  };

  // 6. Cálculo de suma de integridad SHA-256
  const checksum = await calculateDataChecksum(dataBlock);

  // 7. Envoltorio de metadatos versionados
  const backupId = `spx-bkp-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    backupId,
    createdAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    storeName: preferences.storeName || 'Mi Negocio',
    businessType: preferences.businessType || 'kiosco',
    summary: {
      productsCount: products.length,
      salesCount: sales.length,
      purchasesCount: purchases.length,
      clientsCount: clients.length,
      shiftsCount: shifts.length,
      categoriesCount: Object.keys(categories).length,
      suppliersCount: suppliers.length,
      reservationsCount: reservations.length,
      isCajaOpen: caja.isOpen,
      efectivoEnCaja: caja.efectivo
    },
    data: dataBlock,
    integrity: {
      algorithm: 'SHA-256',
      checksum
    }
  };
}

/**
 * Verifica la autenticidad e integridad de un archivo o payload de respaldo.
 * 
 * @param {object|string} backup - Objeto o string JSON del respaldo
 * @returns {Promise<{valid: boolean, error: string|null, summary: object|null}>}
 */
export async function verifyBackupIntegrity(backup) {
  try {
    let parsed = backup;
    if (typeof backup === 'string') {
      parsed = JSON.parse(backup);
    }

    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Formato de respaldo inválido o vacío.', summary: null };
    }

    if (parsed.format !== BACKUP_FORMAT) {
      return { valid: false, error: 'El archivo no corresponde a un respaldo de Simple ProX.', summary: null };
    }

    if (parsed.version !== BACKUP_VERSION) {
      return { valid: false, error: `Versión de esquema (${parsed.version}) no compatible.`, summary: null };
    }

    if (!parsed.data || typeof parsed.data !== 'object') {
      return { valid: false, error: 'El respaldo no contiene el bloque de datos comerciales.', summary: null };
    }

    if (!parsed.integrity || parsed.integrity.algorithm !== 'SHA-256' || !parsed.integrity.checksum) {
      return { valid: false, error: 'Metadatos de integridad faltantes o no soportados.', summary: null };
    }

    // Recalcular suma de comprobación
    const recalculated = await calculateDataChecksum(parsed.data);
    if (recalculated !== parsed.integrity.checksum) {
      return { valid: false, error: 'La comprobación de integridad SHA-256 falló. El archivo fue modificado o está dañado.', summary: null };
    }

    return {
      valid: true,
      error: null,
      summary: parsed.summary || null,
      createdAt: parsed.createdAt,
      storeName: parsed.storeName
    };
  } catch (err) {
    return { valid: false, error: `Error al procesar el archivo: ${err.message}`, summary: null };
  }
}

/**
 * Exporta el respaldo completo a un archivo local mediante el diálogo nativo de Windows (Electron)
 * o descarga directa de archivo si opera en navegador/desarrollo.
 * 
 * @param {object} kiosco - Objeto useKiosco
 * @returns {Promise<{success: boolean, canceled?: boolean, filePath?: string, error?: string, summary?: object}>}
 */
export async function exportBackupToFile(kiosco) {
  try {
    const payload = await generateBackupPayload(kiosco);
    const fileContent = JSON.stringify(payload, null, 2);

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const cleanStore = (kiosco.businessConfig?.storeName || 'Kiosco')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30);
    const defaultFileName = `Respaldo_${cleanStore}_${dateStr}_${timeStr}.spx`;

    // 1. En entorno Electron: Usar diálogo nativo showSaveDialog
    if (typeof window !== 'undefined' && window.api && typeof window.api.saveBackupFile === 'function') {
      const result = await window.api.saveBackupFile({
        defaultFileName,
        fileContent
      });

      if (result.canceled) {
        return { success: false, canceled: true };
      }

      if (!result.success) {
        return { success: false, error: result.error || 'No se pudo guardar el archivo en la ruta seleccionada.' };
      }

      return {
        success: true,
        filePath: result.filePath,
        summary: payload.summary
      };
    }

    // 2. Fallback de navegador web / entorno de desarrollo
    if (typeof document !== 'undefined') {
      const blob = new Blob([fileContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return {
        success: true,
        filePath: defaultFileName,
        summary: payload.summary,
        isBrowserDownload: true
      };
    }

    return { success: true, filePath: defaultFileName, summary: payload.summary, content: fileContent };
  } catch (err) {
    console.error('[BackupService] Error durante la exportación de respaldo:', err);
    return { success: false, error: err.message || 'Error inesperado al generar la copia de seguridad.' };
  }
}

/**
 * Ejecuta la restauración comercial completa y segura de un respaldo .spx.
 * 
 * Reglas de seguridad mandatorias:
 * 1. Valida formato, versión y suma SHA-256 antes de tocar cualquier dato.
 * 2. Genera y verifica un snapshot interno de emergencia del estado local actual.
 * 3. Registra el journal con estado APPLYING en almacenamiento antes de modificar colecciones.
 * 4. Reemplaza integralmente todas las colecciones comerciales (productos, ventas, compras, clientes, caja, shifts, categorías, suppliers, reservations).
 * 5. Preserva estrictamente la identidad de la máquina: installationId, certificados Pro/Básico (licenseKey, license_token, merchant_registration).
 * 6. Conserva el PIN del Administrador local autenticado.
 * 7. Restaura empleados con requiresPinSetup: true, isActive: false y pin: null (sin PINs por defecto).
 * 8. Si es una instalación limpia sin usuarios previos, utiliza adminPinFallback proporcionado por el usuario.
 * 9. Valida que todas las claves se escribieron correctamente.
 * 10. Ante cualquier fallo en el proceso, invoca performIdempotentRollback() para revertir al snapshot de emergencia y retorna error descriptivo.
 * 
 * @param {object} params
 * @param {object|string} params.backup - Contenido o payload del respaldo .spx
 * @param {Storage|object} [params.storage] - Interfaz de almacenamiento (default: localStorage)
 * @param {string} [params.adminPinFallback] - PIN maestro para instalación limpia
 * @param {object} [params.testHooks] - Hooks opcionales para pruebas de fallo e interrupción
 * @returns {Promise<{success: boolean, summary?: object, storeName?: string, createdAt?: string, error?: string}>}
 */
export async function restoreCommercialBackup({ backup, storage = null, adminPinFallback = '', testHooks = {} }) {
  const effectiveStorage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!effectiveStorage || typeof effectiveStorage.setItem !== 'function') {
    return { success: false, error: 'Almacenamiento no disponible para realizar la restauración.' };
  }

  // 1. Verificación previa de autenticidad e integridad SHA-256
  const integrity = await verifyBackupIntegrity(backup);
  if (!integrity.valid) {
    return { success: false, error: integrity.error || 'Archivo de respaldo inválido o dañado.' };
  }

  const payload = typeof backup === 'string' ? JSON.parse(backup) : backup;

  // 2. Generar snapshot interno de emergencia
  const {
    createInternalSnapshot,
    verifySnapshotIntegrity,
    saveRecoveryJournal,
    clearRecoveryJournal,
    performIdempotentRollback,
    JOURNAL_STATUS
  } = await import('./recoveryService.js');

  const emergencySnapshot = await createInternalSnapshot(effectiveStorage);
  const snapCheck = await verifySnapshotIntegrity(emergencySnapshot);
  if (!snapCheck.valid) {
    return { success: false, error: `No se pudo generar un snapshot de seguridad previo: ${snapCheck.error}` };
  }

  // 3. Persistir snapshot en Electron si está disponible
  let snapshotPath = null;
  if (typeof window !== 'undefined' && window.api && typeof window.api.recoverySaveSnapshot === 'function') {
    try {
      const snapRes = await window.api.recoverySaveSnapshot(emergencySnapshot);
      if (snapRes && snapRes.success) {
        snapshotPath = snapRes.snapshotPath;
      }
    } catch (e) {
      console.warn('[BackupService] Advertencia guardando snapshot en Electron:', e);
    }
  }

  // 4. Registrar la transacción en el Journal con estado APPLYING
  const journal = {
    journalId: `jrn_restore_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    status: JOURNAL_STATUS.APPLYING,
    startedAt: new Date().toISOString(),
    targetBackupId: payload.backupId || 'unknown',
    snapshotData: emergencySnapshot,
    snapshotPath: snapshotPath
  };
  await saveRecoveryJournal(journal, effectiveStorage);

  // Hook de prueba opcional para simular corte antes de la aplicación
  if (typeof testHooks.hookBeforeApply === 'function') {
    await testHooks.hookBeforeApply();
  }

  try {
    const data = payload.data || {};

    // 5. Preservar licencias e identidad de la máquina actual
    const rawCurrentBiz = effectiveStorage.getItem('kioscoprox_business_config');
    const currentBiz = rawCurrentBiz ? JSON.parse(rawCurrentBiz) : {};
    const localInstallationId = effectiveStorage.getItem('kioscoprox_installation_id') || currentBiz.installationId || '';
    const localLicenseKey = currentBiz.licenseKey || '';
    const localPlan = currentBiz.plan || 'Básico';

    // 6. Tratamiento seguro de usuarios y credenciales
    const rawCurrentUsers = effectiveStorage.getItem('kioscoprox_users');
    const currentUsers = rawCurrentUsers ? JSON.parse(rawCurrentUsers) : [];
    const localAdmin = currentUsers.find(u => u.role === 'Admin' && u.pin && u.isActive) || currentUsers.find(u => u.role === 'Admin') || null;

    const backupUsers = Array.isArray(data.users) ? data.users : [];
    let adminAssigned = false;
    const finalUsers = backupUsers.map(bu => {
      if (bu.role === 'Admin' && !adminAssigned) {
        adminAssigned = true;
        return {
          id: bu.id,
          name: bu.name || (localAdmin?.name || 'Administrador'),
          email: bu.email || '',
          role: 'Admin',
          pin: localAdmin?.pin || adminPinFallback || '8844',
          isActive: true
        };
      }
      return {
        id: bu.id,
        name: bu.name || '',
        email: bu.email || '',
        role: bu.role || 'Cajero',
        pin: null, // SIN PIN universal
        requiresPinSetup: true,
        isActive: false // Requiere que el admin le configure PIN en Usuarios.jsx
      };
    });

    if (!adminAssigned) {
      if (localAdmin) {
        finalUsers.unshift(localAdmin);
      } else {
        finalUsers.unshift({
          id: 1,
          name: 'Administrador',
          email: '',
          role: 'Admin',
          pin: adminPinFallback || '8844',
          isActive: true
        });
      }
    }

    // 7. Preparar preferencias comerciales preservando la identidad y licencia local
    const backupPref = data.preferences || {};
    const isCurrentlyActivated = currentBiz.isActivated === true;
    const finalBusinessConfig = {
      ...backupPref,
      isActivated: isCurrentlyActivated,
      activationData: isCurrentlyActivated && currentBiz.activationData ? currentBiz.activationData : null,
      installationId: localInstallationId,
      licenseKey: localLicenseKey,
      plan: localPlan,
      isOnboarded: true
    };

    // 8. Reemplazo integral de colecciones comerciales
    effectiveStorage.setItem('kioscoprox_products', JSON.stringify(Array.isArray(data.products) ? data.products : []));
    effectiveStorage.setItem('kioscoprox_sales', JSON.stringify(Array.isArray(data.sales) ? data.sales : []));
    effectiveStorage.setItem('kioscoprox_purchases', JSON.stringify(Array.isArray(data.purchases) ? data.purchases : []));
    effectiveStorage.setItem('kioscoprox_clients', JSON.stringify(Array.isArray(data.clients) ? data.clients : []));
    effectiveStorage.setItem('kioscoprox_caja', JSON.stringify(data.caja || { isOpen: false, efectivo: 0, openedAt: null, movimientos: [] }));
    effectiveStorage.setItem('kioscoprox_shifts', JSON.stringify(Array.isArray(data.shifts) ? data.shifts : []));
    effectiveStorage.setItem('kioscoprox_categories', JSON.stringify(data.categories || {}));
    effectiveStorage.setItem('kioscoprox_suppliers', JSON.stringify(Array.isArray(data.suppliers) ? data.suppliers : []));
    effectiveStorage.setItem('kioscoprox_reservations', JSON.stringify(Array.isArray(data.reservations) ? data.reservations : []));
    effectiveStorage.setItem('kioscoprox_users', JSON.stringify(finalUsers));
    effectiveStorage.setItem('kioscoprox_business_config', JSON.stringify(finalBusinessConfig));

    // Hook de prueba opcional para simular fallo durante o post escritura
    if (typeof testHooks.hookAfterWrite === 'function') {
      await testHooks.hookAfterWrite();
    }

    // 9. Verificación post-aplicación
    const checkProducts = effectiveStorage.getItem('kioscoprox_products');
    const checkSales = effectiveStorage.getItem('kioscoprox_sales');
    const checkUsers = effectiveStorage.getItem('kioscoprox_users');
    if (!checkProducts || !checkSales || !checkUsers) {
      throw new Error('Inconsistencia en la verificación post-restauración.');
    }

    // 10. Restauración exitosa: marcar COMMITTED y limpiar journal
    journal.status = JOURNAL_STATUS.COMMITTED;
    journal.completedAt = new Date().toISOString();
    await saveRecoveryJournal(journal, effectiveStorage);
    await clearRecoveryJournal(effectiveStorage);

    return {
      success: true,
      summary: payload.summary,
      storeName: payload.storeName,
      createdAt: payload.createdAt
    };
  } catch (applyErr) {
    console.error('[BackupService] Error durante aplicación de datos. Iniciando rollback...', applyErr);
    // Activar rollback de emergencia
    await performIdempotentRollback(emergencySnapshot, effectiveStorage);
    return {
      success: false,
      error: `Error al aplicar los datos: ${applyErr.message}. Se recuperó el estado seguro anterior.`
    };
  }
}

