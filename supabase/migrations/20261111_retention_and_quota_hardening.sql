-- ==============================================================================
-- KioscoProX / Simple ProX — Migración de Endurecimiento de Retención y Cuotas
-- Fase: FASE 4B.7.2 (Preparación de Migración Segura para Docker / Producción)
-- Fecha: 11 de Noviembre de 2026
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Desacoplamiento de v_campaign_daily_quotas respecto de campaign_events crudos
-- Ahora calcula el consumo del día de hoy a través de v_campaign_combined_metrics
CREATE OR REPLACE VIEW public.v_campaign_daily_quotas
WITH (security_invoker = true) AS
WITH today_counts AS (
  SELECT 
    v.campaign_id,
    SUM(v.event_count)::bigint AS impressions_today
  FROM public.v_campaign_combined_metrics v
  WHERE v.event_type = 'impression'
    AND v.event_date = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    AND v.campaign_id IS NOT NULL
  GROUP BY v.campaign_id
)
SELECT 
  c.id AS campaign_id,
  c.title,
  c.status,
  c.daily_limit,
  c.is_daily_limit_enabled,
  COALESCE(tc.impressions_today, 0) AS impressions_today,
  CASE 
    WHEN NOT c.is_daily_limit_enabled THEN false
    WHEN c.daily_limit IS NULL OR c.daily_limit <= 0 THEN false
    WHEN COALESCE(tc.impressions_today, 0) >= c.daily_limit THEN true
    ELSE false
  END AS is_quota_exhausted
FROM public.campaigns c
LEFT JOIN today_counts tc ON tc.campaign_id = c.id;

REVOKE ALL ON public.v_campaign_daily_quotas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_campaign_daily_quotas TO service_role;

-- 2. Función de Purga Quirúrgica y Segura de Eventos Consolidados Antiguos
CREATE OR REPLACE FUNCTION public.purge_consolidated_campaign_events(
    p_dry_run boolean DEFAULT true,
    p_retention_days integer DEFAULT 30,
    p_limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role text;
    v_deleted_count integer := 0;
    v_eligible_count integer := 0;
    v_cutoff_timestamp timestamptz;
    v_start_time timestamptz := clock_timestamp();
    v_duration_ms integer;
    v_event_ids uuid[];
    v_purge_batch_id uuid := gen_random_uuid();
BEGIN
    -- 1. Control estricto de autorización (solo service_role o superuser)
    v_role := current_setting('role', true);
    IF v_role IS NULL OR (v_role NOT IN ('service_role', 'postgres', 'supabase_admin') AND NOT pg_has_role(session_user, 'service_role', 'MEMBER')) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: purge_consolidated_campaign_events requires service_role or admin privileges (current role: %)', coalesce(v_role, 'none');
    END IF;

    -- 2. Validación de parámetros de seguridad obligatorios
    IF p_retention_days < 30 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_retention_days must be at least 30 (got %)', p_retention_days;
    END IF;

    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_limit must be between 1 and 10000 (got %)', p_limit;
    END IF;

    -- 3. Cálculo de corte temporal exacto en UTC con margen de seguridad de 1 hora
    -- Esto garantiza que todo evento purgado tenga estrictamente más de 30 días en cualquier reloj
    v_cutoff_timestamp := now() - (p_retention_days || ' days')::interval - interval '1 hour';

    -- 4. Identificar eventos elegibles estrictamente consolidados y anteriores a la fecha de corte
    SELECT array_agg(id)
    INTO v_event_ids
    FROM (
        SELECT id
        FROM public.campaign_events
        WHERE aggregated_at IS NOT NULL
          AND timestamp < v_cutoff_timestamp
        ORDER BY timestamp ASC
        LIMIT p_limit
    ) sub;

    v_eligible_count := coalesce(cardinality(v_event_ids), 0);

    -- 5. Ejecutar eliminación o simulación (dry_run)
    IF v_eligible_count > 0 AND NOT p_dry_run THEN
        WITH deleted_rows AS (
            DELETE FROM public.campaign_events
            WHERE id = ANY(v_event_ids)
            RETURNING campaign_id, timestamp, merchant_id, event_type
        )
        INSERT INTO public.purge_ledger (
            purge_batch_id,
            campaign_id,
            event_date,
            merchant_id,
            event_type,
            purged_count,
            cutoff_date,
            executed_by
        )
        SELECT 
            v_purge_batch_id,
            del.campaign_id,
            (del.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
            del.merchant_id,
            del.event_type,
            count(*)::integer,
            v_cutoff_timestamp::date,
            coalesce(v_role, session_user)
        FROM deleted_rows del
        GROUP BY del.campaign_id, (del.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, del.merchant_id, del.event_type;

        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    END IF;

    v_duration_ms := (EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000)::integer;

    RETURN jsonb_build_object(
        'dry_run', p_dry_run,
        'purge_batch_id', v_purge_batch_id,
        'eligible_count', v_eligible_count,
        'purged_count', v_deleted_count,
        'retention_days', p_retention_days,
        'cutoff_timestamp', v_cutoff_timestamp,
        'duration_ms', v_duration_ms
    );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_consolidated_campaign_events(boolean, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_consolidated_campaign_events(boolean, integer, integer) TO service_role;

COMMIT;
