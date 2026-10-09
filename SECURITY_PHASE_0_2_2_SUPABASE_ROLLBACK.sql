-- ==============================================================================
-- FASE 0.2.2 — ROLLBACK DE CONSTRAINT UNIQUE SOBRE CAMPAIGN_EVENTS
-- ARCHIVO: SECURITY_PHASE_0_2_2_SUPABASE_ROLLBACK.sql
-- ==============================================================================

BEGIN;

ALTER TABLE public.campaign_events
  DROP CONSTRAINT IF EXISTS campaign_events_event_id_unique;

COMMIT;
