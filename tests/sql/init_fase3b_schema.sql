-- ============================================================================
-- SIMPLE PROX v1.3.10 — FASE 3B.1
-- ESQUEMA SINTÉTICO AISLADO PARA PRUEBAS EN POSTGRESQL 17
-- ============================================================================

-- 1. Tabla de Campañas Sintéticas
CREATE TABLE IF NOT EXISTS public.campaigns (
    id text PRIMARY KEY,
    title text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    daily_limit integer DEFAULT NULL,
    is_daily_limit_enabled boolean NOT NULL DEFAULT false,
    deleted boolean NOT NULL DEFAULT false
);

-- 2. Buffer Crudo de Eventos (Estructura idéntica a producción + aggregated_at)
CREATE TABLE IF NOT EXISTS public.campaign_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id text NOT NULL CONSTRAINT campaign_events_event_id_unique UNIQUE,
    merchant_id text NOT NULL,
    campaign_id text NOT NULL,
    event_type text NOT NULL,
    timestamp timestamptz NOT NULL,
    synced_at timestamptz NOT NULL DEFAULT now(),
    aggregated_at timestamptz NULL
);

-- Índices idénticos a producción
CREATE INDEX IF NOT EXISTS idx_campaign_events_daily_impressions 
ON public.campaign_events (campaign_id, "timestamp") 
WHERE event_type = 'impression';

CREATE INDEX IF NOT EXISTS idx_campaign_events_unaggregated 
ON public.campaign_events (id) 
WHERE aggregated_at IS NULL;

-- 3. Tabla de Agregados Diarios Permanentes
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

CREATE INDEX IF NOT EXISTS idx_cda_campaign_date ON public.campaign_daily_aggregates (campaign_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_cda_merchant_date ON public.campaign_daily_aggregates (merchant_id, event_date DESC);

-- 4. Bitácora Inmutable de Purgas Realizadas
CREATE TABLE IF NOT EXISTS public.purge_ledger (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purged_at timestamptz NOT NULL DEFAULT now(),
    cutoff_date date NOT NULL,
    deleted_count integer NOT NULL,
    verified_partitions_count integer NOT NULL,
    executed_by text NOT NULL
);

-- 5. Bitácora de Auditoría de Consolidación
CREATE TABLE IF NOT EXISTS public.consolidation_audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_at timestamptz NOT NULL DEFAULT now(),
    operation text NOT NULL,
    batch_count integer NOT NULL,
    status text NOT NULL,
    duration_ms integer NULL,
    details jsonb NULL,
    error_message text NULL
);

-- 6. Vista de Topes Diarios (idéntica a producción)
CREATE OR REPLACE VIEW public.v_campaign_daily_quotas AS
WITH day_bounds AS (
  SELECT 
    timezone('America/Argentina/Buenos_Aires', date_trunc('day', timezone('America/Argentina/Buenos_Aires', now()))) AS day_start,
    timezone('America/Argentina/Buenos_Aires', date_trunc('day', timezone('America/Argentina/Buenos_Aires', now())) + interval '1 day') AS day_end
),
today_counts AS (
  SELECT 
    ce.campaign_id,
    COUNT(*) AS impressions_today
  FROM public.campaign_events ce
  CROSS JOIN day_bounds db
  WHERE ce.event_type = 'impression'
    AND ce.timestamp >= db.day_start
    AND ce.timestamp < db.day_end
    AND ce.campaign_id IS NOT NULL
  GROUP BY ce.campaign_id
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

-- 7. Vista Combinada para Panel Administrativo
CREATE OR REPLACE VIEW public.v_campaign_combined_metrics AS
SELECT 
    campaign_id,
    event_type,
    SUM(total) AS total_count
FROM (
    SELECT campaign_id, event_type, event_count AS total
    FROM public.campaign_daily_aggregates
    UNION ALL
    SELECT campaign_id, event_type, COUNT(*)::integer AS total
    FROM public.campaign_events
    WHERE aggregated_at IS NULL
    GROUP BY campaign_id, event_type
) unified
GROUP BY campaign_id, event_type;

-- 8. Inserción de 5 campañas sintéticas de prueba
INSERT INTO public.campaigns (id, title, status, daily_limit, is_daily_limit_enabled) VALUES
('synth-camp-01', 'Campaña Sintética Gaseosa 500ml', 'active', 1000, true),
('synth-camp-02', 'Campaña Sintética Galletitas 150g', 'active', NULL, false),
('synth-camp-03', 'Campaña Sintética Golosinas Alfajor', 'active', 500, true),
('synth-camp-04', 'Campaña Sintética Energizante 250ml', 'active', NULL, false),
('synth-camp-05', 'Campaña Sintética Snacks Salados', 'active', 2000, true)
ON CONFLICT (id) DO NOTHING;

