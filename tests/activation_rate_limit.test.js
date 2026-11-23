import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_LOCAL_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_LOCAL_URL, SERVICE_ROLE_KEY);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runRateLimitTests() {
  console.log('================================================================');
  console.log('  BATERÍA DE PRUEBAS LOCALES: RATE LIMIT Y PREVENCIÓN DEADLOCKS  ');
  console.log('================================================================\n');

  // PRUEBA 1: INSERT Inicial con Límite Estricto (max_device_attempts = 1)
  console.log('--- PRUEBA 1: INSERT Inicial con Límite Estricto (max = 1) ---');
  const dev1 = `dev:test_initial_${Date.now()}`;
  const ip1 = `ip:test_initial_${Date.now()}`;

  const { data: res1, error: err1 } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev1,
    p_ip_key: ip1,
    p_max_device_attempts: 1, // Límite 1 desde el primer intento
    p_max_ip_attempts: 10,
    p_window_seconds: 60,
    p_block_seconds: 60,
  });

  assert.strictEqual(err1, null, `Error en RPC 1: ${err1?.message}`);
  assert.strictEqual(res1.allowed, false, 'El intento 1 debió ser bloqueado inmediatamente con límite=1');
  assert.strictEqual(res1.blocked, true, 'El intento 1 debió marcar blocked=true');
  assert.strictEqual(res1.reason, 'device_blocked_new', 'El motivo debió ser device_blocked_new');
  assert(res1.retry_after_seconds > 0, 'Debe devolver retry_after_seconds positivo');
  console.log('✅ PASS: INSERT inicial respetó el límite estricto en el intento 1.');

  // PRUEBA 2: Bloqueo Progresivo por Dispositivo (3 intentos)
  console.log('\n--- PRUEBA 2: Bloqueo Progresivo por Dispositivo (límite = 3) ---');
  const dev2 = `dev:test_prog_${Date.now()}`;
  const ip2 = `ip:test_prog_${Date.now()}`;

  // Intento 1
  const { data: p2_1 } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev2, p_ip_key: ip2, p_max_device_attempts: 3, p_max_ip_attempts: 10, p_window_seconds: 60, p_block_seconds: 60,
  });
  assert.strictEqual(p2_1.allowed, true);
  assert.strictEqual(p2_1.device_attempts, 1);

  // Intento 2
  const { data: p2_2 } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev2, p_ip_key: ip2, p_max_device_attempts: 3, p_max_ip_attempts: 10, p_window_seconds: 60, p_block_seconds: 60,
  });
  assert.strictEqual(p2_2.allowed, true);
  assert.strictEqual(p2_2.device_attempts, 2);

  // Intento 3: debe detonar el bloqueo
  const { data: p2_3 } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev2, p_ip_key: ip2, p_max_device_attempts: 3, p_max_ip_attempts: 10, p_window_seconds: 60, p_block_seconds: 60,
  });
  assert.strictEqual(p2_3.allowed, false);
  assert.strictEqual(p2_3.blocked, true);
  assert.strictEqual(p2_3.reason, 'device_blocked_new');

  // Intento 4: ya se encuentra bloqueado
  const { data: p2_4 } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev2, p_ip_key: ip2, p_max_device_attempts: 3, p_max_ip_attempts: 10, p_window_seconds: 60, p_block_seconds: 60,
  });
  assert.strictEqual(p2_4.allowed, false);
  assert.strictEqual(p2_4.blocked, true);
  assert.strictEqual(p2_4.reason, 'device_blocked');
  console.log('✅ PASS: Dispositivo bloqueado progresivamente en el 3er intento y rechazado en subsecuentes.');

  // PRUEBA 3: Bloqueo por IP compartida
  console.log('\n--- PRUEBA 3: Bloqueo por IP Compartida (límite = 2) ---');
  const sharedIp = `ip:test_shared_ip_${Date.now()}`;
  const dev3_a = `dev:test_dev_a_${Date.now()}`;
  const dev3_b = `dev:test_dev_b_${Date.now()}`;

  const { data: p3_1 } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev3_a, p_ip_key: sharedIp, p_max_device_attempts: 10, p_max_ip_attempts: 2, p_window_seconds: 60, p_block_seconds: 60,
  });
  assert.strictEqual(p3_1.allowed, true);
  assert.strictEqual(p3_1.ip_attempts, 1);

  const { data: p3_2 } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev3_b, p_ip_key: sharedIp, p_max_device_attempts: 10, p_max_ip_attempts: 2, p_window_seconds: 60, p_block_seconds: 60,
  });
  assert.strictEqual(p3_2.allowed, false);
  assert.strictEqual(p3_2.blocked, true);
  assert.strictEqual(p3_2.reason, 'ip_blocked_new');
  console.log('✅ PASS: IP compartida bloqueada al alcanzar su límite específico.');

  // PRUEBA 4: Reinicio de Ventana Temporal (Window Reset)
  console.log('\n--- PRUEBA 4: Reinicio de Ventana Temporal (Window = 2s) ---');
  const dev4 = `dev:test_window_reset_${Date.now()}`;
  const ip4 = `ip:test_window_reset_${Date.now()}`;

  const { data: p4_1 } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev4, p_ip_key: ip4, p_max_device_attempts: 5, p_max_ip_attempts: 10, p_window_seconds: 2, p_block_seconds: 10,
  });
  assert.strictEqual(p4_1.allowed, true);
  assert.strictEqual(p4_1.device_attempts, 1);

  console.log('  Esperando 2.5s para que la ventana de 2s expire...');
  await sleep(2500);

  const { data: p4_2 } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev4, p_ip_key: ip4, p_max_device_attempts: 5, p_max_ip_attempts: 10, p_window_seconds: 2, p_block_seconds: 10,
  });
  assert.strictEqual(p4_2.allowed, true);
  assert.strictEqual(p4_2.device_attempts, 1, 'Los intentos debieron reiniciarse a 1 tras expirar la ventana');
  console.log('✅ PASS: Contador reiniciado correctamente tras superar la ventana de tiempo.');

  // PRUEBA 5: Expiración y Levantamiento de Bloqueo
  console.log('\n--- PRUEBA 5: Expiración y Levantamiento de Bloqueo (Block = 2s) ---');
  const dev5 = `dev:test_block_exp_${Date.now()}`;
  const ip5 = `ip:test_block_exp_${Date.now()}`;

  // Bloquear de inmediato
  const { data: p5_1 } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev5, p_ip_key: ip5, p_max_device_attempts: 1, p_max_ip_attempts: 10, p_window_seconds: 10, p_block_seconds: 2,
  });
  assert.strictEqual(p5_1.allowed, false);
  assert.strictEqual(p5_1.blocked, true);

  console.log('  Esperando 2.5s para que el bloqueo de 2s expire...');
  await sleep(2500);

  // Nuevo intento con límite amplio: debe permitir y haber salido del bloqueo
  const { data: p5_2 } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev5, p_ip_key: ip5, p_max_device_attempts: 5, p_max_ip_attempts: 10, p_window_seconds: 10, p_block_seconds: 2,
  });
  assert.strictEqual(p5_2.allowed, true, 'El intento debió permitirse una vez expirado el bloqueo');
  assert.strictEqual(p5_2.device_attempts, 1, 'El contador debe reiniciarse al levantar el bloqueo');
  console.log('✅ PASS: Bloqueo temporal expiró y permitió nueva solicitud reiniciando contador.');

  // PRUEBA 6: Limpieza Exitosa de Dispositivo (clear_activation_rate_limit)
  console.log('\n--- PRUEBA 6: Limpieza Exitosa de Dispositivo ---');
  const dev6 = `dev:test_clear_${Date.now()}`;
  const ip6 = `ip:test_clear_${Date.now()}`;

  await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev6, p_ip_key: ip6, p_max_device_attempts: 5, p_max_ip_attempts: 10, p_window_seconds: 60, p_block_seconds: 60,
  });

  const { data: rowsBefore } = await supabase
    .from('activation_rate_limits')
    .select('key')
    .eq('key', dev6);
  assert.strictEqual(rowsBefore.length, 1, 'La fila debía existir antes de clear');

  const { error: errClear } = await supabase.rpc('clear_activation_rate_limit', {
    p_device_key: dev6,
  });
  assert.strictEqual(errClear, null);

  const { data: rowsAfter } = await supabase
    .from('activation_rate_limits')
    .select('key')
    .eq('key', dev6);
  assert.strictEqual(rowsAfter.length, 0, 'La fila debió ser eliminada por clear_activation_rate_limit');
  console.log('✅ PASS: clear_activation_rate_limit eliminó el registro del dispositivo exitosamente.');

  // PRUEBA 7: Limpieza Segura de Registros Antiguos (clean_expired_activation_rate_limits)
  console.log('\n--- PRUEBA 7: Limpieza Segura de Registros Antiguos ---');
  const oldKey = `dev:test_old_${Date.now()}`;
  const activeKey = `dev:test_active_${Date.now()}`;

  // Insertar un registro simulado antiguo (hace 2 horas) y uno activo
  await supabase.from('activation_rate_limits').insert([
    {
      key: oldKey,
      attempts: 5,
      window_start: new Date(Date.now() - 7200000).toISOString(),
      blocked_until: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      key: activeKey,
      attempts: 1,
      window_start: new Date().toISOString(),
      blocked_until: null,
      updated_at: new Date().toISOString(),
    }
  ]);

  // Ejecutar limpieza con umbral de 1800 segundos (30 minutos)
  const { data: deletedCount, error: errClean } = await supabase.rpc('clean_expired_activation_rate_limits', {
    p_older_than_seconds: 1800,
  });
  assert.strictEqual(errClean, null);
  assert(deletedCount >= 1, `Debió eliminar al menos 1 registro antiguo (eliminados: ${deletedCount})`);

  // Verificar que el registro viejo no existe pero el activo sí
  const { data: oldCheck } = await supabase.from('activation_rate_limits').select('key').eq('key', oldKey);
  const { data: activeCheck } = await supabase.from('activation_rate_limits').select('key').eq('key', activeKey);
  assert.strictEqual(oldCheck.length, 0, 'El registro expirado debió ser eliminado');
  assert.strictEqual(activeCheck.length, 1, 'El registro activo debe permanecer intacto');
  console.log(`✅ PASS: clean_expired_activation_rate_limits eliminó ${deletedCount} registros antiguos preservando los activos.`);

  // PRUEBA 8: Caso Límite de Claves Idénticas (p_device_key = p_ip_key)
  console.log('\n--- PRUEBA 8: Claves Idénticas (p_device_key = p_ip_key) ---');
  const sameKey = `test_same_key_${Date.now()}`;
  const { data: p8, error: err8 } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: sameKey,
    p_ip_key: sameKey,
    p_max_device_attempts: 5,
    p_max_ip_attempts: 5,
    p_window_seconds: 60,
    p_block_seconds: 60,
  });
  assert.strictEqual(err8, null);
  assert.strictEqual(p8.allowed, true);
  assert.strictEqual(p8.device_attempts, 1);
  console.log('✅ PASS: Claves idénticas manejadas sin colisiones internas ni doble incremento.');

  // PRUEBA 9: Concurrencia Real Cruzada y Prevención de Deadlocks
  console.log('\n--- PRUEBA 9: Concurrencia Real Cruzada y Prevención de Deadlocks (30 solicitudes simultáneas) ---');
  const keyA = `dev:CONCURRENT_A_${Date.now()}`;
  const keyB = `ip:CONCURRENT_B_${Date.now()}`;

  // Lanzar 30 solicitudes simultáneas:
  // - 15 con (keyA, keyB)
  // - 15 con (keyB, keyA) -> Inversión deliberada para provocar potencial deadlock si no hubiera ordenamiento
  const concurrentCalls = [];
  const TOTAL_CALLS = 30;

  for (let i = 0; i < TOTAL_CALLS; i++) {
    const isEven = i % 2 === 0;
    const devKey = isEven ? keyA : keyB;
    const ipKey = isEven ? keyB : keyA;

    concurrentCalls.push(
      supabase.rpc('check_and_record_activation_attempt', {
        p_device_key: devKey,
        p_ip_key: ipKey,
        p_max_device_attempts: 50, // Límite amplio para enfocarse en contención y bloqueos
        p_max_ip_attempts: 50,
        p_window_seconds: 60,
        p_block_seconds: 60,
      }).then(res => ({
        index: i,
        data: res.data,
        error: res.error,
      }))
    );
  }

  const results = await Promise.all(concurrentCalls);

  // Verificar que NINGUNA solicitud haya fallado con error de PostgreSQL (como 40P01 deadlock_detected)
  const deadlocks = results.filter(r => r.error && (r.error.code === '40P01' || r.error.message?.includes('deadlock')));
  const errors = results.filter(r => r.error !== null);

  assert.strictEqual(deadlocks.length, 0, `¡Se detectaron ${deadlocks.length} DEADLOCKS en la base de datos!`);
  assert.strictEqual(errors.length, 0, `Se detectaron errores en llamadas concurrentes: ${JSON.stringify(errors)}`);

  console.log(`  Total solicitudes concurrentes: ${results.length}`);
  console.log(`  Deadlocks detectados: ${deadlocks.length}`);
  console.log(`  Errores en RPC: ${errors.length}`);
  console.log('✅ PASS: Cero deadlocks y cero errores bajo alta concurrencia cruzada.');

  // PRUEBA 10: Saneamiento Defensivo de Parámetros
  console.log('\n--- PRUEBA 10: Saneamiento Defensivo de Parámetros ---');
  // 10.1 Clave vacía o nula
  const { data: p10_empty_dev } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: '',
    p_ip_key: 'ip:valid',
  });
  assert.strictEqual(p10_empty_dev.allowed, false);
  assert.strictEqual(p10_empty_dev.reason, 'invalid_device_key');

  const { data: p10_empty_ip } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: 'dev:valid',
    p_ip_key: '',
  });
  assert.strictEqual(p10_empty_ip.allowed, false);
  assert.strictEqual(p10_empty_ip.reason, 'invalid_ip_key');

  // 10.2 Parámetros numéricos inválidos o negativos (no deben anular rate limit)
  const dev10_neg = `dev:test_neg_${Date.now()}`;
  const ip10_neg = `ip:test_neg_${Date.now()}`;
  const { data: p10_neg } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev10_neg,
    p_ip_key: ip10_neg,
    p_max_device_attempts: -10, // Saneado a 1
    p_max_ip_attempts: 0,       // Saneado a 1
    p_window_seconds: -50,     // Saneado a 10s
    p_block_seconds: 0,        // Saneado a 10s
  });
  assert.strictEqual(p10_neg.allowed, false, 'Límites <= 0 deben sanearse a 1 e imponer bloqueo inmediato');
  assert.strictEqual(p10_neg.blocked, true);
  assert(p10_neg.retry_after_seconds >= 1, 'El tiempo de bloqueo debe sanearse a mínimo 1s');
  console.log('✅ PASS: Saneamiento defensivo previene anulación de bloqueos ante parámetros maliciosos o erróneos.');

  // PRUEBA 11: Blindaje de Limpieza contra Registros Vigentes
  console.log('\n--- PRUEBA 11: Blindaje de Limpieza contra Registros Vigentes ---');
  const activeBlockedKey = `dev:active_blocked_${Date.now()}`;
  const activeWindowKey = `dev:active_window_${Date.now()}`;

  // Insertar un registro con bloqueo activo en el futuro (10 minutos más)
  // y uno dentro de su ventana activa reciente
  await supabase.from('activation_rate_limits').insert([
    {
      key: activeBlockedKey,
      attempts: 5,
      window_start: new Date().toISOString(),
      blocked_until: new Date(Date.now() + 600000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      key: activeWindowKey,
      attempts: 2,
      window_start: new Date().toISOString(),
      blocked_until: null,
      updated_at: new Date().toISOString(),
    }
  ]);

  // Intentar ejecutar limpieza pasando 0 segundos (intento forzado de purga prematura)
  const { data: purgedCount } = await supabase.rpc('clean_expired_activation_rate_limits', {
    p_older_than_seconds: 0,
  });

  // Verificar que NINGUNO de los registros vigentes fue eliminado
  const { data: chkBlocked } = await supabase.from('activation_rate_limits').select('key').eq('key', activeBlockedKey);
  const { data: chkWindow } = await supabase.from('activation_rate_limits').select('key').eq('key', activeWindowKey);
  assert.strictEqual(chkBlocked.length, 1, 'Un bloqueo activo vigente NUNCA debe ser eliminado por la limpieza');
  assert.strictEqual(chkWindow.length, 1, 'Un contador activo con actividad reciente NUNCA debe ser eliminado');
  console.log('✅ PASS: La limpieza no puede ser manipulada para purgar registros activos o vigentes.');

  // PRUEBA 12: Bloqueo Estricto de Acceso para Rol Anónimo / Público
  console.log('\n--- PRUEBA 12: Bloqueo Estricto de Acceso para Rol Anónimo / Público ---');
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  const anonSupabase = createClient(SUPABASE_LOCAL_URL, ANON_KEY);

  const { data: anonData, error: anonErr } = await anonSupabase.rpc('check_and_record_activation_attempt', {
    p_device_key: 'dev:anon_test',
    p_ip_key: 'ip:anon_test',
  });

  assert(anonErr !== null, 'El rol anon NO debe tener permisos de ejecución sobre la RPC');
  // PostgREST devuelve error de permisos (401, 403 o función no encontrada por no tener GRANT)
  console.log(`  Resultado llamada anónima: Error esperado recibido (${anonErr.message})`);
  console.log('✅ PASS: Acceso denegado a clientes públicos/anónimos; solo service_role puede ejecutar la RPC.');

  // PRUEBA 13: Solicitudes Concurrentes no Extienden Bloqueo Vigente
  console.log('\n--- PRUEBA 13: Solicitudes Concurrentes no Extienden Bloqueo Vigente ---');
  const dev13 = `dev:no_extend_${Date.now()}`;
  const ip13 = `ip:no_extend_${Date.now()}`;

  // 13.1 Detonar bloqueo inicial con 10s de duración
  const { data: resInitBlock } = await supabase.rpc('check_and_record_activation_attempt', {
    p_device_key: dev13,
    p_ip_key: ip13,
    p_max_device_attempts: 1, // Bloqueo en el primer intento
    p_max_ip_attempts: 10,
    p_window_seconds: 60,
    p_block_seconds: 10,
  });
  assert.strictEqual(resInitBlock.blocked, true);

  const { data: rowAfterFirst } = await supabase
    .from('activation_rate_limits')
    .select('blocked_until')
    .eq('key', dev13)
    .single();

  const originalBlockedUntil = new Date(rowAfterFirst.blocked_until).getTime();

  // 13.2 Esperar 1.2 segundos para que avance el reloj
  await sleep(1200);

  // 13.3 Lanzar 5 solicitudes concurrentes mientras el bloqueo sigue vigente
  const concurrentBlockedCalls = Array.from({ length: 5 }, () =>
    supabase.rpc('check_and_record_activation_attempt', {
      p_device_key: dev13,
      p_ip_key: ip13,
      p_max_device_attempts: 1,
      p_max_ip_attempts: 10,
      p_window_seconds: 60,
      p_block_seconds: 10,
    })
  );
  const concurrentResults = await Promise.all(concurrentBlockedCalls);

  // Todas deben haber sido rechazadas
  for (const r of concurrentResults) {
    assert.strictEqual(r.data.allowed, false, 'Todas las llamadas concurrentes deben ser bloqueadas');
    assert.strictEqual(r.data.blocked, true, 'Debe marcar blocked=true');
  }

  // 13.4 Verificar en base de datos que blocked_until NO fue extendido
  const { data: rowAfterConcurrent } = await supabase
    .from('activation_rate_limits')
    .select('blocked_until')
    .eq('key', dev13)
    .single();

  const preservedBlockedUntil = new Date(rowAfterConcurrent.blocked_until).getTime();

  assert.strictEqual(
    preservedBlockedUntil,
    originalBlockedUntil,
    `El bloqueo fue extendido indebidamente: original=${originalBlockedUntil}, actual=${preservedBlockedUntil}`
  );
  console.log('✅ PASS: Solicitudes concurrentes no prolongaron el bloqueo activo (blocked_until preservado intacto).');

  console.log('\n================================================================');
  console.log('  ¡TODAS LAS PRUEBAS (1 a 13) PASARON CON ÉXITO ROTUNDO!        ');
  console.log('================================================================\n');
}

runRateLimitTests().catch(err => {
  console.error('\n❌ ERROR EN BATERÍA DE PRUEBAS:', err);
  process.exit(1);
});

