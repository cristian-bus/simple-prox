-- ==============================================================================
-- KioscoProX / Simple ProX — Migración: Automatización de Purga Diaria mediante pg_cron
-- Archivo: 20261111_schedule_daily_purge_cron.sql
-- Fase: FASE 4B.7.5 (Tarea 2)
-- ==============================================================================
-- Propósito:
-- 1. Programar la ejecución desatendida de purge_consolidated_campaign_events una vez al día.
-- 2. Horario: 04:30 AM (UTC-3 / Argentina), momento de mínimo tráfico de kioscos y comercios.
--    En UTC corresponde a las 07:30 UTC ('30 7 * * *').
-- 3. Parámetros de seguridad:
--    - p_dry_run := false (ejecución real).
--    - p_retention_days := 30 (retención mínima garantizada de 30 días + margen de 1 hora).
--    - p_limit := 5000 (lote acotado de 5.000 eventos por ciclo diario para evitar locks prolongados).
-- 4. Idempotencia: Desprograma cualquier versión previa del job 'daily_purge_campaign_events'
--    antes de programar, evitando duplicación en cron.job.
-- 5. No modifica la consolidación existente de cada 10 minutos ni toca ventas ni stock.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Eliminar job previo si existiera para garantizar idempotencia y evitar duplicaciones
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('daily_purge_campaign_events')
        WHERE EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'daily_purge_campaign_events'
        );
    END IF;
END;
$$;

-- 2. Programar el cron job diario
-- Expresión cron: 30 7 * * * -> 07:30 UTC = 04:30 AM Argentina (UTC-3)
SELECT cron.schedule(
    'daily_purge_campaign_events',
    '30 7 * * *',
    $$SELECT public.purge_consolidated_campaign_events(p_dry_run := false, p_retention_days := 30, p_limit := 5000);$$
);

COMMIT;

