-- ==============================================================================
-- KioscoProX / Simple ProX — Rollback de Soporte de Cupos Publicitarios B2B
-- Fase: FASE 5C.3B (Rollback Seguro en Caso de Requerirse)
-- Proyecto: qtixbiikhvhzwshfgyeo
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

DROP VIEW IF EXISTS public.v_campaign_daily_quotas;
DROP INDEX IF EXISTS public.idx_campaign_events_daily_impressions;
ALTER TABLE public.campaigns DROP COLUMN IF EXISTS is_daily_limit_enabled;

COMMIT;
