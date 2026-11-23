-- ==============================================================================
-- SIMPLE PROX — ROLLBACK ESPECÍFICO: RESTABLECER campaigns_select_anon ORIGINAL
-- ==============================================================================
-- ADVERTENCIA CRÍTICA:
-- Restaurar esta política sin el filtro de estado status = 'active' vuelve a exponer
-- públicamente las campañas pausadas y borradores que tengan is_daily_limit_enabled = false.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';

DROP POLICY IF EXISTS "campaigns_select_anon" ON public.campaigns;

CREATE POLICY "campaigns_select_anon" ON public.campaigns
  FOR SELECT TO anon
  USING (is_daily_limit_enabled = false);

COMMIT;

