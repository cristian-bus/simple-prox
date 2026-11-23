-- ==============================================================================
-- SIMPLE PROX — CORRECCIÓN QUIRÚRGICA RLS: AISLAMIENTO DE CAMPAÑAS PRIVADAS
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Modo: CAMBIO QUIRÚRGICO — ATÓMICO CON VALIDACIÓN PREVIA
-- ==============================================================================

BEGIN;

-- 1. Timeout estricto de bloqueo (3 segundos)
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

-- 3. Reemplazar la política pública permisiva indiscriminada
DROP POLICY IF EXISTS "campaigns_select_public" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_select_active" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_select_admin" ON public.campaigns;

-- 4. Política 1: Acceso público limitado exclusivamente a campañas activas
CREATE POLICY "campaigns_select_active" ON public.campaigns
  FOR SELECT TO public
  USING (status = 'active');

-- 5. Política 2: Acceso total exclusivamente para administradores activos autenticados
CREATE POLICY "campaigns_select_admin" ON public.campaigns
  FOR SELECT TO authenticated
  USING (public.is_active_admin());

COMMIT;

