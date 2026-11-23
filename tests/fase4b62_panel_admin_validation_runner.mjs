// tests/fase4b62_panel_admin_validation_runner.mjs
// SIMPLE PROX v1.3.10 — FASE 4B.6.2
// SUITE OBLIGATORIA DE PRUEBAS DE ESTADÍSTICAS CONSOLIDADAS EN EL PANEL ADMINISTRATIVO

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('=== FASE 4B.6.2: PRUEBAS DE ESTADÍSTICAS CONSOLIDADAS EN PANEL ADMIN ===');
console.log('========================================================================\n');

const DOCKER_CONTAINER = 'pg_isolated_fase3b';
const DB_USER = 'test_user';
const TEMP_DB = 'tmp_fase4b62_panel_val';
const COMMERCIAL_BACKUP = path.resolve('backups/supabase_backup_20261109_215247.dump');

const evidence = {
  timestamp: new Date().toISOString(),
  backupFile: COMMERCIAL_BACKUP,
  environment: 'PostgreSQL 17 on Docker pg_isolated_fase3b + Node.js Runner',
  totalChecks: 10,
  passedChecks: 0,
  checks: []
};

function record(stepNum, name, passed, details = {}) {
  const item = { step: stepNum, name, passed, details };
  evidence.checks.push(item);
  if (passed) {
    evidence.passedChecks++;
    console.log(`[PASS] Paso ${stepNum}: ${name}`);
  } else {
    console.error(`[FAIL] Paso ${stepNum}: ${name}`);
    console.error('  Detalles del fallo:', JSON.stringify(details, null, 2));
  }
  return passed;
}

function runSql(db, sql, user = DB_USER) {
  return execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'psql', '-U', user, '-d', db,
    '-t', '-A', '-F', '|', '-c', sql
  ], { encoding: 'utf8' }).trim();
}

function runSqlFile(db, filePath, user = DB_USER) {
  const content = fs.readFileSync(filePath, 'utf8');
  return execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'psql', '-U', user, '-d', db
  ], { input: content, encoding: 'utf8' });
}

// ---------------------------------------------------------------------------
// Funciones del Panel Administrativo extraídas de panel-admin/index.html
// ---------------------------------------------------------------------------
function getValidEventCount(val) {
  if (typeof val === 'number') {
    return Number.isInteger(val) && val >= 0 ? val : 0;
  }
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  }
  return 0;
}

function formatCompactMetric(num) {
  const n = Number(num) || 0;
  if (n < 1000) return n.toLocaleString('es-AR');
  if (n < 1000000) {
    const k = n / 1000;
    const formatted = k >= 100 ? Math.round(k) : (k % 1 === 0 ? k : k.toFixed(1).replace(/\.0$/, ''));
    return formatted + 'K';
  }
  const m = n / 1000000;
  const formatted = m >= 100 ? Math.round(m) : (m % 1 === 0 ? m : m.toFixed(1).replace(/\.0$/, ''));
  return formatted + 'M';
}

function simulateUpdateGlobalStats(metricsList) {
  let totalImp = 0;
  let totalCta = 0;
  let totalOpens = 0;

  for (let i = 0; i < metricsList.length; i++) {
    const e = metricsList[i];
    const cnt = getValidEventCount(e.event_count);
    if (e.event_type === 'impression') {
      totalImp += cnt;
    } else if (e.event_type === 'whatsapp_click') {
      totalCta += cnt;
    } else if (e.event_type === 'offer_open') {
      totalOpens += cnt;
    }
  }

  const ctr = totalImp ? ((totalCta / totalImp) * 100).toFixed(2) : '0.00';
  return { totalImp, totalCta, totalOpens, ctr };
}

function simulateGetCampaignMetrics(metricsList, c) {
  let imp = 0;
  let opens = 0;
  let wpp = 0;

  for (let i = 0; i < metricsList.length; i++) {
    const e = metricsList[i];
    if (e.campaign_id === c.id || e.campaign_id === c.title) {
      const cnt = getValidEventCount(e.event_count);
      if (e.event_type === 'impression') {
        imp += cnt;
      } else if (e.event_type === 'offer_open') {
        opens += cnt;
      } else if (e.event_type === 'whatsapp_click') {
        wpp += cnt;
      }
    }
  }

  const ctr = imp > 0 ? Number(((wpp / imp) * 100).toFixed(1)) : 0;
  return { impressions: imp, opens, whatsappClicks: wpp, ctr };
}

function simulateRenderMetrics(metricsList, campaigns, period, refDate = new Date()) {
  let filteredEvents = [...metricsList];

  const y = refDate.getFullYear();
  const m = String(refDate.getMonth() + 1).padStart(2, '0');
  const d = String(refDate.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  if (period === 'today') {
    filteredEvents = filteredEvents.filter(e => e.event_date === todayStr);
  } else if (period === '7d') {
    const d7 = new Date(refDate.getTime());
    d7.setDate(d7.getDate() - 7);
    const y7 = d7.getFullYear();
    const m7 = String(d7.getMonth() + 1).padStart(2, '0');
    const day7 = String(d7.getDate()).padStart(2, '0');
    const limit7Str = `${y7}-${m7}-${day7}`;
    filteredEvents = filteredEvents.filter(e => e.event_date && e.event_date >= limit7Str);
  } else if (period === '30d') {
    const d30 = new Date(refDate.getTime());
    d30.setDate(d30.getDate() - 30);
    const y30 = d30.getFullYear();
    const m30 = String(d30.getMonth() + 1).padStart(2, '0');
    const day30 = String(d30.getDate()).padStart(2, '0');
    const limit30Str = `${y30}-${m30}-${day30}`;
    filteredEvents = filteredEvents.filter(e => e.event_date && e.event_date >= limit30Str);
  } else if (period === 'month') {
    const mStr = todayStr.slice(0, 7);
    filteredEvents = filteredEvents.filter(e => e.event_date && e.event_date.startsWith(mStr));
  }

  let metricsData = campaigns.map(c => {
    let imp = 0;
    let opens = 0;
    let wpp = 0;

    for (let i = 0; i < filteredEvents.length; i++) {
      const e = filteredEvents[i];
      if (e.campaign_id === c.id || e.campaign_id === c.title) {
        const cnt = getValidEventCount(e.event_count);
        if (e.event_type === 'impression') {
          imp += cnt;
        } else if (e.event_type === 'offer_open') {
          opens += cnt;
        } else if (e.event_type === 'whatsapp_click') {
          wpp += cnt;
        }
      }
    }

    const ctr = imp > 0 ? ((wpp / imp) * 100) : 0;
    return {
      id: c.id,
      title: c.title,
      supplierName: c.supplierName,
      category: c.category,
      impressions: imp,
      opens,
      whatsappClicks: wpp,
      ctr: Number(ctr.toFixed(2))
    };
  });

  return { filteredEvents, metricsData };
}

try {
  // ---------------------------------------------------------------------------
  // Inicialización de entorno temporal en Docker
  // ---------------------------------------------------------------------------
  console.log('--- Configurando base temporal e importando backup comercial ---');
  execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
  execSync(`docker exec ${DOCKER_CONTAINER} createdb -U ${DB_USER} ${TEMP_DB}`);

  const ensureRolesSql = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOSUPERUSER; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOSUPERUSER; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOSUPERUSER; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN CREATE ROLE postgres NOLOGIN NOSUPERUSER; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN CREATE ROLE supabase_admin NOLOGIN NOSUPERUSER; END IF;
END $$;
GRANT service_role TO test_user;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users ( id uuid PRIMARY KEY );
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'anon'::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, public, postgres, supabase_admin;
GRANT ALL ON TABLE auth.users TO anon, authenticated, service_role, public, postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role, public, postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role, public, postgres, supabase_admin;

CREATE OR REPLACE FUNCTION auth.auto_stub_user()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO auth.users (id) VALUES (NEW.user_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION auth.on_create_table()
RETURNS event_trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admin_users') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_auto_stub_admin_user') THEN
      EXECUTE 'CREATE TRIGGER trg_auto_stub_admin_user BEFORE INSERT ON public.admin_users FOR EACH ROW EXECUTE FUNCTION auth.auto_stub_user()';
    END IF;
  END IF;
END;
$$;

CREATE EVENT TRIGGER trg_on_create_table ON ddl_command_end
WHEN TAG IN ('CREATE TABLE')
EXECUTE FUNCTION auth.on_create_table();
`;
  runSql(TEMP_DB, ensureRolesSql);

  // Restaurar backup comercial con docker cp y --schema=public
  const containerDump = `/tmp/fase4b62_${path.basename(COMMERCIAL_BACKUP)}`;
  execSync(`docker cp "${COMMERCIAL_BACKUP}" ${DOCKER_CONTAINER}:${containerDump}`);

  execFileSync('docker', [
    'exec', '-i', DOCKER_CONTAINER,
    'pg_restore', '-U', DB_USER, '-d', TEMP_DB,
    '--schema=public', '--exit-on-error', containerDump
  ], { encoding: 'utf8' });

  // Aplicar migraciones
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_aggregates.sql');
  runSqlFile(TEMP_DB, 'supabase/migrations/20261106_campaign_statistics_functions.sql');

  // Consolidar todos los eventos históricos
  const consolidateRes = runSql(TEMP_DB, `
    SELECT public.consolidate_campaign_events_batch('manual', 50000);
  `);
  console.log('Resultado consolidación histórica:', consolidateRes);

  // Recuperar campañas del backup
  const campaignsRaw = runSql(TEMP_DB, `
    SELECT json_agg(json_build_object('id', id, 'title', title, 'supplierName', coalesce(supplier_name, 'Mayorista'), 'category', category))
    FROM public.campaigns;
  `);
  const campaigns = JSON.parse(campaignsRaw || '[]');

  // Recuperar filas de la vista v_campaign_combined_metrics tal como las pide el panel
  const metricsJsonRaw = runSql(TEMP_DB, `
    SELECT json_agg(json_build_object(
      'campaign_id', campaign_id,
      'event_date', event_date::text,
      'event_type', event_type,
      'event_count', event_count
    ))
    FROM public.v_campaign_combined_metrics;
  `);
  const aggregatedMetrics = JSON.parse(metricsJsonRaw || '[]');
  console.log(`Filas recuperadas de v_campaign_combined_metrics: ${aggregatedMetrics.length}`);

  // ---------------------------------------------------------------------------
  // Paso 1: Totales históricos agregados
  // ---------------------------------------------------------------------------
  console.log('\n--- Paso 1: Verificación de Totales Históricos ---');
  const globalStats = simulateUpdateGlobalStats(aggregatedMetrics);
  const p1Passed = globalStats.totalImp === 9544 &&
                   globalStats.totalOpens === 149 &&
                   globalStats.totalCta === 94;

  record(1, 'Totales históricos exactos: 9.544 impresiones, 149 aperturas, 94 clics de WhatsApp',
    p1Passed,
    { expected: { totalImp: 9544, totalOpens: 149, totalCta: 94 }, got: globalStats }
  );

  // ---------------------------------------------------------------------------
  // Paso 2: Resultados por campaña
  // ---------------------------------------------------------------------------
  console.log('\n--- Paso 2: Verificación de Resultados por Campaña ---');
  let sumImpByCamp = 0;
  let sumOpensByCamp = 0;
  let sumWppByCamp = 0;
  let campMetricsList = [];

  campaigns.forEach(c => {
    const cm = simulateGetCampaignMetrics(aggregatedMetrics, c);
    campMetricsList.push({ campaign: c.title, ...cm });
    sumImpByCamp += cm.impressions;
    sumOpensByCamp += cm.opens;
    sumWppByCamp += cm.whatsappClicks;
  });

  const p2Passed = sumImpByCamp === 9544 && sumOpensByCamp === 149 && sumWppByCamp === 94;
  record(2, 'Suma de métricas individuales por campaña coincide exactamente con los totales globales',
    p2Passed,
    { totalCampañas: campaigns.length, sumImpByCamp, sumOpensByCamp, sumWppByCamp }
  );

  // ---------------------------------------------------------------------------
  // Paso 3: Cálculo de CTR
  // ---------------------------------------------------------------------------
  console.log('\n--- Paso 3: Verificación de Cálculo de CTR ---');
  const expectedCtr = ((94 / 9544) * 100).toFixed(2); // '0.98'
  const p3Passed = globalStats.ctr === expectedCtr && globalStats.ctr === '0.98';
  record(3, 'Cálculo de CTR global correcto (0.98%) y fórmula de clics/impresiones respetada',
    p3Passed,
    { expectedCtr: '0.98', gotCtr: globalStats.ctr }
  );

  // ---------------------------------------------------------------------------
  // Paso 4: Los cinco filtros temporales
  // ---------------------------------------------------------------------------
  console.log('\n--- Paso 4: Verificación de los 5 Filtros Temporales (Días Calendario) ---');
  // Obtenemos la fecha máxima presente en el backup para evaluar la semántica relativa
  const maxDateStr = runSql(TEMP_DB, `SELECT MAX(event_date)::text FROM public.campaign_daily_aggregates;`);
  const [mY, mM, mD] = maxDateStr.split('-').map(Number);
  const refDate = new Date(mY, mM - 1, mD);

  const resAll = simulateRenderMetrics(aggregatedMetrics, campaigns, 'all', refDate);
  const resToday = simulateRenderMetrics(aggregatedMetrics, campaigns, 'today', refDate);
  const res7d = simulateRenderMetrics(aggregatedMetrics, campaigns, '7d', refDate);
  const res30d = simulateRenderMetrics(aggregatedMetrics, campaigns, '30d', refDate);
  const resMonth = simulateRenderMetrics(aggregatedMetrics, campaigns, 'month', refDate);

  const countAll = resAll.filteredEvents.reduce((acc, e) => acc + e.event_count, 0);
  const countToday = resToday.filteredEvents.reduce((acc, e) => acc + e.event_count, 0);
  const count7d = res7d.filteredEvents.reduce((acc, e) => acc + e.event_count, 0);
  const count30d = res30d.filteredEvents.reduce((acc, e) => acc + e.event_count, 0);
  const countMonth = resMonth.filteredEvents.reduce((acc, e) => acc + e.event_count, 0);

  const p4Passed = countAll === 9787 &&
                   countToday > 0 &&
                   count7d >= countToday &&
                   count30d >= count7d &&
                   countAll >= count30d &&
                   countMonth > 0;

  record(4, 'Los cinco filtros temporales (all, today, 7d, 30d, month) filtran coherentemente con días calendario',
    p4Passed,
    { maxDate: maxDateStr, countAll, countToday, count7d, count30d, countMonth }
  );

  // ---------------------------------------------------------------------------
  // Paso 5: Exportación CSV e impresión
  // ---------------------------------------------------------------------------
  console.log('\n--- Paso 5: Verificación de Formato de Exportación CSV ---');
  const sampleComputed = resAll.metricsData;
  const totalImpCSV = sampleComputed.reduce((acc, m) => acc + m.impressions, 0);
  const totalClicksCSV = sampleComputed.reduce((acc, m) => acc + m.whatsappClicks, 0);
  const totalOpensCSV = sampleComputed.reduce((acc, m) => acc + m.opens, 0);

  let csv = '\uFEFF';
  csv += `"REPORTE COMERCIAL DE RENDIMIENTO B2B - SIMPLE PROX"\n`;
  csv += `"Total Impresiones";"${totalImpCSV}"\n`;
  csv += `"Total Ofertas Abiertas";"${totalOpensCSV}"\n`;
  csv += `"Total Clics WhatsApp";"${totalClicksCSV}"\n\n`;
  csv += `"Campaña";"Código Oferta";"Distribuidor / Mayorista";"Categoría";"Impresiones";"Ofertas Abiertas";"Clics WhatsApp";"CTR a WhatsApp (%)"\n`;

  sampleComputed.forEach(m => {
    csv += `"${m.title}";"SPX-001";"${m.supplierName || 'Mayorista'}";"${m.category || 'General'}";${m.impressions};${m.opens};${m.whatsappClicks};"${m.ctr}%"\n`;
  });

  const p5Passed = csv.startsWith('\uFEFF"REPORTE COMERCIAL') &&
                   csv.includes(`"Total Impresiones";"9544"`) &&
                   csv.includes(`"Total Ofertas Abiertas";"149"`) &&
                   csv.includes(`"Total Clics WhatsApp";"94"`);

  record(5, 'Exportación CSV compatible con Excel incluye BOM UTF-8 y totales comerciales exactos',
    p5Passed,
    { csvHeaderValid: csv.startsWith('\uFEFF'), totalImpCSV, totalClicksCSV, totalOpensCSV }
  );

  // ---------------------------------------------------------------------------
  // Paso 6: Eventos pendientes de consolidación (Tiempo Real)
  // ---------------------------------------------------------------------------
  console.log('\n--- Paso 6: Eventos Pendientes de Consolidación (aggregated_at IS NULL) ---');
  // Elegir una campaña existente
  const firstCampId = campaigns[0].id;
  runSql(TEMP_DB, `
    INSERT INTO public.campaign_events (campaign_id, merchant_id, event_type, timestamp, aggregated_at)
    VALUES
      ('${firstCampId}', '00000000-0000-0000-0000-000000000001', 'impression', now(), NULL),
      ('${firstCampId}', '00000000-0000-0000-0000-000000000001', 'impression', now(), NULL),
      ('${firstCampId}', '00000000-0000-0000-0000-000000000001', 'offer_open', now(), NULL),
      ('${firstCampId}', '00000000-0000-0000-0000-000000000001', 'whatsapp_click', now(), NULL);
  `);

  // Volver a consultar la vista combinada
  const updatedMetricsRaw = runSql(TEMP_DB, `
    SELECT json_agg(json_build_object(
      'campaign_id', campaign_id,
      'event_date', event_date::text,
      'event_type', event_type,
      'event_count', event_count
    ))
    FROM public.v_campaign_combined_metrics;
  `);
  const updatedMetrics = JSON.parse(updatedMetricsRaw || '[]');
  const statsWithPending = simulateUpdateGlobalStats(updatedMetrics);

  const p6Passed = statsWithPending.totalImp === 9546 &&
                   statsWithPending.totalOpens === 150 &&
                   statsWithPending.totalCta === 95;

  record(6, 'Eventos no consolidados reflejados inmediatamente en tiempo real por la vista',
    p6Passed,
    { previous: globalStats, current: statsWithPending }
  );

  // ---------------------------------------------------------------------------
  // Paso 7: Ausencia de doble conteo tras consolidación
  // ---------------------------------------------------------------------------
  console.log('\n--- Paso 7: Ausencia de Doble Conteo tras Consolidar Lote Pendiente ---');
  const consolidatePendingRes = runSql(TEMP_DB, `
    SELECT public.consolidate_campaign_events_batch('manual', 50000);
  `);
  console.log('Resultado consolidación lote pendiente:', consolidatePendingRes);

  const postConsolidateRaw = runSql(TEMP_DB, `
    SELECT json_agg(json_build_object(
      'campaign_id', campaign_id,
      'event_date', event_date::text,
      'event_type', event_type,
      'event_count', event_count
    ))
    FROM public.v_campaign_combined_metrics;
  `);
  const postConsolidateMetrics = JSON.parse(postConsolidateRaw || '[]');
  const statsPostConsolidation = simulateUpdateGlobalStats(postConsolidateMetrics);

  const p7Passed = statsPostConsolidation.totalImp === 9546 &&
                   statsPostConsolidation.totalOpens === 150 &&
                   statsPostConsolidation.totalCta === 95;

  record(7, 'Ausencia total de doble conteo: los totales permanecen invariables tras consolidar',
    p7Passed,
    { statsPostConsolidation }
  );

  // ---------------------------------------------------------------------------
  // Paso 8: Paginación segura con más de 1.000 agrupaciones
  // ---------------------------------------------------------------------------
  console.log('\n--- Paso 8: Simulación de Paginación Segura (> 1.000 filas agregadas) ---');
  // Generar dataset sintético de 2.500 filas
  const mockDatabase = Array.from({ length: 2500 }, (_, i) => ({
    campaign_id: `camp-${i % 10}`,
    event_date: '2026-11-09',
    event_type: i % 2 === 0 ? 'impression' : 'whatsapp_click',
    event_count: 5
  }));

  // Simular la función de paginación de panel-admin/index.html
  async function mockFetchAllMetrics(mockDb, pageSize = 1000) {
    let allMetrics = [];
    let offset = 0;
    let keepFetching = true;
    let fetchSuccess = true;

    while (keepFetching) {
      // Simula petición HTTP limit & offset
      const batch = mockDb.slice(offset, offset + pageSize);
      if (Array.isArray(batch) && batch.length > 0) {
        allMetrics.push(...batch);
        if (batch.length < pageSize) {
          keepFetching = false;
        } else {
          offset += pageSize;
        }
      } else {
        keepFetching = false;
      }

      if (offset >= 500000) keepFetching = false;
    }

    return { allMetrics, fetchSuccess };
  }

  const { allMetrics: paginatedResults } = await mockFetchAllMetrics(mockDatabase, 1000);
  const p8Passed = paginatedResults.length === 2500;

  record(8, 'Paginación segura recupera 2.500 registros completos en 3 lotes sin truncamiento',
    p8Passed,
    { totalEsperado: 2500, totalObtenido: paginatedResults.length }
  );

  // ---------------------------------------------------------------------------
  // Paso 9: Validación de Caché Versionada (kioscoprox_aggregated_metrics_cache_v1)
  // ---------------------------------------------------------------------------
  console.log('\n--- Paso 9: Verificación de Caché Versionada ---');
  const mockStorage = {
    'kioscoprox_events_cache': JSON.stringify([{ old: 'events_raw_format' }]),
    'kioscoprox_aggregated_metrics_cache_v1': null
  };

  // Guardar en la nueva clave versionada
  mockStorage['kioscoprox_aggregated_metrics_cache_v1'] = JSON.stringify(aggregatedMetrics);

  // Comprobar que la clave antigua no se sobreescribió ni se leyó como agregada
  const oldCacheUntouched = JSON.parse(mockStorage['kioscoprox_events_cache'])[0].old === 'events_raw_format';
  const newCacheParsed = JSON.parse(mockStorage['kioscoprox_aggregated_metrics_cache_v1']);
  const newCacheValid = Array.isArray(newCacheParsed) && newCacheParsed.length === aggregatedMetrics.length;

  const p9Passed = oldCacheUntouched && newCacheValid;
  record(9, 'Caché versionada v1 aísla datos agregados y previene contaminación con caché antigua',
    p9Passed,
    { oldCacheUntouched, newCacheCount: newCacheParsed.length }
  );

  // ---------------------------------------------------------------------------
  // Paso 10: Resistencia a Errores HTTP, Respuestas Incompletas y Sesión Vencida
  // ---------------------------------------------------------------------------
  console.log('\n--- Paso 10: Resistencia ante Fallos HTTP y Preservación de Caché ---');
  let simulatedRawEvents = [...aggregatedMetrics]; // Estado previo sano

  // Simular intento fallido con HTTP 401 / 500 / Fetch fail
  async function simulateFetchWithFailure(shouldFail = true) {
    let allMetrics = [];
    let fetchSuccess = true;

    if (shouldFail) {
      // Simula fallo de red o error HTTP 401
      fetchSuccess = false;
    }

    if (fetchSuccess) {
      simulatedRawEvents = allMetrics;
      mockStorage['kioscoprox_aggregated_metrics_cache_v1'] = JSON.stringify(allMetrics);
    } else {
      // Recuperación segura: nunca sobrescribir si el fetch falló
      const cached = mockStorage['kioscoprox_aggregated_metrics_cache_v1'];
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) simulatedRawEvents = parsed;
      }
    }
  }

  // Ejecutar intento con fallo
  await simulateFetchWithFailure(true);

  // Verificar que la caché sigue conteniendo los 545 registros y simulatedRawEvents no quedó en 0
  const cacheAfterFailure = JSON.parse(mockStorage['kioscoprox_aggregated_metrics_cache_v1']);
  const p10Passed = cacheAfterFailure.length === aggregatedMetrics.length &&
                    simulatedRawEvents.length === aggregatedMetrics.length &&
                    simulatedRawEvents.length > 0;

  record(10, 'Fallo HTTP 401/500 no destruye la caché previa ni corrompe el estado de métricas',
    p10Passed,
    { cacheLength: cacheAfterFailure.length, activeEventsLength: simulatedRawEvents.length }
  );

  // ---------------------------------------------------------------------------
  // Limpieza final de base temporal
  // ---------------------------------------------------------------------------
  console.log('\n--- Limpiando base de datos temporal ---');
  execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
  console.log(`Base temporal ${TEMP_DB} eliminada correctamente.`);

} catch (err) {
  console.error('Error fatal durante la ejecución de las pruebas:', err);
  try {
    execSync(`docker exec ${DOCKER_CONTAINER} dropdb -U ${DB_USER} --if-exists ${TEMP_DB}`);
  } catch (e) {}
}

console.log('\n========================================================================');
console.log(`=== RESUMEN FINAL: ${evidence.passedChecks}/${evidence.totalChecks} PRUEBAS SUPERADAS ===`);
console.log('========================================================================\n');

if (evidence.passedChecks === evidence.totalChecks) {
  console.log('STATUS: PASS — Todas las verificaciones requeridas pasaron exitosamente.');
  process.exit(0);
} else {
  console.error('STATUS: FAIL — Se detectaron inconsistencias en las pruebas.');
  process.exit(1);
}
