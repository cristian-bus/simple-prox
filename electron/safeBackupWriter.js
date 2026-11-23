// Submódulo de Escritura Atómica y Segura de Archivos de Respaldo (.spx) para Simple ProX
// Garantiza que ninguna interrupción, corte de luz o error de proceso pueda truncar o corromper un respaldo previo.
// Sigue el patrón: TempFile en mismo volumen + Write + Fsync + Close + Verify + Atomic Rename con reintentos.

import fs from 'fs';
import path from 'path';

// Conjunto de rutas normalizadas actualmente en proceso de escritura (prevención de concurrencia)
const activeBackupSaves = new Set();

/**
 * Normaliza una ruta de archivo para evitar discrepancias por mayúsculas/minúsculas o separadores en Windows.
 * 
 * @param {string} targetPath - Ruta a normalizar
 * @returns {string} - Ruta absoluta normalizada en minúsculas
 */
export function normalizePathKey(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return '';
  return path.resolve(targetPath).toLowerCase();
}

/**
 * Traduce códigos de error del sistema de archivos a mensajes amigables y seguros para el usuario.
 * 
 * @param {Error|object} err - Error capturado del sistema de archivos
 * @returns {string} - Mensaje descriptivo sanitizado
 */
export function formatFsError(err) {
  if (!err) return 'Error desconocido al escribir el archivo.';
  if (err.code === 'ENOSPC') {
    return 'Espacio en disco insuficiente para guardar la copia de seguridad.';
  }
  if (err.code === 'EACCES' || err.code === 'EPERM') {
    return 'Permisos insuficientes para escribir en la ubicación seleccionada.';
  }
  if (err.code === 'EBUSY') {
    return 'El archivo de destino se encuentra en uso o bloqueado por otro proceso.';
  }
  if (err.code === 'EMFILE' || err.code === 'ENFILE') {
    return 'Demasiados archivos abiertos en el sistema operativo.';
  }
  return err.message || 'Error al procesar la escritura del archivo.';
}

/**
 * Realiza el renombrado atómico en el mismo volumen de disco con reintentos para mitigar
 * bloqueos transitorios en Windows causados por antivirus o indexadores de búsqueda.
 * 
 * @param {string} sourcePath - Ruta del archivo temporal
 * @param {string} targetPath - Ruta definitiva del respaldo
 * @param {number} maxAttempts - Número máximo de reintentos
 * @param {number} delayMs - Espera entre reintentos en milisegundos
 */
export async function atomicRenameWithRetry(sourcePath, targetPath, maxAttempts = 3, delayMs = 60) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fs.promises.rename(sourcePath, targetPath);
      return;
    } catch (err) {
      if ((err.code === 'EPERM' || err.code === 'EBUSY') && attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Escribe un archivo de respaldo .spx de forma atómica y resistente a fallos.
 * 
 * Protocolo de seguridad:
 * 1. Control de concurrencia: Evita carreras entre escrituras simultáneas sobre el mismo destino.
 * 2. Archivo temporal en el mismo directorio: Garantiza que reside en el mismo volumen de disco físico (evita EXDEV).
 * 3. Descriptor con fsync: Descarga físicamente los datos al controlador de disco antes de cerrar.
 * 4. Cierre garantizado: Asegura el cierre del descriptor en bloque finally antes de verificar o renombrar.
 * 5. Verificación de integridad: Comprueba tamaño en bytes y contenido leído desde el archivo temporal.
 * 6. Renombrado atómico: Sustituye el destino en una sola operación de metadatos del sistema de archivos.
 * 7. Invariante de fallo: Si cualquier paso falla antes del renombrado, el archivo original NO se modifica.
 * 8. Limpieza segura: El archivo temporal solo se elimina si la operación no culminó con éxito.
 * 
 * NOTA DE DURABILIDAD DE HARDWARE:
 * fsync garantiza la sincronización de búferes a nivel de sistema operativo y envía la orden flush
 * al controlador de almacenamiento. No obstante, la durabilidad absoluta ante pérdidas abruptas de energía
 * depende de la configuración de Write-Caching de Windows y de la memoria no volátil del dispositivo (SSD/HDD).
 * 
 * @param {string} filePath - Ruta completa del archivo destino
 * @param {string} fileContent - Contenido JSON serializado del respaldo
 * @param {object} [options] - Opciones de diagnóstico y pruebas
 * @param {Function} [options.hookBeforeSync] - Hook de prueba para inyectar fallos antes de fsync
 * @param {Function} [options.hookBeforeVerify] - Hook de prueba para inyectar fallos antes de verificar
 * @param {Function} [options.hookBeforeRename] - Hook de prueba para inyectar fallos antes de renombrar
 * @returns {Promise<{success: boolean, filePath?: string, error?: string}>}
 */
export async function writeBackupFileAtomic(filePath, fileContent, options = {}) {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: 'Ruta de archivo no especificada o inválida.' };
  }

  if (typeof fileContent !== 'string') {
    return { success: false, error: 'Contenido del archivo no proporcionado o inválido.' };
  }

  const normKey = normalizePathKey(filePath);

  // 1. Control de concurrencia
  if (activeBackupSaves.has(normKey)) {
    return {
      success: false,
      error: 'Ya existe una operación de guardado en curso para la ruta seleccionada.'
    };
  }
  activeBackupSaves.add(normKey);

  const targetDir = path.dirname(filePath);
  const targetBase = path.basename(filePath);
  const tempName = `.${targetBase}.tmp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const tempPath = path.join(targetDir, tempName);

  let fileHandle = null;
  let tempCreated = false;
  let renameSucceeded = false;

  try {
    // 2. Apertura del descriptor de archivo temporal (modo 'w')
    fileHandle = await fs.promises.open(tempPath, 'w');
    tempCreated = true;

    // 3. Escritura del contenido completo
    await fileHandle.writeFile(fileContent, 'utf8');

    // Hook de prueba opcional (para simular error antes de sync)
    if (typeof options.hookBeforeSync === 'function') {
      await options.hookBeforeSync(tempPath);
    }

    // 4. fsync a nivel de SO y hardware
    await fileHandle.sync();

    // 5. Cierre explícito del descriptor ANTES de cualquier lectura o renombrado
    await fileHandle.close();
    fileHandle = null;

    // Hook de prueba opcional (para simular error antes de verificar)
    if (typeof options.hookBeforeVerify === 'function') {
      await options.hookBeforeVerify(tempPath);
    }

    // 6. Verificación de tamaño en disco y contenido del archivo temporal
    const stats = await fs.promises.stat(tempPath);
    const expectedByteLength = Buffer.byteLength(fileContent, 'utf8');
    if (stats.size !== expectedByteLength) {
      throw new Error(`Verificación de integridad fallida: tamaño en disco (${stats.size} bytes) no coincide con los datos esperados (${expectedByteLength} bytes).`);
    }

    const verifiedContent = await fs.promises.readFile(tempPath, 'utf8');
    if (verifiedContent !== fileContent) {
      throw new Error('Verificación de integridad fallida: el contenido verificado no coincide con el payload original.');
    }

    // Hook de prueba opcional (para simular error antes de renombrar)
    if (typeof options.hookBeforeRename === 'function') {
      await options.hookBeforeRename(tempPath);
    }

    // 7. Renombrado atómico hacia el destino final
    await atomicRenameWithRetry(tempPath, filePath);
    renameSucceeded = true;

    return { success: true, filePath };
  } catch (err) {
    console.error('[SafeBackupWriter] Fallo en escritura de respaldo:', err);
    return {
      success: false,
      error: formatFsError(err)
    };
  } finally {
    // 8. Garantía de cierre del descriptor si ocurrió una excepción previa
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch (closeErr) {
        console.warn('[SafeBackupWriter] Advertencia cerrando descriptor de archivo temporal:', closeErr);
      }
    }

    // 9. Limpieza del archivo temporal únicamente si el proceso falló antes o durante el renombrado
    if (tempCreated && !renameSucceeded) {
      try {
        await fs.promises.unlink(tempPath);
      } catch (unlinkErr) {
        // Ignorar si ya fue removido o inaccesible
      }
    }

    // 10. Liberación del candado de concurrencia
    activeBackupSaves.delete(normKey);
  }
}

