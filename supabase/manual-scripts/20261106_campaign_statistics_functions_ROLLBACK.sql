-- ==============================================================================
-- KioscoProX / Simple ProX — Script de Rollback: Funciones de Estadísticas
-- Archivo: 20261106_campaign_statistics_functions_ROLLBACK.sql
-- Fase: FASE 4A (Reversibilidad Segura)
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.purge_campaign_events_safe(integer, integer, boolean, text);
DROP FUNCTION IF EXISTS public.reconcile_campaign_metrics_4d(date, text);
DROP FUNCTION IF EXISTS public.consolidate_campaign_events_batch(text, integer);

COMMIT;

