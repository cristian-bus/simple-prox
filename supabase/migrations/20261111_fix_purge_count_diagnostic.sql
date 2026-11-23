-- ==============================================================================
-- KioscoProX / Simple ProX — Migración Incremental: Conteo Real DELETE y Bloqueo Concurrente
-- Archivo: 20261111_fix_purge_count_diagnostic.sql
-- Fase: FASE 4B.7.5 (Tarea 1 y Tarea 3 - Ajuste Final Preproducción)
-- ==============================================================================
-- Propósito:
-- 1. Contar exactamente las filas eliminadas sumando del.cnt desde el CTE
--    WITH deleted_rows AS (DELETE ... RETURNING 1 as cnt).
--    NO asume que v_eligible_count == v_deleted_count.
-- 2. Prevención de ejecuciones concurrentes mediante pg_try_advisory_xact_lock.
--    Si otra instancia de purga estuviera corriendo, sale limpiamente sin solaparse.
-- 3. Preservar intacta la inserción y auditoría agrupada en public.purge_ledger.
-- 4. Mantener la autorización estricta (service_role, postgres, supabase_admin).
-- 5. Parámetros de seguridad: p_dry_run = true por defecto, retención >= 30 días,
--    límite entre 1 y 10000.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

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
    v_has_lock boolean;
BEGIN
    -- 1. Control estricto de autorización (compatible con pg_cron de Supabase que corre como postgres, y service_role)
    v_role := current_setting('role', true);
    IF v_role IS NULL OR (v_role NOT IN ('service_role', 'postgres', 'supabase_admin') AND NOT pg_has_role(session_user, 'service_role', 'MEMBER') AND session_user NOT IN ('postgres', 'supabase_admin')) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: purge_consolidated_campaign_events requires service_role or admin privileges (current role: %, user: %)', coalesce(v_role, 'none'), session_user;
    END IF;

    -- 2. Prevención de ejecuciones concurrentes de purga (Advisory Xact Lock)
    -- Hash constante determinista: hashtext('public.purge_consolidated_campaign_events') = 1845192842
    v_has_lock := pg_try_advisory_xact_lock(1845192842);
    IF NOT v_has_lock THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CONCURRENT_PURGE_IN_PROGRESS',
            'error', 'Otra operación de purga se encuentra en ejecución activa. Operación omitida por seguridad.',
            'dry_run', p_dry_run,
            'purged_count', 0
        );
    END IF;

    -- 3. Validación de parámetros de seguridad obligatorios
    IF p_retention_days < 30 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_retention_days must be at least 30 (got %)', p_retention_days;
    END IF;

    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_limit must be between 1 and 10000 (got %)', p_limit;
    END IF;

    -- 4. Cálculo de corte temporal exacto en UTC con margen de seguridad de 1 hora
    v_cutoff_timestamp := now() - (p_retention_days || ' days')::interval - interval '1 hour';

    -- 5. Identificar eventos elegibles estrictamente consolidados y anteriores a la fecha de corte
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

    -- 6. Ejecutar eliminación midiendo directamente las filas borradas por DELETE
    IF v_eligible_count > 0 AND NOT p_dry_run THEN
        WITH deleted_rows AS (
            DELETE FROM public.campaign_events
            WHERE id = ANY(v_event_ids)
            RETURNING campaign_id, timestamp, merchant_id, event_type, 1 AS cnt
        ),
        inserted_ledger AS (
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
            GROUP BY del.campaign_id, (del.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, del.merchant_id, del.event_type
            RETURNING 1
        )
        -- Conteo directo de filas eliminadas por el DELETE
        SELECT coalesce(sum(cnt), 0)
        INTO v_deleted_count
        FROM deleted_rows;
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

COMMENT ON FUNCTION public.purge_consolidated_campaign_events(boolean, integer, integer) IS 'Purga quirúrgica de eventos consolidados antiguos con conteo real directo de DELETE, bloqueo contra concurrencia y auditoría';

COMMIT;
