-- ==============================================================================
-- KioscoProX / Simple ProX — Migración: Estadísticas Publicitarias Agregadas (DDL)
-- Archivo: 20261106_campaign_statistics_aggregates.sql
-- Fase: FASE 4A (Preparación y Auditoría de Migraciones SQL No Destructivas)
-- Versión compatible: Simple ProX 1.3.10
-- Modo: BORRADOR LOCAL AUDITADO — NO EJECUTAR EN SUPABASE PRODUCCIÓN HASTA AUTORIZACIÓN
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ==============================================================================
-- 1. MARCA DE CONSOLIDACIÓN EN TABLA EXISTENTE campaign_events
-- ==============================================================================
-- Columna nullable que indica el momento exacto en que el evento fue incorporado
-- a los agregados diarios. Si es NULL, el evento está pendiente de consolidar.
ALTER TABLE public.campaign_events 
ADD COLUMN IF NOT EXISTS aggregated_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.campaign_events.aggregated_at IS 
'Timestamp de consolidación en campaign_daily_aggregates. NULL indica que el evento aún no fue procesado por el consolidador.';

-- Índice parcial de ultra bajo costo para ubicar instantáneamente eventos pendientes
CREATE INDEX IF NOT EXISTS idx_campaign_events_unaggregated 
ON public.campaign_events (id) 
WHERE aggregated_at IS NULL;

-- ==============================================================================
-- 2. TABLA: public.campaign_daily_aggregates (Histórico Permanente Agregado)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.campaign_daily_aggregates (
    campaign_id uuid NOT NULL,
    event_date date NOT NULL,
    event_type text NOT NULL,
    merchant_id text NOT NULL,
    event_count integer NOT NULL DEFAULT 0 CHECK (event_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT campaign_daily_aggregates_pk PRIMARY KEY (campaign_id, event_date, event_type, merchant_id)
);

COMMENT ON TABLE public.campaign_daily_aggregates IS 
'Acumulado histórico permanente y particionado por campaña, fecha, tipo de evento y kiosco. Garantiza persistencia tras la purga del buffer crudo.';

-- Índices de consulta frecuente para el panel administrativo y análisis B2B
CREATE INDEX IF NOT EXISTS idx_cda_campaign_date 
ON public.campaign_daily_aggregates (campaign_id, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_cda_merchant_date 
ON public.campaign_daily_aggregates (merchant_id, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_cda_date 
ON public.campaign_daily_aggregates (event_date DESC);

-- ==============================================================================
-- 3. TABLA: public.purge_ledger (Libro Mayor Granular de Eventos Purgados)
-- ==============================================================================
-- Permite reconstruir con precisión matemática la ecuación de integridad:
-- agregados = crudos presentes consolidados + histórico purgado
CREATE TABLE IF NOT EXISTS public.purge_ledger (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purge_batch_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    event_date date NOT NULL,
    merchant_id text NOT NULL,
    event_type text NOT NULL,
    purged_count integer NOT NULL CHECK (purged_count > 0),
    cutoff_date date NOT NULL,
    purged_at timestamptz NOT NULL DEFAULT now(),
    executed_by text NOT NULL DEFAULT 'system_purge'
);

COMMENT ON TABLE public.purge_ledger IS 
'Libro mayor inmutable y granular que audita exactamente cuántos eventos de cada dimensión 4D fueron eliminados durante cada ciclo de purga.';

CREATE INDEX IF NOT EXISTS idx_purge_ledger_composite 
ON public.purge_ledger (campaign_id, event_date, merchant_id, event_type);

CREATE INDEX IF NOT EXISTS idx_purge_ledger_batch 
ON public.purge_ledger (purge_batch_id);

-- ==============================================================================
-- 4. TABLA: public.consolidation_audit_log (Auditoría Operativa de Tareas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.consolidation_audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_at timestamptz NOT NULL DEFAULT now(),
    operation text NOT NULL, -- 'CONSOLIDATE' | 'PURGE' | 'BACKFILL'
    batch_count integer NOT NULL DEFAULT 0,
    status text NOT NULL, -- 'SUCCESS' | 'FAILED' | 'DRY_RUN'
    duration_ms integer,
    error_message text,
    details jsonb
);

COMMENT ON TABLE public.consolidation_audit_log IS 
'Registro de telemetría y auditoría de ejecuciones de consolidación periódica y purga.';

CREATE INDEX IF NOT EXISTS idx_consolidation_audit_log_run_at 
ON public.consolidation_audit_log (run_at DESC);

-- ==============================================================================
-- 5. VISTA COMBINADA: public.v_campaign_combined_metrics
-- ==============================================================================
-- Unifica transparentemente los agregados permanentes con los eventos crudos
-- que acaban de llegar y aún no fueron procesados (aggregated_at IS NULL).
-- WITH (security_invoker = true) asegura que se respeten las políticas RLS del usuario.
CREATE OR REPLACE VIEW public.v_campaign_combined_metrics
WITH (security_invoker = true) AS
SELECT 
    unified.campaign_id,
    unified.event_date,
    unified.event_type,
    unified.merchant_id,
    SUM(unified.event_count)::bigint AS event_count
FROM (
    -- 1. Histórico consolidado permanente
    SELECT 
        cda.campaign_id,
        cda.event_date,
        cda.event_type,
        cda.merchant_id,
        cda.event_count::bigint AS event_count
    FROM public.campaign_daily_aggregates cda

    UNION ALL

    -- 2. Eventos crudos aún no consolidados (en vuelo)
    SELECT 
        ce.campaign_id,
        (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS event_date,
        ce.event_type,
        ce.merchant_id,
        COUNT(*)::bigint AS event_count
    FROM public.campaign_events ce
    WHERE ce.aggregated_at IS NULL
      AND ce.campaign_id IS NOT NULL
    GROUP BY 
        ce.campaign_id, 
        (ce.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 
        ce.event_type, 
        ce.merchant_id
) unified
GROUP BY 
    unified.campaign_id, 
    unified.event_date, 
    unified.event_type, 
    unified.merchant_id;

COMMENT ON VIEW public.v_campaign_combined_metrics IS 
'Vista unificada de métricas 4D con security_invoker: combina el histórico consolidado con eventos crudos respetando RLS.';

-- ==============================================================================
-- 6. VISTA DE TOTALES: public.v_campaign_totals (Para Panel Administrativo)
-- ==============================================================================
CREATE OR REPLACE VIEW public.v_campaign_totals
WITH (security_invoker = true) AS
SELECT 
    campaign_id,
    event_type,
    SUM(event_count)::bigint AS total_count
FROM public.v_campaign_combined_metrics
GROUP BY campaign_id, event_type;

COMMENT ON VIEW public.v_campaign_totals IS 
'Totales agregados por campaña y tipo con security_invoker para despliegue instantáneo en el panel administrativo.';

-- ==============================================================================
-- 7. SEGURIDAD Y PERMISOS (Principio de Mínimo Privilegio y RLS)
-- ==============================================================================
-- Habilitar RLS en tablas nuevas y en el buffer crudo
ALTER TABLE public.campaign_daily_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purge_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;

-- Revocación de privilegios destructivos y públicos en campaign_events
REVOKE ALL ON TABLE public.campaign_events FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON TABLE public.campaign_events FROM authenticated;

-- Asignación estricta de permisos a nivel de tabla
GRANT SELECT ON public.campaign_daily_aggregates TO authenticated;
GRANT SELECT ON public.campaign_events TO authenticated;

GRANT ALL ON public.campaign_daily_aggregates TO service_role;
GRANT ALL ON public.purge_ledger TO service_role;
GRANT ALL ON public.consolidation_audit_log TO service_role;
GRANT ALL ON public.campaign_events TO service_role;

-- Políticas RLS para campaign_daily_aggregates
DROP POLICY IF EXISTS "Allow service_role full campaign_daily_aggregates" ON public.campaign_daily_aggregates;
CREATE POLICY "Allow service_role full campaign_daily_aggregates" 
ON public.campaign_daily_aggregates FOR ALL TO service_role 
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read campaign_daily_aggregates" ON public.campaign_daily_aggregates;
CREATE POLICY "Allow authenticated read campaign_daily_aggregates" 
ON public.campaign_daily_aggregates FOR SELECT TO authenticated 
USING (public.is_active_admin());

-- Limpieza exhaustiva de políticas RLS heredadas en campaign_events (evita bypass por OR)
DROP POLICY IF EXISTS "campaign_events_select_auth" ON public.campaign_events;
DROP POLICY IF EXISTS "campaign_events_update_auth" ON public.campaign_events;
DROP POLICY IF EXISTS "campaign_events_delete_auth" ON public.campaign_events;
DROP POLICY IF EXISTS "campaign_events_admin_select" ON public.campaign_events;
DROP POLICY IF EXISTS "campaign_events_service_role" ON public.campaign_events;

-- Políticas RLS definitivas para campaign_events
-- 1. Lectura exclusiva para administradores activos (auditoría y panel administrativo)
CREATE POLICY "campaign_events_admin_select" 
ON public.campaign_events FOR SELECT TO authenticated 
USING (public.is_active_admin());

-- 2. Acceso total exclusivo para service_role (Edge Function terminal-sync y rutinas del sistema)
CREATE POLICY "campaign_events_service_role" 
ON public.campaign_events FOR ALL TO service_role 
USING (true) WITH CHECK (true);

-- Políticas RLS para purge_ledger (Exclusivo para administradores activos y service_role)
DROP POLICY IF EXISTS "Allow service_role full purge_ledger" ON public.purge_ledger;
CREATE POLICY "Allow service_role full purge_ledger" 
ON public.purge_ledger FOR ALL TO service_role 
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read purge_ledger" ON public.purge_ledger;
CREATE POLICY "Allow authenticated read purge_ledger" 
ON public.purge_ledger FOR SELECT TO authenticated 
USING (public.is_active_admin());

-- Políticas RLS para consolidation_audit_log (Exclusivo para administradores activos y service_role)
DROP POLICY IF EXISTS "Allow service_role full consolidation_audit_log" ON public.consolidation_audit_log;
CREATE POLICY "Allow service_role full consolidation_audit_log" 
ON public.consolidation_audit_log FOR ALL TO service_role 
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read consolidation_audit_log" ON public.consolidation_audit_log;
CREATE POLICY "Allow authenticated read consolidation_audit_log" 
ON public.consolidation_audit_log FOR SELECT TO authenticated 
USING (public.is_active_admin());

-- Asignación de permisos en Vistas con security_invoker
REVOKE ALL ON public.v_campaign_combined_metrics FROM PUBLIC, anon;
GRANT SELECT ON public.v_campaign_combined_metrics TO authenticated, service_role;

REVOKE ALL ON public.v_campaign_totals FROM PUBLIC, anon;
GRANT SELECT ON public.v_campaign_totals TO authenticated, service_role;

COMMIT;
