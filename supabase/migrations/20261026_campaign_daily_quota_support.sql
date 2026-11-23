-- ==============================================================================
-- KioscoProX / Simple ProX — Migración de Soporte de Cupos Publicitarios B2B
-- Fase: FASE 5C.3B (Ejecución Controlada en Supabase Producción)
-- Proyecto: qtixbiikhvhzwshfgyeo
-- Fecha de Ejecución: 26 de Octubre de 2026
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- 1. Columna de control de cupo diario (DEFAULT false garantiza que las 21 campañas existentes continúen ilimitadas)
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS is_daily_limit_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.campaigns.is_daily_limit_enabled IS 
'Indica si la campaña debe respetar el cupo diario global de impresiones (daily_limit). Si es false, la campaña es ilimitada.';

-- 2. Índice parcial optimizado para la consulta de impresiones del día
CREATE INDEX IF NOT EXISTS idx_campaign_events_daily_impressions 
ON public.campaign_events (campaign_id, "timestamp") 
WHERE event_type = 'impression';

-- 3. Vista de cupos diarios con seguridad invoker y cálculo por día calendario argentino
CREATE OR REPLACE VIEW public.v_campaign_daily_quotas
WITH (security_invoker = true) AS
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

-- 4. Restricción estricta de privilegios: revocación pública y asignación exclusiva a service_role
REVOKE ALL ON public.v_campaign_daily_quotas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_campaign_daily_quotas TO service_role;

COMMIT;
