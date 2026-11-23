-- ==============================================================================
-- KioscoProX / Simple ProX — Migración: Rutinas de Consolidación y Purga (PL/pgSQL)
-- Archivo: 20261106_campaign_statistics_functions.sql
-- Fase: FASE 4A (Preparación y Auditoría de Migraciones SQL No Destructivas)
-- Versión compatible: Simple ProX 1.3.10
-- Modo: BORRADOR LOCAL AUDITADO — NO EJECUTAR EN SUPABASE PRODUCCIÓN HASTA AUTORIZACIÓN
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. FUNCIÓN DE CONSOLIDACIÓN ATÓMICA E IDEMPOTENTE (Advisory Locks + FOR UPDATE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.consolidate_campaign_events_batch(
    p_worker_id text DEFAULT 'cron-worker',
    p_limit integer DEFAULT 50000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_locked boolean;
    v_start_time timestamptz := pg_catalog.clock_timestamp();
    v_processed_count integer := 0;
    v_now timestamptz := pg_catalog.now();
    v_batch_ids uuid[];
BEGIN
    -- [CONTROL DE SEGURIDAD: AUTORIZACIÓN BASADA EN ROLES EFECTIVOS]
    -- Solo se admite la sesión directa de mantenimiento (postgres) o llamadas con privilegios
    -- efectivos de service_role comprobados mediante el catálogo nativo de roles de PostgreSQL
    IF session_user NOT IN ('postgres', 'service_role') AND NOT pg_catalog.pg_has_role(session_user, 'service_role', 'MEMBER') THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren privilegios efectivos de service_role o postgres.';
    END IF;

    -- [VALIDACIÓN DE PARÁMETROS: LÍMITE DE PROCESAMIENTO]
    IF p_limit IS NULL OR p_limit <= 0 THEN
        RAISE EXCEPTION 'PARAMETRO_INVALIDO: p_limit debe ser un entero positivo mayor a cero (recibido: %).', p_limit;
    END IF;

    IF p_limit > 50000 THEN
        RAISE EXCEPTION 'PARAMETRO_INVALIDO: p_limit excede el maximo permitido de 50.000 eventos por lote (recibido: %).', p_limit;
    END IF;

    -- [CONCURRENCIA 1] Lock transaccional exclusivo para impedir ejecuciones concurrentes
    -- Se libera automáticamente al finalizar la transacción (commit o rollback)
    v_locked := pg_catalog.pg_try_advisory_xact_lock(847291038472910283);
    IF NOT v_locked THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false, 
            'reason', 'LOCKED_BY_ANOTHER_TRANSACTION', 
            'processed', 0
        );
    END IF;

    -- [CONCURRENCIA 2] Seleccionar y bloquear explícitamente el conjunto de IDs
    SELECT pg_catalog.array_agg(id) INTO v_batch_ids
    FROM (
        SELECT id
        FROM public.campaign_events
        WHERE aggregated_at IS NULL
          AND campaign_id IS NOT NULL
        ORDER BY id ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    ) sub;

    IF v_batch_ids IS NULL OR pg_catalog.array_length(v_batch_ids, 1) = 0 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true, 
            'processed', 0, 
            'message', 'NO_PENDING_EVENTS'
        );
    END IF;

    -- [PASO 1] Upsert acumulativo en campaign_daily_aggregates
    -- Agrupa estrictamente bajo el huso horario oficial de Argentina
    INSERT INTO public.campaign_daily_aggregates (
        campaign_id, event_date, event_type, merchant_id, event_count, updated_at
    )
    SELECT 
        ce.campaign_id,
        (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS event_date,
        ce.event_type,
        ce.merchant_id,
        pg_catalog.count(*)::integer AS event_count,
        v_now
    FROM public.campaign_events ce
    WHERE ce.id = ANY(v_batch_ids)
    GROUP BY 
        ce.campaign_id, 
        (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 
        ce.event_type, 
        ce.merchant_id
    ON CONFLICT (campaign_id, event_date, event_type, merchant_id)
    DO UPDATE SET
        event_count = public.campaign_daily_aggregates.event_count + EXCLUDED.event_count,
        updated_at = v_now;

    -- [PASO 2] Marcar los eventos consolidados en el buffer crudo
    UPDATE public.campaign_events
    SET aggregated_at = v_now
    WHERE id = ANY(v_batch_ids);

    GET DIAGNOSTICS v_processed_count = ROW_COUNT;

    -- [TELEMETRÍA] Registro en log de auditoría
    INSERT INTO public.consolidation_audit_log (
        run_at, operation, batch_count, status, duration_ms, details
    )
    VALUES (
        v_now, 'CONSOLIDATE', v_processed_count, 'SUCCESS',
        EXTRACT(MILLISECONDS FROM (pg_catalog.clock_timestamp() - v_start_time))::integer,
        pg_catalog.jsonb_build_object('worker', p_worker_id, 'batch_size', pg_catalog.array_length(v_batch_ids, 1))
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'processed', v_processed_count,
        'duration_ms', EXTRACT(MILLISECONDS FROM (pg_catalog.clock_timestamp() - v_start_time))::integer
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

COMMENT ON FUNCTION public.consolidate_campaign_events_batch IS 
'Consolida lotes de eventos crudos en campaign_daily_aggregates de forma atómica e idempotente con advisory locks y search_path seguro.';

-- ==============================================================================
-- 2. FUNCIÓN DE RECONCILIACIÓN HISTÓRICA 4D BIDIRECCIONAL (FULL OUTER JOIN)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.reconcile_campaign_metrics_4d(
    p_date_to date DEFAULT NULL,
    p_campaign_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_summary jsonb;
    v_mismatches jsonb;
BEGIN
    -- [CONTROL DE SEGURIDAD: AUTORIZACIÓN BASADA EN ROLES EFECTIVOS]
    -- Solo se admite la sesión directa de mantenimiento (postgres) o llamadas con privilegios
    -- efectivos de service_role comprobados mediante el catálogo nativo de roles de PostgreSQL
    IF session_user NOT IN ('postgres', 'service_role') AND NOT pg_catalog.pg_has_role(session_user, 'service_role', 'MEMBER') THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren privilegios efectivos de service_role o postgres.';
    END IF;

    WITH raw_present AS (
        SELECT 
            ce.campaign_id,
            (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS event_date,
            ce.merchant_id,
            ce.event_type,
            pg_catalog.count(*)::bigint AS present_count
        FROM public.campaign_events ce
        WHERE ce.aggregated_at IS NOT NULL
          AND ce.campaign_id IS NOT NULL
          AND (p_date_to IS NULL OR (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= p_date_to)
          AND (p_campaign_id IS NULL OR ce.campaign_id = p_campaign_id)
        GROUP BY 
            ce.campaign_id, 
            (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 
            ce.merchant_id, 
            ce.event_type
    ),
    purged_summary AS (
        SELECT 
            pl.campaign_id,
            pl.event_date,
            pl.merchant_id,
            pl.event_type,
            pg_catalog.sum(pl.purged_count)::bigint AS total_purged
        FROM public.purge_ledger pl
        WHERE (p_date_to IS NULL OR pl.event_date <= p_date_to)
          AND (p_campaign_id IS NULL OR pl.campaign_id = p_campaign_id)
        GROUP BY 
            pl.campaign_id, 
            pl.event_date, 
            pl.merchant_id, 
            pl.event_type
    ),
    total_accounted AS (
        SELECT 
            COALESCE(r.campaign_id, p.campaign_id) AS campaign_id,
            COALESCE(r.event_date, p.event_date) AS event_date,
            COALESCE(r.merchant_id, p.merchant_id) AS merchant_id,
            COALESCE(r.event_type, p.event_type) AS event_type,
            (COALESCE(r.present_count, 0) + COALESCE(p.total_purged, 0)) AS accounted_count
        FROM raw_present r
        FULL OUTER JOIN purged_summary p
          ON r.campaign_id = p.campaign_id
         AND r.event_date = p.event_date
         AND r.merchant_id = p.merchant_id
         AND r.event_type = p.event_type
    ),
    agg_source AS (
        SELECT 
            cda.campaign_id,
            cda.event_date,
            cda.merchant_id,
            cda.event_type,
            cda.event_count::bigint AS agg_count
        FROM public.campaign_daily_aggregates cda
        WHERE (p_date_to IS NULL OR cda.event_date <= p_date_to)
          AND (p_campaign_id IS NULL OR cda.campaign_id = p_campaign_id)
    ),
    recon_rows AS (
        SELECT 
            COALESCE(t.campaign_id, a.campaign_id) AS campaign_id,
            COALESCE(t.event_date, a.event_date) AS event_date,
            COALESCE(t.merchant_id, a.merchant_id) AS merchant_id,
            COALESCE(t.event_type, a.event_type) AS event_type,
            COALESCE(t.accounted_count, 0) AS accounted_count,
            COALESCE(a.agg_count, 0) AS agg_count,
            CASE 
                WHEN t.campaign_id IS NULL THEN 'ORPHAN_IN_AGGREGATES'
                WHEN a.campaign_id IS NULL THEN 'MISSING_IN_AGGREGATES'
                WHEN t.accounted_count != a.agg_count THEN 'COUNT_MISMATCH'
                ELSE 'PERFECT_MATCH'
            END AS status
        FROM total_accounted t
        FULL OUTER JOIN agg_source a
          ON t.campaign_id = a.campaign_id
         AND t.event_date = a.event_date
         AND t.merchant_id = a.merchant_id
         AND t.event_type = a.event_type
    )
    SELECT 
        pg_catalog.jsonb_build_object(
            'total_partitions_checked', pg_catalog.count(*),
            'perfect_matches', pg_catalog.count(*) FILTER (WHERE status = 'PERFECT_MATCH'),
            'mismatches_count', pg_catalog.count(*) FILTER (WHERE status != 'PERFECT_MATCH'),
            'all_matching', COALESCE(pg_catalog.bool_and(status = 'PERFECT_MATCH'), true)
        ),
        COALESCE(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'campaign_id', campaign_id,
                'event_date', event_date,
                'merchant_id', merchant_id,
                'event_type', event_type,
                'accounted', accounted_count,
                'aggregated', agg_count,
                'status', status
            )
        ) FILTER (WHERE status != 'PERFECT_MATCH'), '[]'::jsonb)
    INTO v_summary, v_mismatches
    FROM recon_rows;

    RETURN v_summary || pg_catalog.jsonb_build_object('discrepancies', v_mismatches);
END;
$$;

COMMENT ON FUNCTION public.reconcile_campaign_metrics_4d IS 
'Verifica bidireccionalmente la igualdad 4D con validación administrativa y search_path seguro.';

-- ==============================================================================
-- 3. NOTA DE SEGURIDAD Y PRESERVACIÓN DE DATOS (FASE 4B.5.1)
-- ==============================================================================
-- La rutina destructiva de purga (purge_campaign_events_safe) ha sido desacoplada
-- y excluida de esta migración para garantizar con absoluta certeza que NINGÚN
-- evento comercial pueda ser eliminado durante el despliegue inicial.
-- Su instalación se posterga para una fase posterior, tras validar la retención
-- de los terminales offline y la consolidación acumulada en producción.
-- ==============================================================================

-- ==============================================================================
-- 4. SEGURIDAD Y PERMISOS DE EJECUCIÓN (Principio de Mínimo Privilegio)
-- ==============================================================================
-- Consolidación: Exclusivo para service_role (procesos internos) y postgres (superuser/mantenimiento)
REVOKE ALL ON FUNCTION public.consolidate_campaign_events_batch FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consolidate_campaign_events_batch TO service_role;

-- Conciliación: Exclusivo para service_role (procesos internos) y postgres (superuser/mantenimiento)
REVOKE ALL ON FUNCTION public.reconcile_campaign_metrics_4d FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_campaign_metrics_4d TO service_role;

COMMIT;
