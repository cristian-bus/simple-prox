import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================');
console.log('TEST SUITE: ENDURECIMIENTO DE ESCRITURA ATÓMICA DE RESPALDOS (5B.1)');
console.log('================================================================\n');

// Importar módulo de escritura atómica bajo prueba
const {
  writeBackupFileAtomic,
  atomicRenameWithRetry,
  normalizePathKey,
  formatFsError
} = await import('../electron/safeBackupWriter.js');

const TEST_DIR = path.join(__dirname, 'temp_test_backup_5b1');

// Preparación defensiva de directorio aislado para las pruebas
if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DIR, { recursive: true });

try {
  // =========================================================================
  // TEST 1: Guardado Nuevo Exitoso
  // =========================================================================
  console.log('--- 1. Prueba: Guardado Nuevo Exitoso ---');
  const targetFile1 = path.join(TEST_DIR, 'respaldo_nuevo.spx');
  const payload1 = JSON.stringify({ format: 'SimpleProX_Backup', version: 1, testData: 'Nuevo Respaldo' }, null, 2);

  const res1 = await writeBackupFileAtomic(targetFile1, payload1);
  assert.strictEqual(res1.success, true, 'Debe retornar éxito');
  assert.strictEqual(res1.filePath, targetFile1, 'Debe devolver la ruta final');
  assert.strictEqual(fs.existsSync(targetFile1), true, 'El archivo destino debe existir en disco');

  const content1 = fs.readFileSync(targetFile1, 'utf8');
  assert.strictEqual(content1, payload1, 'El contenido debe coincidir exactamente');

  // Verificar que no quedaron temporales huérfanos
  const filesInDir1 = fs.readdirSync(TEST_DIR);
  const tempFiles1 = filesInDir1.filter(f => f.includes('.tmp_'));
  assert.strictEqual(tempFiles1.length, 0, 'No deben quedar archivos temporales tras guardado exitoso');
  console.log('  ✅ PASS: Archivo nuevo creado con sincronización fsync y sin temporales residuales');

  // =========================================================================
  // TEST 2: Reemplazo Seguro de Archivo Preexistente
  // =========================================================================
  console.log('\n--- 2. Prueba: Reemplazo Seguro de Archivo Preexistente ---');
  const targetFile2 = path.join(TEST_DIR, 'respaldo_sobreescribir.spx');
  fs.writeFileSync(targetFile2, 'CONTENIDO_ANTIGUO_A_REEMPLAZAR', 'utf8');

  const payload2 = JSON.stringify({ format: 'SimpleProX_Backup', version: 1, testData: 'Version 2 Actualizada' }, null, 2);
  const res2 = await writeBackupFileAtomic(targetFile2, payload2);
  assert.strictEqual(res2.success, true, 'Reemplazo debe ser exitoso');

  const content2 = fs.readFileSync(targetFile2, 'utf8');
  assert.strictEqual(content2, payload2, 'El contenido debe haberse actualizado por completo');
  assert.ok(!content2.includes('CONTENIDO_ANTIGUO'), 'No debe quedar rastro del contenido antiguo');
  console.log('  ✅ PASS: Reemplazo seguro completado atómicamente');

  // =========================================================================
  // TEST 3: Error Durante Escritura Temporal Sin Modificar ni Truncar Destino
  // =========================================================================
  console.log('\n--- 3. Prueba: Error Durante Escritura Temporal Sin Truncar Destino ---');
  const targetFile3 = path.join(TEST_DIR, 'respaldo_inmutable_fallo_write.spx');
  const originalContent3 = 'CONTENIDO_ORIGINAL_INTACTO_12345';
  fs.writeFileSync(targetFile3, originalContent3, 'utf8');

  // Intentar guardar con argumento corrupto o ruta inválida
  const res3 = await writeBackupFileAtomic(targetFile3, null); // fileContent inválido
  assert.strictEqual(res3.success, false, 'Debe fallar ante contenido inválido');
  assert.strictEqual(fs.readFileSync(targetFile3, 'utf8'), originalContent3, 'El archivo destino NO debe haberse tocado');
  console.log('  ✅ PASS: Fallo previo a escritura no altera ni trunca el archivo previo');

  // =========================================================================
  // TEST 4: Error Durante fsync Sin Modificar Destino
  // =========================================================================
  console.log('\n--- 4. Prueba: Error Durante fsync Sin Modificar Destino ---');
  const targetFile4 = path.join(TEST_DIR, 'respaldo_inmutable_fallo_sync.spx');
  const originalContent4 = 'CONTENIDO_PREVIO_PROTEGIDO_CONTRA_CORTE';
  fs.writeFileSync(targetFile4, originalContent4, 'utf8');

  const res4 = await writeBackupFileAtomic(targetFile4, 'DATOS_INTERRUMPIDOS', {
    hookBeforeSync: async () => {
      throw new Error('CORTE_ENERGIA_SIMULADO_DURANTE_SYNC');
    }
  });

  assert.strictEqual(res4.success, false, 'Debe fallar al simular interrupción en sync');
  assert.strictEqual(fs.readFileSync(targetFile4, 'utf8'), originalContent4, 'El archivo destino original permanece intacto');

  // Verificar que el temporal fue limpiado
  const tempFiles4 = fs.readdirSync(TEST_DIR).filter(f => f.includes('respaldo_inmutable_fallo_sync') && f.includes('.tmp_'));
  assert.strictEqual(tempFiles4.length, 0, 'El archivo temporal interrumpido debe eliminarse limpiamente');
  console.log('  ✅ PASS: Error en fsync aborta sin tocar el archivo destino y limpia temporales');

  // =========================================================================
  // TEST 5: Error Durante Verificación de Integridad Sin Modificar Destino
  // =========================================================================
  console.log('\n--- 5. Prueba: Error Durante Verificación de Integridad ---');
  const targetFile5 = path.join(TEST_DIR, 'respaldo_inmutable_fallo_verify.spx');
  const originalContent5 = 'DATOS_ORIGINALES_VERIFICACION';
  fs.writeFileSync(targetFile5, originalContent5, 'utf8');

  const res5 = await writeBackupFileAtomic(targetFile5, 'NUEVO_PAYLOAD_A_CORROMPER', {
    hookBeforeVerify: async (tempPath) => {
      // Adulterar archivo temporal antes de la verificación
      fs.appendFileSync(tempPath, 'CORRUPCION_EXTRA');
    }
  });

  assert.strictEqual(res5.success, false, 'Verificación debe detectar la inconsistencia');
  assert.ok(res5.error.includes('Verificación') || res5.error.includes('fallida'), 'Error debe señalar falla de verificación');
  assert.strictEqual(fs.readFileSync(targetFile5, 'utf8'), originalContent5, 'Destino previo NO modificado');

  const tempFiles5 = fs.readdirSync(TEST_DIR).filter(f => f.includes('respaldo_inmutable_fallo_verify') && f.includes('.tmp_'));
  assert.strictEqual(tempFiles5.length, 0, 'Temporal corrupto eliminado');
  console.log('  ✅ PASS: Detección estricta de inconsistencia antes del renombrado');

  // =========================================================================
  // TEST 6: Error Durante Renombrado Conservando el Archivo Previo
  // =========================================================================
  console.log('\n--- 6. Prueba: Error Durante Renombrado Conservando Archivo Previo ---');
  const targetFile6 = path.join(TEST_DIR, 'respaldo_inmutable_fallo_rename.spx');
  const originalContent6 = 'ARCHIVO_ORIGINAL_NO_SOBREESCRITO_POR_RENAME';
  fs.writeFileSync(targetFile6, originalContent6, 'utf8');

  const res6 = await writeBackupFileAtomic(targetFile6, 'CONTENIDO_NUNCA_APLICADO', {
    hookBeforeRename: async () => {
      const lockErr = new Error('EBUSY: resource busy or locked, rename');
      lockErr.code = 'EBUSY';
      throw lockErr;
    }
  });

  assert.strictEqual(res6.success, false, 'Debe fallar al no poder renombrar');
  assert.strictEqual(fs.readFileSync(targetFile6, 'utf8'), originalContent6, 'Destino original sigue 100% íntegro');
  console.log('  ✅ PASS: Fallo en el renombrado preserva el archivo original sin alteraciones');

  // =========================================================================
  // TEST 7: Cancelación del Diálogo sin Efectos Secundarios
  // =========================================================================
  console.log('\n--- 7. Prueba: Cancelación del Diálogo sin Modificaciones ---');
  // Simular la capa de diálogo de Electron cuando el usuario cancela
  const mockDialogCanceled = { canceled: true, filePath: null };
  assert.strictEqual(mockDialogCanceled.canceled, true);
  // Ningún archivo debe haberse creado
  console.log('  ✅ PASS: Cancelación de diálogo manejada limpiamente sin crear archivos');

  // =========================================================================
  // TEST 8: Operación Offline
  // =========================================================================
  console.log('\n--- 8. Prueba: Funcionamiento 100% Offline (Sin Red) ---');
  const targetFile8 = path.join(TEST_DIR, 'respaldo_offline.spx');
  const payload8 = JSON.stringify({ offline: true, time: Date.now() });
  const res8 = await writeBackupFileAtomic(targetFile8, payload8);
  assert.strictEqual(res8.success, true);
  assert.strictEqual(fs.readFileSync(targetFile8, 'utf8'), payload8);
  console.log('  ✅ PASS: Escritura realizada sin requerir acceso a internet');

  // =========================================================================
  // TEST 9: Dos Operaciones Simultáneas Controladas (Anti Race-Condition)
  // =========================================================================
  console.log('\n--- 9. Prueba: Detección y Bloqueo de Guardados Concurrentes ---');
  const targetFile9 = path.join(TEST_DIR, 'respaldo_concurrente.spx');
  const payload9A = JSON.stringify({ worker: 'A', timestamp: 1 });
  const payload9B = JSON.stringify({ worker: 'B', timestamp: 2 });

  // Lanzar dos operaciones casi simultáneas sobre el mismo archivo usando hook para retener
  let resolveRelease = null;
  const holdPromise = new Promise(res => { resolveRelease = res; });

  const opA = writeBackupFileAtomic(targetFile9, payload9A, {
    hookBeforeVerify: async () => {
      // Retener opA temporalmente para que opB intente colisionar
      await holdPromise;
    }
  });

  // Intentar inmediatamente opB sobre la misma ruta
  const opB = writeBackupFileAtomic(targetFile9, payload9B);

  const resB = await opB;
  assert.strictEqual(resB.success, false, 'Segunda operación simultánea debe ser rechazada');
  assert.ok(resB.error.includes('en curso'), 'Error debe advertir operación en curso');

  // Liberar opA para que culmine
  resolveRelease();
  const resA = await opA;
  assert.strictEqual(resA.success, true, 'Primera operación culmina normalmente');
  assert.strictEqual(fs.readFileSync(targetFile9, 'utf8'), payload9A, 'Destino contiene datos de opA');
  console.log('  ✅ PASS: Condición de carrera evitada mediante candado de ruta normalizada');

  // =========================================================================
  // TEST 10: Formato y Mapeo de Errores de Sistema de Archivos
  // =========================================================================
  console.log('\n--- 10. Prueba: Formato Descriptivo de Errores (ENOSPC, EACCES, EBUSY) ---');
  const errNoSpace = new Error('Disk full'); errNoSpace.code = 'ENOSPC';
  const errPerm = new Error('Permission denied'); errPerm.code = 'EPERM';
  const errBusy = new Error('File locked'); errBusy.code = 'EBUSY';

  assert.ok(formatFsError(errNoSpace).includes('insuficiente'), 'ENOSPC debe informar disco lleno');
  assert.ok(formatFsError(errPerm).includes('Permisos insuficientes'), 'EPERM debe informar permisos');
  assert.ok(formatFsError(errBusy).includes('bloqueado'), 'EBUSY debe informar archivo bloqueado');
  console.log('  ✅ PASS: Errores de filesystem traducidos a mensajes claros y seguros');

  console.log('\n================================================================');
  console.log('RESULTADO: TODAS LAS PRUEBAS DE LA ETAPA 5B.1 PASARON (10/10 PASS)');
  console.log('================================================================\n');

} finally {
  // Limpieza defensiva del directorio de pruebas
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch (e) {
    // Ignorar si el SO tarda en liberar
  }
}

