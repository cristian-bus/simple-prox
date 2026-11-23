import { execSync } from 'node:child_process';

function psql(sql) {
  return execSync('docker exec -i pg_isolated_fase3b psql -U test_user -d test_db -v ON_ERROR_STOP=1 -t -A', {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  }).trim();
}

console.log('Insertando hasta 500.000 eventos sintéticos...');
const t0 = Date.now();
psql(`
  INSERT INTO public.campaign_events (event_id, merchant_id, campaign_id, event_type, timestamp)
  SELECT 
    'evt-scale-500k-' || i,
    'kiosk-' || (i % 250 + 1),
    'synth-camp-0' || (i % 5 + 1),
    CASE WHEN i % 20 = 0 THEN 'whatsapp_click' WHEN i % 10 = 0 THEN 'offer_open' ELSE 'impression' END,
    '2026-11-05 00:00:00+00'::timestamptz + ((i % 86400) || ' seconds')::interval
  FROM generate_series(1, 400000) i;
`);
const tInsert = Date.now() - t0;
console.log(`Inserción de 400.000 completada en ${tInsert} ms.`);

const stats = JSON.parse(psql(`
  SELECT json_build_object(
    'row_count', (SELECT count(*) FROM public.campaign_events),
    'total_size', pg_size_pretty(pg_total_relation_size('public.campaign_events')),
    'heap_size', pg_size_pretty(pg_relation_size('public.campaign_events')),
    'indexes_size', pg_size_pretty(pg_indexes_size('public.campaign_events')),
    'total_bytes', pg_total_relation_size('public.campaign_events'),
    'heap_bytes', pg_relation_size('public.campaign_events'),
    'indexes_bytes', pg_indexes_size('public.campaign_events'),
    'db_total_size', pg_size_pretty(pg_database_size('test_db')),
    'db_total_bytes', pg_database_size('test_db')
  );
`));
console.log('ESTADISTICAS_500K:', JSON.stringify(stats, null, 2));

