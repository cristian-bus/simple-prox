-- ==============================================================================
-- SIMPLE PROX — PASO 7D: CORRECCIÓN DE POLÍTICA RLS RESIDUAL (campaigns_select_anon)
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Modo: CAMBIO QUIRÚRGICO — ATÓMICO CON VALIDACIÓN PREVIA
-- ==============================================================================

BEGIN;

-- 1. Timeout estricto de bloqueo (3 segundos) — Sintaxis nativa PostgreSQL
SET LOCAL lock_timeout = '3s';

-- 2. Validación pre-migración: Confirmar que las 21 campañas comerciales existen
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.campaigns;
  IF v_count < 21 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaban al menos 21 campañas comerciales (encontradas: %)', v_count;
  END IF;
END $$;

-- 3. Modificación quirúrgica exclusiva de la política residual campaigns_select_anon
DROP POLICY IF EXISTS "campaigns_select_anon" ON public.campaigns;

CREATE POLICY "campaigns_select_anon" ON public.campaigns
  FOR SELECT TO anon
  USING (status = 'active' AND is_daily_limit_enabled = false);

COMMIT;

