// Servicio de Infraestructura de Recuperación ante Restauraciones Interrumpidas para Simple ProX
// Proporciona gestión de Journal Persistente, Snapshots Internos de Emergencia y Rollback Idempotente.
// Regla: No modifica datos comerciales durante operación normal; garantiza cero duplicaciones y preservación de PINs y licencias.

import { calculateDataChecksum } from './backupService.js';

export const SNAPSHOT_FORMAT = 'SimpleProX_InternalEmergencySnapshot';
export const SNAPSHOT_VERSION = 1;

export const JOURNAL_STATUS = {
  IDLE: 'IDLE',
  PREPARING: 'PREPARING',
  SNAPSHOT_VERIFIED: 'SNAPSHOT_VERIFIED',
  APPLYING: 'APPLYING',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
  RECOVERING: 'RECOVERING',
  COMMITTED: 'COMMITTED'
};

// Claves comerciales y de usuario a respaldar en el snapshot de emergencia
export const RECOVERY_AFFECTED_KEYS = [
  'kioscoprox_products',
  'kioscoprox_sales',
  'kioscoprox_purchases',
  'kioscoprox_clients',
  'kioscoprox_caja',
  'kioscoprox_shifts',
  'kioscoprox_categories',
  'kioscoprox_suppliers',
  'kioscoprox_reservations',
  'kioscoprox_users', // Preserva credenciales locales y PINs en el snapshot local
  'kioscoprox_business_config'
];

// Claves de identidad y licencias que NUNCA deben sobrescribirse
export const PRESERVED_IDENTITY_KEYS = [
  'kioscoprox_installation_id',
  'kioscoprox_license_token',
  'kioscoprox_merchant_registration'
];

export const JOURNAL_STORAGE_KEY = 'kioscoprox_restore_journal_state';

/**
 * Genera un Snapshot Interno de Emergencia a partir del almacenamiento local actual.
 * El snapshot captura exactamente las cadenas serializadas de todas las entidades comerciales y usuarios locales.
 * 
 * @param {Storage|object} storage - Interfaz localStorage o storage mock
 * @param {string} [installationId] - Identificador de instalación local
 * @returns {Promise<object>} - Snapshot estructurado con suma SHA-256
 */
export async function createInternalSnapshot(storage, installationId = '') {
  if (!storage || typeof storage.getItem !== 'function') {
    throw new Error('Almacenamiento no disponible para generar snapshot interno');
  }

  const dataBlock = {};
  for (const key of RECOVERY_AFFECTED_KEYS) {
    const val = storage.getItem(key);
    dataBlock[key] = val !== null ? val : null;
  }

  const checksum = await calculateDataChecksum(dataBlock);
  const snapshotId = `snp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    snapshotId,
    createdAt: new Date().toISOString(),
    installationId: installationId || storage.getItem('kioscoprox_installation_id') || '',
    data: dataBlock,
    checksum
  };
}

/**
 * Valida la autenticidad e integridad criptográfica de un Snapshot Interno de Emergencia.
 * 
 * @param {object} snapshot - Objeto snapshot
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function verifySnapshotIntegrity(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, error: 'Snapshot inexistente o vacío.' };
  }

  if (snapshot.format !== SNAPSHOT_FORMAT) {
    return { valid: false, error: 'El formato no corresponde a un Snapshot Interno de Simple ProX.' };
  }

  if (snapshot.version !== SNAPSHOT_VERSION) {
    return { valid: false, error: `Versión de snapshot (${snapshot.version}) no compatible.` };
  }

  if (!snapshot.data || typeof snapshot.data !== 'object') {
    return { valid: false, error: 'El snapshot no contiene el bloque de datos requerido.' };
  }

  if (!snapshot.checksum || typeof snapshot.checksum !== 'string') {
    return { valid: false, error: 'Metadatos de verificación criptográfica faltantes.' };
  }

  try {
    const recalculated = await calculateDataChecksum(snapshot.data);
    if (recalculated !== snapshot.checksum) {
      return { valid: false, error: 'Integridad SHA-256 violada. El snapshot está corrupto o fue adulterado.' };
    }
  } catch (e) {
    return { valid: false, error: `Error calculando verificación criptográfica: ${e.message}` };
  }

  return { valid: true };
}

/**
 * Guarda el Journal de Restauración tanto en almacenamiento rápido local como en Electron IPC si está disponible.
 * 
 * @param {object} journal - Objeto de journal
 * @param {Storage|object} [storage] - Interfaz de almacenamiento
 * @returns {Promise<boolean>}
 */
export async function saveRecoveryJournal(journal, storage = null) {
  if (!journal || !journal.status) {
    throw new Error('Journal inválido');
  }

  const serialized = JSON.stringify(journal);

  // 1. Persistencia rápida en almacenamiento local / renderer
  const effectiveStorage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (effectiveStorage && typeof effectiveStorage.setItem === 'function') {
    effectiveStorage.setItem(JOURNAL_STORAGE_KEY, serialized);
  }

  // 2. Persistencia en archivo de Electron si está disponible
  if (typeof window !== 'undefined' && window.api && typeof window.api.recoverySaveJournal === 'function') {
    try {
      await window.api.recoverySaveJournal(journal);
    } catch (e) {
      console.warn('[RecoveryService] Advertencia guardando journal en Electron:', e);
    }
  }

  return true;
}

/**
 * Obtiene el Journal de Restauración pendiente si existe, comprobando Electron IPC y almacenamiento local.
 * REGLA ESTRICTA DE SEGURIDAD (ETAPA 5B.3):
 * - Si CUALQUIERA de los dos registros (disco o localStorage) indica una restauración pendiente, bloquear el POS.
 * - Si existe discrepancia entre el journal de disco y el local, asume la postura más defensiva (RECOVERY_REQUIRED)
 *   y unifica los snapshots disponibles para garantizar el rollback.
 * 
 * @param {Storage|object} [storage] - Interfaz de almacenamiento
 * @param {object} [mockElectronJournal] - Journal de disco inyectable para pruebas unitarias
 * @returns {Promise<object|null>} - Journal activo o null si no hay restauraciones pendientes
 */
export async function getPendingRecoveryJournal(storage = null, mockElectronJournal = undefined) {
  let diskJournal = null;
  let localJournal = null;

  // 1. Consultar archivo persistente en Electron si está disponible (o mock de pruebas)
  if (mockElectronJournal !== undefined) {
    diskJournal = mockElectronJournal;
  } else if (typeof window !== 'undefined' && window.api && typeof window.api.recoveryCheckJournal === 'function') {
    try {
      diskJournal = await window.api.recoveryCheckJournal();
    } catch (e) {
      console.warn('[RecoveryService] Advertencia consultando journal en Electron:', e);
    }
  }

  // 2. Consultar almacenamiento local
  const effectiveStorage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (effectiveStorage && typeof effectiveStorage.getItem === 'function') {
    try {
      const raw = effectiveStorage.getItem(JOURNAL_STORAGE_KEY);
      if (raw) {
        localJournal = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[RecoveryService] Error leyendo journal local:', e);
    }
  }

  const isPending = (j) => j && j.status && j.status !== JOURNAL_STATUS.IDLE && j.status !== JOURNAL_STATUS.COMMITTED;

  const diskPending = isPending(diskJournal);
  const localPending = isPending(localJournal);

  // Si AMBOS indican restauración pendiente, unificar de forma defensiva
  if (diskPending && localPending) {
    const snapshotData = diskJournal.snapshotData || localJournal.snapshotData || null;
    const snapshotPath = diskJournal.snapshotPath || localJournal.snapshotPath || null;
    const hasDiscrepancy = diskJournal.status !== localJournal.status || diskJournal.journalId !== localJournal.journalId;

    return {
      ...(diskJournal || localJournal),
      snapshotData,
      snapshotPath,
      status: JOURNAL_STATUS.RECOVERY_REQUIRED,
      hasDiscrepancy
    };
  }

  // Si cualquiera de los dos indica restauración pendiente, bloquear
  if (diskPending) return diskJournal;
  if (localPending) return localJournal;

  return null;
}

/**
 * Limpia el Journal de Restauración cuando el rollback o la restauración han sido verificados al 100%.
 * 
 * @param {Storage|object} [storage] - Interfaz de almacenamiento
 * @returns {Promise<boolean>}
 */
export async function clearRecoveryJournal(storage = null) {
  const effectiveStorage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (effectiveStorage && typeof effectiveStorage.removeItem === 'function') {
    effectiveStorage.removeItem(JOURNAL_STORAGE_KEY);
  }

  if (typeof window !== 'undefined' && window.api && typeof window.api.recoveryClearJournal === 'function') {
    try {
      await window.api.recoveryClearJournal();
    } catch (e) {
      console.warn('[RecoveryService] Advertencia limpiando journal en Electron:', e);
    }
  }

  return true;
}

/**
 * Ejecuta un Rollback Idempotente aplicando exactamente los datos del snapshot interno verificado.
 * REGLAS DE SEGURIDAD:
 * - Valida criptográficamente el snapshot ANTES de escribir cualquier clave.
 * - Restaura las cadenas exactas en almacenamiento.
 * - Verifica clave por clave que lo escrito coincide con el snapshot.
 * - Idempotente: puede ejecutarse repetidamente produciendo exactamente el mismo estado sin duplicar ventas, caja ni stock.
 * - NO borra el journal hasta confirmar la verificación post-escritura.
 * 
 * @param {object} snapshot - Snapshot interno verificado
 * @param {Storage|object} storage - Almacenamiento local a recuperar
 * @returns {Promise<{success: boolean, error?: string, recoveredKeys?: string[]}>}
 */
export async function performIdempotentRollback(snapshot, storage) {
  if (!storage || typeof storage.setItem !== 'function' || typeof storage.getItem !== 'function') {
    return { success: false, error: 'Almacenamiento destino inválido para rollback.' };
  }

  // 1. Validación previa estricta del snapshot
  const verification = await verifySnapshotIntegrity(snapshot);
  if (!verification.valid) {
    return { success: false, error: `Rollback abortado: ${verification.error}` };
  }

  const recoveredKeys = [];

  try {
    // 2. Aplicación atómica de claves registradas en el snapshot
    for (const [key, value] of Object.entries(snapshot.data)) {
      if (value !== null && value !== undefined) {
        storage.setItem(key, value);
      } else {
        storage.removeItem(key);
      }
      recoveredKeys.push(key);
    }

    // 3. Verificación post-aplicación: comprobar que cada clave coincide exactamente
    for (const [key, expectedValue] of Object.entries(snapshot.data)) {
      const currentValue = storage.getItem(key);
      if (expectedValue !== null && expectedValue !== undefined) {
        if (currentValue !== expectedValue) {
          throw new Error(`Inconsistencia detectada en clave ${key} tras rollback.`);
        }
      } else {
        if (currentValue !== null) {
          throw new Error(`La clave ${key} debía ser removida pero aún existe.`);
        }
      }
    }

    return {
      success: true,
      recoveredKeys
    };
  } catch (err) {
    console.error('[RecoveryService] Error durante rollback:', err);
    return {
      success: false,
      error: `Error durante la recuperación de datos: ${err.message}`
    };
  }
}

