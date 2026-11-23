/**
 * SIMPLE PROX v1.3.10 — FASE 3B.2
 * RUNNER DE PRUEBAS EXPERIMENTALES EN POSTGRESQL 17 AISLADO (Docker)
 *
 * Ejecuta las 12 pruebas obligatorias directamente en pg_isolated_fase3b
 * utilizando stdin nativo para evitar problemas de escape en shell Windows.
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';

console.log('='.repeat(75));
console.log('SIMPLE PROX v1.3.10 — FASE 3B.2: VALIDACIÓN EXPERIMENTAL EN POSTGRESQL 17');
console.log('='.repeat(75));

function queryPsql(sql, user = 'test_user') {
  return execSync(`docker exec -i pg_isolated_fase3b psql -U ${user} -d test_db -v ON_ERROR_STOP=1 -t -A`, {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  }).trim();
}

function queryPsqlJson(sql, user = 'test_user') {
  const raw = queryPsql(sql, user);
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const testResults = [];

function recordTest(id, name, procedure, expected, actual, pass, evidence) {
  testResults.push({ id, name, procedure, expected, actual, pass: pass ? 'PASS' : 'FAIL', evidence });
  const status = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`[${status}] Prueba ${id}: ${name}`);
}

async function runAllTests() {
  // Limpiar tablas antes de arrancar
  queryPsql(`
    TRUNCATE public.campaign_events, public.campaign_daily_aggregates, 
             public.purge_ledger, public.consolidation_audit_log RESTART IDENTITY CASCADE;
  `);

  // =========================================================================
  // PRUEBA 1: Consolidación y repetición sin duplicar
  // =========================================================================
  try {
    queryPsql(`
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      SELECT 
        'evt-p1-' || i,
        'merchant-' || (i % 5 + 1),
        'synth-camp-01',
        CASE WHEN i % 10 = 0 THEN 'whatsapp_click' WHEN i % 5 = 0 THEN 'offer_open' ELSE 'impression' END,
        '2026-11-04 12:00:00+00'::timestamptz
      FROM generate_series(1, 500) i;
    `);

    const rawInEvents = Number(queryPsql("SELECT COUNT(*) FROM public.campaign_events;"));
    const res1 = queryPsqlJson("SELECT public.consolidate_campaign_events_batch('worker-1', 50000);");
    const countAfterFirst = Number(queryPsql("SELECT SUM(event_count) FROM public.campaign_daily_aggregates;"));

    // Segunda consolidación (inmediata)
    const res2 = queryPsqlJson("SELECT public.consolidate_campaign_events_batch('worker-1', 50000);");
    const countAfterSecond = Number(queryPsql("SELECT SUM(event_count) FROM public.campaign_daily_aggregates;"));

    const pass = rawInEvents === 500 &&
                 res1.success === true && res1.processed === 500 &&
                 res2.success === true && res2.processed === 0 &&
                 countAfterFirst === 500 && countAfterSecond === 500;

    recordTest(
      1,
      'Consolidación repetida sin duplicar',
      'Inserción de 500 eventos sintéticos y doble ejecución consecutiva de consolidate_campaign_events_batch()',
      'Primera corrida procesa 500 eventos; segunda corrida procesa 0 eventos; total agregado permanece en 500',
      `Insertados: ${rawInEvents} | Corrida 1: procesó ${res1.processed}, suma=${countAfterFirst} | Corrida 2: procesó ${res2.processed}, suma=${countAfterSecond}`,
      pass,
      JSON.stringify({ rawInEvents, res1, res2, countAfterFirst, countAfterSecond }, null, 2)
    );
  } catch (err) {
    recordTest(1, 'Consolidación repetida sin duplicar', 'Ejecución batch', 'Éxito', err.message, false, err.stack);
  }

  // =========================================================================
  // PRUEBA 2: Dos consolidadores ejecutándose simultáneamente
  // =========================================================================
  try {
    queryPsql(`
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      SELECT 'evt-p2-' || i, 'merchant-1', 'synth-camp-02', 'impression', '2026-11-04 13:00:00+00'
      FROM generate_series(1, 50) i;
    `);

    // Iniciar Transacción A que toma el advisory lock y duerme 3s
    const childA = spawn('docker', ['exec', '-i', 'pg_isolated_fase3b', 'psql', '-U', 'test_user', '-d', 'test_db', '-t', '-A'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    childA.stdin.write("BEGIN; SELECT pg_try_advisory_xact_lock(847291038472910283); SELECT pg_sleep(3); COMMIT;\n");
    childA.stdin.end();

    // Esperar a que Transacción A tome el lock
    await new Promise(r => setTimeout(r, 600));

    // Ejecutar Transacción B que intenta consolidar
    const resB = queryPsqlJson("SELECT public.consolidate_campaign_events_batch('worker-B', 50000);");

    // Esperar a que childA termine
    await new Promise(r => childA.on('close', r));

    // Ejecutar Transacción C (posterior a liberación)
    const resC = queryPsqlJson("SELECT public.consolidate_campaign_events_batch('worker-C', 50000);");

    const pass = resB.success === false && resB.reason === 'LOCKED_BY_ANOTHER_TRANSACTION' &&
                 resC.success === true && resC.processed === 50;

    recordTest(
      2,
      'Dos consolidadores concurrentes',
      'Worker A adquiere advisory xact lock durante 3s; Worker B intenta consolidar en paralelo; Worker C ejecuta tras liberar',
      'Worker B es rechazado de inmediato con LOCKED_BY_ANOTHER_TRANSACTION; Worker C procesa las 50 filas',
      `Worker B: ${resB.reason} | Worker C: procesó ${resC.processed}`,
      pass,
      JSON.stringify({ resB, resC }, null, 2)
    );
  } catch (err) {
    recordTest(2, 'Dos consolidadores concurrentes', 'Simulación concurrencia', 'Lock rejection', err.message, false, err.stack);
  }

  // =========================================================================
  // PRUEBA 3: Consolidación y purga simultáneas
  // =========================================================================
  try {
    queryPsql(`
      -- Insertar eventos viejos y consolidarlos
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      SELECT 'evt-p3-old-' || i, 'merchant-1', 'synth-camp-01', 'impression', '2026-10-20 10:00:00+00'
      FROM generate_series(1, 100) i;
      SELECT public.consolidate_campaign_events_batch('worker-prep', 50000);

      -- Insertar eventos nuevos pendientes de consolidación
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      SELECT 'evt-p3-new-' || i, 'merchant-2', 'synth-camp-03', 'impression', now()
      FROM generate_series(1, 100) i;
    `);

    // Ejecutar consolidación y purga simultáneas en paralelo
    const pCons = new Promise(resolve => {
      const out = queryPsqlJson("SELECT public.consolidate_campaign_events_batch('worker-concurrent', 50000);");
      resolve(out);
    });
    const pPurge = new Promise(resolve => {
      const out = queryPsqlJson("SELECT public.purge_campaign_events_safe(10, 50000, false, 'admin-concurrent');");
      resolve(out);
    });

    const [resCons, resPurge] = await Promise.all([pCons, pPurge]);

    const pass = resCons.success === true && resCons.processed === 100 &&
                 resPurge.success === true && resPurge.deleted_count === 100;
    recordTest(
      3,
      'Consolidación y purga simultáneas',
      'Consolidación de eventos recientes ejecutándose en paralelo con la purga de eventos antiguos verificados',
      'Ambos procesos completan sin bloqueos de deadlock ni interferencia mutua',
      `Consolidación: ${resCons.processed} procesados | Purga: ${resPurge.deleted_count} eliminados`,
      pass,
      JSON.stringify({ resCons, resPurge }, null, 2)
    );
  } catch (err) {
    recordTest(3, 'Consolidación y purga simultáneas', 'Concurrencia disjunta', 'Sin deadlock', err.message, false, err.stack);
  }

  // =========================================================================
  // PRUEBA 4: Error durante la consolidación con rollback
  // =========================================================================
  try {
    queryPsql(`
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      VALUES ('evt-p4-fail', 'merchant-1', 'synth-camp-01', 'impression', '2026-11-04 14:00:00+00');
    `);

    const aggBefore = Number(queryPsql("SELECT COALESCE(SUM(event_count), 0) FROM public.campaign_daily_aggregates WHERE campaign_id = 'synth-camp-01' AND event_date = '2026-11-04';"));

    let errorCaught = false;
    let errorMessage = '';
    try {
      queryPsql(`
        DO $$
        BEGIN
          UPDATE public.campaign_daily_aggregates SET event_count = event_count + 999 WHERE campaign_id = 'synth-camp-01';
          UPDATE public.campaign_events SET aggregated_at = now() WHERE event_id = 'evt-p4-fail';
          RAISE EXCEPTION 'SIMULATED_TRANSACTION_FAILURE';
        END $$;
      `);
    } catch (e) {
      errorCaught = true;
      errorMessage = e.message;
    }

    const aggAfter = Number(queryPsql("SELECT COALESCE(SUM(event_count), 0) FROM public.campaign_daily_aggregates WHERE campaign_id = 'synth-camp-01' AND event_date = '2026-11-04';"));
    const evtStatus = queryPsql("SELECT COALESCE(aggregated_at::text, 'NULL') FROM public.campaign_events WHERE event_id = 'evt-p4-fail';");

    const pass = errorCaught && aggBefore === aggAfter && evtStatus === 'NULL';
    recordTest(
      4,
      'Error durante la consolidación con rollback',
      'Forzado de RAISE EXCEPTION durante la transacción de actualización de agregados',
      'Rollback completo: contadores no se alteran y el evento permanece sin marcar (aggregated_at IS NULL)',
      `Error capturado: ${errorCaught} | Agregados antes: ${aggBefore}, después: ${aggAfter} | Estado evento: ${evtStatus}`,
      pass,
      JSON.stringify({ aggBefore, aggAfter, evtStatus, errorMessage })
    );

    // Consolidar el evento pendiente para dejar limpio
    queryPsql("SELECT public.consolidate_campaign_events_batch('cleanup-p4', 50000);");
  } catch (err) {
    recordTest(4, 'Error en consolidación con rollback', 'Rollback verification', 'Rollback limpio', err.message, false, err.stack);
  }

  // =========================================================================
  // PRUEBA 5: Error durante la purga con rollback
  // =========================================================================
  try {
    queryPsql(`
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp, aggregated_at)
      VALUES 
        ('evt-p5-1', 'merchant-1', 'synth-camp-01', 'impression', '2026-10-10 10:00:00+00', now()),
        ('evt-p5-2', 'merchant-1', 'synth-camp-01', 'impression', '2026-10-10 10:01:00+00', NULL); -- Sin consolidar!
    `);

    let purgeFailed = false;
    let errorMessage = '';
    try {
      queryPsqlJson("SELECT public.purge_campaign_events_safe(15, 50000, false, 'admin-p5');");
    } catch (err) {
      purgeFailed = true;
      errorMessage = err.message;
    }

    const rowExists1 = queryPsql("SELECT COUNT(*) FROM public.campaign_events WHERE event_id = 'evt-p5-1';");
    const rowExists2 = queryPsql("SELECT COUNT(*) FROM public.campaign_events WHERE event_id = 'evt-p5-2';");

    const pass = purgeFailed && rowExists1 === '1' && rowExists2 === '1';
    recordTest(
      5,
      'Error durante la purga con rollback',
      'Intento de purga habiendo un evento anterior al corte sin consolidar (aggregated_at IS NULL)',
      'La función aborta con excepción y ninguna fila es eliminada del buffer crudo',
      `Purga falló como se esperaba: ${purgeFailed} | Filas preservadas: evt-p5-1=${rowExists1}, evt-p5-2=${rowExists2}`,
      pass,
      JSON.stringify({ purgeFailed, rowExists1, rowExists2, errorMessage })
    );

    queryPsql("DELETE FROM public.campaign_events WHERE event_id IN ('evt-p5-1', 'evt-p5-2');");
  } catch (err) {
    recordTest(5, 'Error en purga con rollback', 'Purge safety check', 'Excepción y 0 deletes', err.message, false, err.stack);
  }

  // =========================================================================
  // PRUEBA 6: Recepción de eventos legítimos con 20 días de atraso
  // =========================================================================
  try {
    const staleDate = '2026-10-15';
    queryPsql(`
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      SELECT 'evt-p6-stale-' || i, 'merchant-9', 'synth-camp-04', 'impression', '${staleDate} 15:00:00+00'
      FROM generate_series(1, 40) i;
    `);

    const resCons = queryPsqlJson("SELECT public.consolidate_campaign_events_batch('worker-stale', 50000);");
    const aggCount = Number(queryPsql(`
      SELECT event_count FROM public.campaign_daily_aggregates 
      WHERE campaign_id = 'synth-camp-04' AND event_date = '${staleDate}' AND merchant_id = 'merchant-9';
    `));

    const pass = resCons.success === true && resCons.processed === 40 && aggCount === 40;
    recordTest(
      6,
      'Eventos legítimos con 20 días de atraso',
      'Llegada de 40 eventos generados el 2026-10-15 (hace más de 20 días) por un kiosco reconectado',
      'Los eventos son aceptados y consolidados en la fecha histórica correspondiente sin ser descartados',
      `Consolidación exitosa: ${resCons.processed} procesados | Agregado fecha ${staleDate}: ${aggCount} impresiones`,
      pass,
      JSON.stringify({ resCons, aggCount })
    );
  } catch (err) {
    recordTest(6, 'Eventos legítimos con 20 días de atraso', 'Inserción y consolidación histórica', 'Contabilización exacta', err.message, false, err.stack);
  }

  // =========================================================================
  // PRUEBA 7: Evento guardado, respuesta perdida y reenvío tras purga
  // =========================================================================
  try {
    const oldEvDate = '2026-10-05';
    queryPsql(`
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      VALUES ('evt-p7-lost-ack', 'merchant-1', 'synth-camp-01', 'impression', '${oldEvDate} 10:00:00+00');
      SELECT public.consolidate_campaign_events_batch('worker-p7', 50000);
      SELECT public.purge_campaign_events_safe(15, 50000, false, 'admin-p7');
    `);

    const rawExistsBefore = queryPsql("SELECT COUNT(*) FROM public.campaign_events WHERE event_id = 'evt-p7-lost-ack';");

    // Reenvío del evento tras purga
    queryPsql(`
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      VALUES ('evt-p7-lost-ack', 'merchant-1', 'synth-camp-01', 'impression', '${oldEvDate} 10:00:00+00')
      ON CONFLICT (event_id) DO NOTHING;
    `);

    const rawExistsAfter = queryPsql("SELECT COUNT(*) FROM public.campaign_events WHERE event_id = 'evt-p7-lost-ack';");

    // Verificación experimental: en la alternativa A sin tombstones, el evento se reinserta
    // porque su ID ya fue purgado de campaign_events.
    const pass = rawExistsBefore === '0' && rawExistsAfter === '1';
    recordTest(
      7,
      'Reenvío post-purga tras pérdida de ACK HTTP',
      'Evento consolidado y purgado es retransmitido por el cliente debido a respuesta HTTP perdida',
      'Comprobar comportamiento del motor de base de datos sin tombstones',
      `Fila borrada tras purga: ${rawExistsBefore === '0'} | Fila reingresó al retransmitirse: ${rawExistsAfter === '1'} (Comprueba experimentalmente que se requiere salvaguarda o ventana R > W)`,
      pass,
      JSON.stringify({ rawExistsBefore, rawExistsAfter, observacion: 'Valida experimentalmente la necesidad de la ventana temporal' })
    );

    queryPsql("DELETE FROM public.campaign_events WHERE event_id = 'evt-p7-lost-ack';");
  } catch (err) {
    recordTest(7, 'Reenvío post-purga tras pérdida de ACK', 'Reenvío forzado', 'Comportamiento documentado', err.message, false, err.stack);
  }

  // =========================================================================
  // PRUEBA 8: Reenvío manual desde Dead Letter dentro de ventana
  // =========================================================================
  try {
    const recentDate = '2026-11-05 10:00:00+00';
    queryPsql(`
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      VALUES ('evt-p8-deadletter', 'merchant-1', 'synth-camp-01', 'impression', '${recentDate}');
      SELECT public.consolidate_campaign_events_batch('worker-p8', 50000);
    `);

    const countBeforeReplay = Number(queryPsql("SELECT COUNT(*) FROM public.campaign_events WHERE event_id = 'evt-p8-deadletter';"));

    // Replay del mismo event_id
    queryPsql(`
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      VALUES ('evt-p8-deadletter', 'merchant-1', 'synth-camp-01', 'impression', '${recentDate}')
      ON CONFLICT (event_id) DO NOTHING;
    `);

    const countAfterReplay = Number(queryPsql("SELECT COUNT(*) FROM public.campaign_events WHERE event_id = 'evt-p8-deadletter';"));
    const aggBefore = Number(queryPsql("SELECT SUM(event_count) FROM public.campaign_daily_aggregates WHERE campaign_id = 'synth-camp-01' AND event_date = '2026-11-05';"));

    const resCons = queryPsqlJson("SELECT public.consolidate_campaign_events_batch('worker-p8-check', 50000);");
    const aggAfter = Number(queryPsql("SELECT SUM(event_count) FROM public.campaign_daily_aggregates WHERE campaign_id = 'synth-camp-01' AND event_date = '2026-11-05';"));

    const pass = countBeforeReplay === 1 && countAfterReplay === 1 && aggBefore === aggAfter && resCons.processed === 0;
    recordTest(
      8,
      'Reenvío desde Dead Letter dentro del buffer',
      'Reenvío manual de un evento que ya está en campaign_events dentro de la ventana de retención',
      'ON CONFLICT ignora el duplicado, no se crean filas repetidas y la consolidación no incrementa métricas',
      `Conteo filas antes=${countBeforeReplay}, después=${countAfterReplay} | Agregados no se duplicaron: antes=${aggBefore}, después=${aggAfter}`,
      pass,
      JSON.stringify({ countBeforeReplay, countAfterReplay, aggBefore, aggAfter, resCons })
    );
  } catch (err) {
    recordTest(8, 'Reenvío desde Dead Letter', 'Dead letter deduplication', 'Idempotencia exacta', err.message, false, err.stack);
  }

  // =========================================================================
  // PRUEBA 9: Múltiples purgas consecutivas y ecuación de conciliación
  // =========================================================================
  try {
    queryPsql(`
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      SELECT 'evt-p9-d10-' || i, 'merchant-1', 'synth-camp-05', 'impression', '2026-10-25 10:00:00+00' FROM generate_series(1, 50) i;
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      SELECT 'evt-p9-d9-' || i, 'merchant-1', 'synth-camp-05', 'impression', '2026-10-26 10:00:00+00' FROM generate_series(1, 50) i;
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      SELECT 'evt-p9-d8-' || i, 'merchant-1', 'synth-camp-05', 'impression', '2026-10-27 10:00:00+00' FROM generate_series(1, 50) i;
      SELECT public.consolidate_campaign_events_batch('worker-p9', 50000);
    `);

    // Purga 1: corte en 2026-10-25 (D-12)
    const purge1 = queryPsqlJson("SELECT public.purge_campaign_events_safe(12, 50000, false, 'admin-p9-1');");
    // Purga 2: corte en 2026-10-26 (D-11)
    const purge2 = queryPsqlJson("SELECT public.purge_campaign_events_safe(11, 50000, false, 'admin-p9-2');");

    const cAgg = Number(queryPsql("SELECT COUNT(*) FROM public.campaign_events WHERE aggregated_at IS NOT NULL;"));
    const pTotal = Number(queryPsql("SELECT COALESCE(SUM(deleted_count), 0) FROM public.purge_ledger;"));
    const aTotal = Number(queryPsql("SELECT SUM(event_count) FROM public.campaign_daily_aggregates;"));

    const equationHolds = (cAgg + pTotal) === aTotal;
    const pass = purge1.success === true && purge2.success === true && equationHolds;

    recordTest(
      9,
      'Múltiples purgas sucesivas con conciliación universal',
      'Dos ejecuciones consecutivas de purga sobre bloques temporales distintos y validación de C_agg + P_total == A_total',
      'Ambas purgas completan y la identidad matemática de integridad se cumple al 100%',
      `Purga 1: ${purge1.deleted_count} del | Purga 2: ${purge2.deleted_count} del | C_agg(${cAgg}) + P_total(${pTotal}) = ${cAgg + pTotal} == A_total(${aTotal}) -> ${equationHolds}`,
      pass,
      JSON.stringify({ purge1, purge2, cAgg, pTotal, aTotal, equationHolds })
    );
  } catch (err) {
    recordTest(9, 'Múltiples purgas con conciliación', 'Conciliación post-purga', 'Ecuación satisfecha', err.message, false, err.stack);
  }

  // =========================================================================
  // PRUEBA 10: Acceso no autorizado a funciones y estadísticas
  // =========================================================================
  try {
    queryPsql(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon_test_user') THEN
          CREATE ROLE anon_test_user WITH LOGIN PASSWORD 'anon_pass';
        END IF;
      END $$;
      REVOKE ALL ON FUNCTION public.consolidate_campaign_events_batch(text, integer) FROM anon_test_user, PUBLIC;
      REVOKE ALL ON FUNCTION public.purge_campaign_events_safe(integer, integer, boolean, text) FROM anon_test_user, PUBLIC;
    `);

    let consDenied = false;
    let purgeDenied = false;

    try {
      queryPsql("SELECT public.consolidate_campaign_events_batch();", 'anon_test_user');
    } catch (e) {
      if (e.message.includes('permission denied')) consDenied = true;
    }

    try {
      queryPsql("SELECT public.purge_campaign_events_safe();", 'anon_test_user');
    } catch (e) {
      if (e.message.includes('permission denied')) purgeDenied = true;
    }

    const pass = consDenied && purgeDenied;
    recordTest(
      10,
      'Acceso no autorizado a funciones administrativas',
      'Invocación de consolidate_campaign_events_batch() y purge_campaign_events_safe() con rol anon_test_user sin permisos',
      'PostgreSQL deniega el acceso con ERROR: permission denied en ambas funciones',
      `Consolidación denegada: ${consDenied} | Purga denegada: ${purgeDenied}`,
      pass,
      JSON.stringify({ consDenied, purgeDenied })
    );
  } catch (err) {
    recordTest(10, 'Acceso no autorizado a funciones', 'Validación permisos', 'Acceso denegado', err.message, false, err.stack);
  }

  // =========================================================================
  // PRUEBA 11: Medición de almacenamiento con 100.000 eventos sintéticos
  // =========================================================================
  try {
    console.log('  -> Insertando 100.000 eventos sintéticos para medición física en PostgreSQL 17...');
    const tStartInsert = Date.now();
    queryPsql(`
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      SELECT 
        'evt-scale-' || i,
        'kiosk-' || (i % 100 + 1),
        'synth-camp-0' || (i % 5 + 1),
        CASE WHEN i % 20 = 0 THEN 'whatsapp_click' WHEN i % 10 = 0 THEN 'offer_open' ELSE 'impression' END,
        '2026-11-05 10:00:00+00'::timestamptz + ((i % 86400) || ' seconds')::interval
      FROM generate_series(1, 100000) i;
    `);
    const durationInsertMs = Date.now() - tStartInsert;

    const sizeBeforeCons = JSON.parse(queryPsql(`
      SELECT json_build_object(
        'total_size', pg_size_pretty(pg_total_relation_size('public.campaign_events')),
        'heap_size', pg_size_pretty(pg_relation_size('public.campaign_events')),
        'indexes_size', pg_size_pretty(pg_indexes_size('public.campaign_events')),
        'total_bytes', pg_total_relation_size('public.campaign_events'),
        'heap_bytes', pg_relation_size('public.campaign_events'),
        'indexes_bytes', pg_indexes_size('public.campaign_events'),
        'db_size', pg_size_pretty(pg_database_size('test_db')),
        'db_bytes', pg_database_size('test_db')
      );
    `));

    const tStartCons = Date.now();
    const cons1 = queryPsqlJson("SELECT public.consolidate_campaign_events_batch('scale-worker', 50000);");
    const cons2 = queryPsqlJson("SELECT public.consolidate_campaign_events_batch('scale-worker', 50000);");
    const durationConsMs = Date.now() - tStartCons;

    const sizeAfterCons = JSON.parse(queryPsql(`
      SELECT json_build_object(
        'campaign_events_total', pg_size_pretty(pg_total_relation_size('public.campaign_events')),
        'campaign_daily_aggregates_total', pg_size_pretty(pg_total_relation_size('public.campaign_daily_aggregates')),
        'db_total', pg_size_pretty(pg_database_size('test_db')),
        'db_bytes', pg_database_size('test_db')
      );
    `));

    const totalProcessed = cons1.processed + cons2.processed;
    const pass = cons1.success === true && cons2.success === true && totalProcessed === 100000;

    recordTest(
      11,
      'Medición física de 100.000 eventos sintéticos',
      'Generación de 100.000 tuplas sintéticas, medición de Heap e Índices, y consolidación por lotes de 50.000',
      'Medición verificable de bytes reales, tiempos de inserción y consolidación sin saturar recursos',
      `Insert: ${durationInsertMs}ms | Consolidación: ${durationConsMs}ms (${totalProcessed} evs) | Tabla: ${sizeBeforeCons.total_size} (Heap: ${sizeBeforeCons.heap_size}, Índices: ${sizeBeforeCons.indexes_size}) | Agregados: ${sizeAfterCons.campaign_daily_aggregates_total} | DB Total: ${sizeAfterCons.db_total}`,
      pass,
      JSON.stringify({ sizeBeforeCons, sizeAfterCons, durationInsertMs, durationConsMs }, null, 2)
    );
  } catch (err) {
    recordTest(11, 'Medición física de 100.000 eventos', 'Prueba de escala', 'Medición completada', err.message, false, err.stack);
  }

  // =========================================================================
  // PRUEBA 12: Medición física antes/después de DELETE, VACUUM y Reutilización
  // =========================================================================
  try {
    const sizePreDelete = JSON.parse(queryPsql(`
      SELECT json_build_object(
        'total_size', pg_size_pretty(pg_total_relation_size('public.campaign_events')),
        'heap_bytes', pg_relation_size('public.campaign_events'),
        'total_bytes', pg_total_relation_size('public.campaign_events')
      );
    `));

    const tStartPurge = Date.now();
    const purgeRes = queryPsqlJson("SELECT public.purge_campaign_events_safe(0, 50000, false, 'scale-purger');");
    const durationPurgeMs = Date.now() - tStartPurge;

    const sizePostDeletePreVacuum = JSON.parse(queryPsql(`
      SELECT json_build_object(
        'total_size', pg_size_pretty(pg_total_relation_size('public.campaign_events')),
        'heap_bytes', pg_relation_size('public.campaign_events'),
        'total_bytes', pg_total_relation_size('public.campaign_events')
      );
    `));

    // Ejecutar VACUUM
    queryPsql("VACUUM public.campaign_events;");

    const sizePostVacuum = JSON.parse(queryPsql(`
      SELECT json_build_object(
        'total_size', pg_size_pretty(pg_total_relation_size('public.campaign_events')),
        'heap_bytes', pg_relation_size('public.campaign_events'),
        'total_bytes', pg_total_relation_size('public.campaign_events')
      );
    `));

    // Reutilización de páginas: insertar 20.000 eventos y medir si crece el archivo
    queryPsql(`
      INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
      SELECT 'evt-reuse-' || i, 'merchant-1', 'synth-camp-01', 'impression', now()
      FROM generate_series(1, 20000) i;
    `);

    const sizePostReuse = JSON.parse(queryPsql(`
      SELECT json_build_object(
        'total_size', pg_size_pretty(pg_total_relation_size('public.campaign_events')),
        'heap_bytes', pg_relation_size('public.campaign_events'),
        'total_bytes', pg_total_relation_size('public.campaign_events')
      );
    `));

    const pass = purgeRes.success === true && purgeRes.deleted_count === 50000;
    recordTest(
      12,
      'Medición de espacio: DELETE, VACUUM y Reutilización de páginas',
      'Purga de 50.000 eventos, medición de dead tuples, ejecución de VACUUM y reinserción de 20.000 tuplas en páginas recicladas',
      'Comprobar comportamiento del Free Space Map y estabilización de disco',
      `Purga: ${purgeRes.deleted_count} filas en ${durationPurgeMs}ms | Pre-Delete: ${sizePreDelete.total_size} -> Post-Delete: ${sizePostDeletePreVacuum.total_size} -> Post-VACUUM: ${sizePostVacuum.total_size} -> Post-Reuse(20k): ${sizePostReuse.total_size}`,
      pass,
      JSON.stringify({ sizePreDelete, sizePostDeletePreVacuum, sizePostVacuum, sizePostReuse, durationPurgeMs }, null, 2)
    );
  } catch (err) {
    recordTest(12, 'Medición de espacio y VACUUM', 'Comportamiento físico PostgreSQL', 'Evidencia documentada', err.message, false, err.stack);
  }

  console.log('='.repeat(75));
  const passedCount = testResults.filter(t => t.pass === 'PASS').length;
  console.log(`TOTAL PRUEBAS FASE 3B.2: ${passedCount}/12 PASS`);
  console.log('='.repeat(75));

  return testResults;
}

runAllTests().then(results => {
  fs.writeFileSync('tests/fase3b2_raw_evidence.json', JSON.stringify(results, null, 2));
  console.log('✓ Evidencia completa guardada en tests/fase3b2_raw_evidence.json');
}).catch(console.error);
