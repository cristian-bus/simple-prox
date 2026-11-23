-- ============================================================================
-- FUNCIONES DE CONSOLIDACIÓN Y PURGA PARA PRUEBAS EN TEST_DB
-- ============================================================================

-- 1. Función de Consolidación Atómica con Advisory Lock Transaccional
CREATE OR REPLACE FUNCTION public.consolidate_campaign_events_batch(
    p_worker_id text DEFAULT 'cron-worker',
    p_limit integer DEFAULT 50000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_locked boolean;
    v_start_time timestamptz := clock_timestamp();
    v_processed_count integer := 0;
    v_now timestamptz := now();
    v_batch_ids bigint[];
BEGIN
    -- Concurrencia segura mediante Advisory Xact Lock
    v_locked := pg_try_advisory_xact_lock(847291038472910283);
    IF NOT v_locked THEN
        RETURN jsonb_build_object(
            'success', false, 
            'reason', 'LOCKED_BY_ANOTHER_TRANSACTION', 
            'processed', 0
        );
    END IF;

    -- Seleccionar y bloquear explícitamente el conjunto de IDs
    SELECT array_agg(id) INTO v_batch_ids
    FROM (
        SELECT id
        FROM public.campaign_events
        WHERE aggregated_at IS NULL
        ORDER BY id ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    ) sub;

    IF v_batch_ids IS NULL OR array_length(v_batch_ids, 1) = 0 THEN
        RETURN jsonb_build_object(
            'success', true, 
            'processed', 0, 
            'message', 'NO_PENDING_EVENTS'
        );
    END IF;

    -- Paso 1: Upsert acumulativo en campaign_daily_aggregates
    INSERT INTO public.campaign_daily_aggregates (
        campaign_id, event_date, event_type, merchant_id, event_count, updated_at
    )
    SELECT 
        ce.campaign_id,
        (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS event_date,
        ce.event_type,
        ce.merchant_id,
        COUNT(*)::integer AS event_count,
        v_now
    FROM public.campaign_events ce
    WHERE ce.id = ANY(v_batch_ids)
    GROUP BY ce.campaign_id, (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, ce.event_type, ce.merchant_id
    ON CONFLICT (campaign_id, event_date, event_type, merchant_id)
    DO UPDATE SET
        event_count = public.campaign_daily_aggregates.event_count + EXCLUDED.event_count,
        updated_at = v_now;

    -- Paso 2: Marcar los eventos consolidados en campaign_events
    UPDATE public.campaign_events
    SET aggregated_at = v_now
    WHERE id = ANY(v_batch_ids);

    GET DIAGNOSTICS v_processed_count = ROW_COUNT;

    -- Registro en log de auditoría
    INSERT INTO public.consolidation_audit_log (
        run_at, operation, batch_count, status, duration_ms, details
    )
    VALUES (
        v_now, 'CONSOLIDATE', v_processed_count, 'SUCCESS',
        EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_time))::integer,
        jsonb_build_object('worker', p_worker_id, 'batch_size', array_length(v_batch_ids, 1))
    );

    RETURN jsonb_build_object(
        'success', true,
        'processed', v_processed_count,
        'duration_ms', EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_time))::integer
    );

EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.consolidation_audit_log (
        run_at, operation, batch_count, status, error_message
    )
    VALUES (
        v_now, 'CONSOLIDATE', 0, 'FAILED', SQLERRM
    );
    RAISE;
END;
$$;

-- 2. Función de Purga Segura con Reconciliación Granular Estricta
CREATE OR REPLACE FUNCTION public.purge_campaign_events_safe(
    p_older_than_days integer DEFAULT 3,
    p_max_batch_delete integer DEFAULT 50000,
    p_dry_run boolean DEFAULT true,
    p_operator text DEFAULT 'test_admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cutoff_date date;
    v_unaggregated_count integer;
    v_deleted_count integer := 0;
    v_verified_partitions_count integer := 0;
    v_mismatch_record record;
BEGIN
    v_cutoff_date := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - p_older_than_days;

    -- Control 1: Verificar que no haya eventos sin consolidar anteriores o iguales al corte
    SELECT COUNT(*) INTO v_unaggregated_count
    FROM public.campaign_events
    WHERE aggregated_at IS NULL
      AND (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= v_cutoff_date;

    IF v_unaggregated_count > 0 THEN
        RAISE EXCEPTION 'PURGA_CANCELADA: Existen % eventos anteriores o iguales a % aún sin consolidar.', 
            v_unaggregated_count, v_cutoff_date;
    END IF;

    -- Control 2: Reconciliación estricta de igualdad en las 4 dimensiones
    SELECT 
        ce.campaign_id, 
        (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS event_date,
        ce.event_type, 
        ce.merchant_id, 
        COUNT(*) AS raw_count,
        cda.event_count AS agg_count
    INTO v_mismatch_record
    FROM public.campaign_events ce
    LEFT JOIN public.campaign_daily_aggregates cda 
           ON cda.campaign_id = ce.campaign_id 
          AND cda.event_date = (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date 
          AND cda.event_type = ce.event_type 
          AND cda.merchant_id = ce.merchant_id
    WHERE ce.aggregated_at IS NOT NULL
      AND (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= v_cutoff_date
    GROUP BY ce.campaign_id, (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, ce.event_type, ce.merchant_id, cda.event_count
    HAVING COUNT(*) <> COALESCE(cda.event_count, -1)
    LIMIT 1;

    IF v_mismatch_record IS NOT NULL THEN
        RAISE EXCEPTION 'PURGA_CANCELADA: Inconsistencia detectada en grupo (Campaña: %, Fecha: %, Tipo: %, Kiosco: %). Crudos: % != Agregados: %', 
            v_mismatch_record.campaign_id, v_mismatch_record.event_date, v_mismatch_record.event_type, 
            v_mismatch_record.merchant_id, v_mismatch_record.raw_count, v_mismatch_record.agg_count;
    END IF;

    -- Conteo de particiones verificadas
    SELECT COUNT(DISTINCT (ce.campaign_id || '|' || (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date || '|' || ce.event_type || '|' || ce.merchant_id))
    INTO v_verified_partitions_count
    FROM public.campaign_events ce
    WHERE ce.aggregated_at IS NOT NULL
      AND (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= v_cutoff_date;

    -- Control 3: Modo Dry-Run
    IF p_dry_run THEN
        RETURN jsonb_build_object(
            'success', true,
            'mode', 'DRY_RUN',
            'cutoff_date', v_cutoff_date,
            'verified_partitions', v_verified_partitions_count,
            'eligible_rows', (
                SELECT COUNT(*) FROM public.campaign_events 
                WHERE aggregated_at IS NOT NULL 
                  AND (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= v_cutoff_date
            )
        );
    END IF;

    -- Ejecución Real de Borrado
    WITH rows_to_delete AS (
        SELECT id FROM public.campaign_events
        WHERE aggregated_at IS NOT NULL
          AND (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= v_cutoff_date
        LIMIT p_max_batch_delete
    )
    DELETE FROM public.campaign_events
    WHERE id IN (SELECT id FROM rows_to_delete);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Registro en purge_ledger
    INSERT INTO public.purge_ledger (
        cutoff_date, deleted_count, verified_partitions_count, executed_by
    )
    VALUES (
        v_cutoff_date, v_deleted_count, v_verified_partitions_count, p_operator
    );

    -- Registro en auditoría
    INSERT INTO public.consolidation_audit_log (
        operation, batch_count, status, details
    )
    VALUES (
        'PURGE', v_deleted_count, 'SUCCESS',
        jsonb_build_object('cutoff_date', v_cutoff_date, 'operator', p_operator)
    );

    RETURN jsonb_build_object(
        'success', true,
        'mode', 'REAL_PURGE',
        'deleted_count', v_deleted_count,
        'cutoff_date', v_cutoff_date,
        'verified_partitions', v_verified_partitions_count
    );
END;
$$;

