-- ============================================================================
-- SIMPLE PROX v1.3.10 — FASE 3A.2: PROPUESTA DE ESQUEMA DE ESTADÍSTICAS AGREGADAS
-- ARCHIVO DE PROPUESTA TÉCNICA CORREGIDA — NO EJECUTAR EN PRODUCCIÓN
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLA DE AGREGADOS DIARIOS CONSERVADORA (Sin ON DELETE CASCADE)
-- ----------------------------------------------------------------------------
-- Preserva permanentemente estadísticas comerciales aunque la campaña sea archivada.
CREATE TABLE IF NOT EXISTS public.campaign_daily_aggregates (
    campaign_id text NOT NULL,
    event_date date NOT NULL,
    event_type text NOT NULL,
    merchant_id text NOT NULL,
    event_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT campaign_daily_aggregates_pk PRIMARY KEY (campaign_id, event_date, event_type, merchant_id)
);

-- Índices de consulta rápida optimizados para el Panel Administrativo
CREATE INDEX IF NOT EXISTS idx_cda_campaign_date 
    ON public.campaign_daily_aggregates (campaign_id, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_cda_merchant_date 
    ON public.campaign_daily_aggregates (merchant_id, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_cda_date_type 
    ON public.campaign_daily_aggregates (event_date DESC, event_type);

-- ----------------------------------------------------------------------------
-- 2. TABLA DE CUARENTENA / DEDUPLICACIÓN POST-PURGA
-- ----------------------------------------------------------------------------
-- Registra eventos tardíos que llegan con fechas anteriores al horizonte de purga
-- para evitar sobreescrituras o desfasajes sin requerir modificar terminal-sync.
CREATE TABLE IF NOT EXISTS public.campaign_events_quarantine (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id text NOT NULL,
    merchant_id text NOT NULL,
    campaign_id text NOT NULL,
    event_type text NOT NULL,
    timestamp timestamptz NOT NULL,
    synced_at timestamptz NOT NULL DEFAULT now(),
    quarantine_reason text NOT NULL,
    reviewed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ceq_event_id ON public.campaign_events_quarantine(event_id);

-- ----------------------------------------------------------------------------
-- 3. BITÁCORA DE AUDITORÍA Y CHECKPOINTS DE CONSOLIDACIÓN
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consolidation_audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_at timestamptz NOT NULL DEFAULT now(),
    operation text NOT NULL, -- 'CONSOLIDATE' o 'PURGE'
    batch_count integer NOT NULL,
    status text NOT NULL,    -- 'SUCCESS' o 'FAILED'
    duration_ms integer NULL,
    details jsonb NULL,
    error_message text NULL
);

-- Historial formal de purgas ejecutadas con sus fechas de corte
CREATE TABLE IF NOT EXISTS public.purge_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purged_at timestamptz NOT NULL DEFAULT now(),
    cutoff_date date NOT NULL,
    deleted_count integer NOT NULL,
    verified_partitions_count integer NOT NULL,
    executed_by text NOT NULL
);

-- ----------------------------------------------------------------------------
-- 4. FUNCIÓN DE CONSOLIDACIÓN ATÓMICA E IDEMPOTENTE CON ADVISORY LOCKS
-- ----------------------------------------------------------------------------
-- Corrección 1 & 2: Usa pg_try_advisory_xact_lock (se libera solo al terminar la TX)
-- y ejecución imperativa en 2 pasos sin depender de CTEs interdependientes.
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
    v_last_purge_cutoff date;
BEGIN
    -- [CORRECCIÓN 1] Concurrencia segura sin tablas de lock ni expiración arbitraria
    -- Clave advisory lock única: 847291038472910283
    v_locked := pg_try_advisory_xact_lock(847291038472910283);
    IF NOT v_locked THEN
        RETURN jsonb_build_object(
            'success', false, 
            'reason', 'LOCKED_BY_ANOTHER_TRANSACTION', 
            'processed', 0
        );
    END IF;

    -- Obtener la última fecha de purga registrada (si existe)
    SELECT MAX(cutoff_date) INTO v_last_purge_cutoff FROM public.purge_history;

    -- [CORRECCIÓN 2] Seleccionar y bloquear explícitamente el conjunto de IDs
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

    -- [CORRECCIÓN 3] Protección contra eventos tardíos anteriores al horizonte de purga
    -- Si llegó un evento con fecha < v_last_purge_cutoff, enviarlo a cuarentena
    IF v_last_purge_cutoff IS NOT NULL THEN
        WITH quarantined AS (
            INSERT INTO public.campaign_events_quarantine (
                event_id, merchant_id, campaign_id, event_type, timestamp, synced_at, quarantine_reason
            )
            SELECT ce.event_id, ce.merchant_id, ce.campaign_id, ce.event_type, ce.timestamp, ce.synced_at,
                   'EVENTO_LLEGA_POSTERIOR_A_PURGA_HISTORICA'
            FROM public.campaign_events ce
            WHERE ce.id = ANY(v_batch_ids)
              AND (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= v_last_purge_cutoff
            RETURNING event_id
        )
        -- Marcar como agregado para no reprocesar en loop
        UPDATE public.campaign_events
        SET aggregated_at = v_now
        WHERE id = ANY(v_batch_ids)
          AND (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= v_last_purge_cutoff;

        -- Re-filtrar v_batch_ids excluyendo los que fueron a cuarentena
        SELECT array_agg(id) INTO v_batch_ids
        FROM public.campaign_events
        WHERE id = ANY(v_batch_ids)
          AND (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date > v_last_purge_cutoff;

        IF v_batch_ids IS NULL OR array_length(v_batch_ids, 1) = 0 THEN
            RETURN jsonb_build_object(
                'success', true, 
                'processed', 0, 
                'quarantined', true,
                'message', 'EVENTS_ROUTED_TO_QUARANTINE'
            );
        END IF;
    END IF;

    -- [CORRECCIÓN 2] Paso 1: Upsert acumulativo en campaign_daily_aggregates
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

    -- [CORRECCIÓN 2] Paso 2: Marcar los eventos consolidados en campaign_events
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
    -- Ante cualquier error, la transacción se revierte íntegramente
    -- El advisory lock se libera automáticamente al terminar el rollback
    INSERT INTO public.consolidation_audit_log (
        run_at, operation, batch_count, status, error_message
    )
    VALUES (
        v_now, 'CONSOLIDATE', 0, 'FAILED', SQLERRM
    );
    RAISE;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. FUNCIÓN DE PURGA SEGURA CON RECONCILIACIÓN GRANULAR ESTRICTA
-- ----------------------------------------------------------------------------
-- Corrección 4: Control dry-run obligatorio, conciliación estricta de igualdad
-- (raw == agg) y verificación de ausencia de eventos en vuelo o tardíos.
CREATE OR REPLACE FUNCTION public.purge_campaign_events_safe(
    p_older_than_days integer DEFAULT 15,
    p_max_batch_delete integer DEFAULT 50000,
    p_dry_run boolean DEFAULT true, -- POR DEFECTO MODO SIMULACIÓN (DESHABILITADA)
    p_operator text DEFAULT 'system_admin'
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

    -- [CONTROL 1] Verificar que no haya ningún evento sin consolidar anterior al corte
    SELECT COUNT(*) INTO v_unaggregated_count
    FROM public.campaign_events
    WHERE aggregated_at IS NULL
      AND (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= v_cutoff_date;

    IF v_unaggregated_count > 0 THEN
        RAISE EXCEPTION 'PURGA_CANCELADA: Existen % eventos anteriores o iguales a % aún sin consolidar.', 
            v_unaggregated_count, v_cutoff_date;
    END IF;

    -- [CONTROL 2] Reconciliación estricta de igualdad en las 4 dimensiones
    -- Para cada grupo, el conteo en crudo DEBE coincidir con el conteo en la tabla agregada
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
    HAVING COUNT(*) <> COALESCE(cda.event_count, -1) -- Discrepancia si no son exactamente iguales
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

    -- [CONTROL 3] Verificación de modo DRY-RUN
    IF p_dry_run THEN
        RETURN jsonb_build_object(
            'success', true,
            'mode', 'DRY_RUN (SIMULACIÓN - NADA FUE BORRADO)',
            'cutoff_date', v_cutoff_date,
            'verified_partitions', v_verified_partitions_count,
            'eligible_rows', (
                SELECT COUNT(*) FROM public.campaign_events 
                WHERE aggregated_at IS NOT NULL 
                  AND (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= v_cutoff_date
            )
        );
    END IF;

    -- [EJECUCIÓN REAL] Borrado en micro-lotes para evitar locks prolongados
    WITH rows_to_delete AS (
        SELECT id FROM public.campaign_events
        WHERE aggregated_at IS NOT NULL
          AND (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= v_cutoff_date
        LIMIT p_max_batch_delete
    )
    DELETE FROM public.campaign_events
    WHERE id IN (SELECT id FROM rows_to_delete);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Registrar en historial formal de purgas
    INSERT INTO public.purge_history (
        cutoff_date, deleted_count, verified_partitions_count, executed_by
    )
    VALUES (
        v_cutoff_date, v_deleted_count, v_verified_partitions_count, p_operator
    );

    -- Registrar auditoría
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

-- ----------------------------------------------------------------------------
-- 6. VISTA COMBINADA ÓPTIMA PARA EL PANEL ADMINISTRATIVO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_campaign_combined_metrics AS
SELECT 
    campaign_id,
    event_type,
    SUM(total) AS total_count
FROM (
    -- Datos históricos consolidados (100% seguros y permanentes)
    SELECT campaign_id, event_type, event_count AS total
    FROM public.campaign_daily_aggregates
    
    UNION ALL
    
    -- Eventos en vuelo recientes (aún no consolidados)
    SELECT campaign_id, event_type, COUNT(*)::integer AS total
    FROM public.campaign_events
    WHERE aggregated_at IS NULL
    GROUP BY campaign_id, event_type
) unified
GROUP BY campaign_id, event_type;

-- ----------------------------------------------------------------------------
-- 7. SEGURIDAD Y PERMISOS ESTRICTOS (CORRECCIÓN 5)
-- ----------------------------------------------------------------------------
-- Revocar ejecución pública de las funciones administrativas (evita que un cliente POS
-- o usuario con anon key pueda ejecutarlas desde PostgREST via /rpc)
REVOKE ALL ON FUNCTION public.consolidate_campaign_events_batch(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_campaign_events_safe(integer, integer, boolean, text) FROM PUBLIC, anon, authenticated;

-- Otorgar ejecución exclusiva al rol interno del sistema (service_role)
GRANT EXECUTE ON FUNCTION public.consolidate_campaign_events_batch(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_campaign_events_safe(integer, integer, boolean, text) TO service_role;

-- Habilitar RLS en tablas auxiliares y agregadas
ALTER TABLE public.campaign_daily_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_events_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purge_history ENABLE ROW LEVEL SECURITY;

-- Denegar acceso a anónimos
REVOKE ALL ON TABLE public.campaign_daily_aggregates FROM anon;
REVOKE ALL ON TABLE public.campaign_events_quarantine FROM anon;
REVOKE ALL ON TABLE public.consolidation_audit_log FROM anon;
REVOKE ALL ON TABLE public.purge_history FROM anon;

-- Panel administrativo (usuarios autenticados) solo lectura sobre agregados y vista combinada
GRANT SELECT ON TABLE public.campaign_daily_aggregates TO authenticated;
GRANT SELECT ON TABLE public.v_campaign_combined_metrics TO authenticated;

-- Service_role tiene acceso completo para backend, sincronización y Edge Functions
GRANT ALL ON TABLE public.campaign_daily_aggregates TO service_role;
GRANT ALL ON TABLE public.campaign_events_quarantine TO service_role;
GRANT ALL ON TABLE public.consolidation_audit_log TO service_role;
GRANT ALL ON TABLE public.purge_history TO service_role;
GRANT ALL ON TABLE public.v_campaign_combined_metrics TO service_role;
