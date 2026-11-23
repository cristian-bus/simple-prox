-- ==============================================================================
-- KioscoProX / Simple ProX — Migración Atómica de Producción: RLS Merchants y Campaigns
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Fecha: 13 de Octubre de 2026
-- Modo: CAMBIO QUIRÚRGICO — ATÓMICO CON SANITY CHECK
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. FUNCIÓN DE SEGURIDAD: public.is_active_admin()
-- ==============================================================================
-- Función STABLE SECURITY DEFINER con search_path vacío para prevenir search-path hijacking.
-- Referencias totalmente calificadas a esquemas (public.admin_users, auth.uid()).

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
      AND is_active = true
  );
END;
$$;

ALTER FUNCTION public.is_active_admin() OWNER TO postgres;

-- Revocación estricta de ejecución a PUBLIC y anon
REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated, service_role;

COMMENT ON FUNCTION public.is_active_admin() IS 'Verifica si el usuario autenticado actual es un administrador activo en admin_users sin exponer la tabla privada';

-- ==============================================================================
-- 2. COMPROBACIÓN PREVIA AUTOMÁTICA (SANITY CHECK)
-- ==============================================================================
-- Si el administrador real existente (16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2) no es validado,
-- la transacción aborta automáticamente sin alterar ninguna política existente.
DO $$
DECLARE
  v_test_admin boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub": "16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2", "role": "authenticated"}', true);
  v_test_admin := public.is_active_admin();
  
  IF NOT v_test_admin THEN
    RAISE EXCEPTION 'ABORTE DE SEGURIDAD: is_active_admin() retornó false para el administrador real existente.';
  END IF;

  -- Restablecer claims para no alterar el contexto de la sesión posterior
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- ==============================================================================
-- 3. REVOCACIÓN DE PRIVILEGIOS DESTRUCTIVOS (TRUNCATE Y TRIGGER)
-- ==============================================================================
REVOKE TRUNCATE, TRIGGER ON TABLE public.merchants FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER ON TABLE public.campaigns FROM anon, authenticated;

-- ==============================================================================
-- 4. POLÍTICAS RLS EN public.merchants (RESOLUCIÓN ERROR 42501)
-- ==============================================================================
DROP POLICY IF EXISTS "merchants_select_auth" ON public.merchants;
DROP POLICY IF EXISTS "merchants_delete_auth" ON public.merchants;
DROP POLICY IF EXISTS "merchants_select_admin" ON public.merchants;
DROP POLICY IF EXISTS "merchants_insert_admin" ON public.merchants;
DROP POLICY IF EXISTS "merchants_update_admin" ON public.merchants;
DROP POLICY IF EXISTS "merchants_delete_admin" ON public.merchants;

-- Lectura: Solo administradores activos
CREATE POLICY "merchants_select_admin" ON public.merchants
  FOR SELECT TO authenticated
  USING (public.is_active_admin());

-- Inserción: Solo administradores activos (soluciona error 42501 en diagnóstico/registro)
CREATE POLICY "merchants_insert_admin" ON public.merchants
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());

-- Actualización: Solo administradores activos (permite editar comercios en panel admin)
CREATE POLICY "merchants_update_admin" ON public.merchants
  FOR UPDATE TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- Eliminación: Solo administradores activos (elimina la brecha de borrado por usuarios comunes)
CREATE POLICY "merchants_delete_admin" ON public.merchants
  FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ==============================================================================
-- 5. POLÍTICAS RLS EN public.campaigns
-- ==============================================================================
-- REGLA CRÍTICA: campaigns_select_public ("true") SE PRESERVA INTACTA para el POS offline.
-- Se reemplaza campaigns_all_auth por políticas explícitas y granulares para administradores activos.

DROP POLICY IF EXISTS "campaigns_all_auth" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_admin_manage" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_insert_admin" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_update_admin" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_delete_admin" ON public.campaigns;

-- Inserción: Solo administradores activos
CREATE POLICY "campaigns_insert_admin" ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());

-- Actualización: Solo administradores activos
CREATE POLICY "campaigns_update_admin" ON public.campaigns
  FOR UPDATE TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- Eliminación: Solo administradores activos
CREATE POLICY "campaigns_delete_admin" ON public.campaigns
  FOR DELETE TO authenticated
  USING (public.is_active_admin());

COMMIT;
