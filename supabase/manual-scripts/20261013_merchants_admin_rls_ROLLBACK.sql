-- ==============================================================================
-- KioscoProX / Simple ProX — Script de Rollback de Contención Segura
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Fecha: 13 de Octubre de 2026
-- Objetivo: Reversión controlada sin restaurar políticas inseguras de borrado.
-- Ubicación: supabase/manual-scripts/ (Aislado de migraciones automáticas)
-- ==============================================================================

BEGIN;

-- 1. Eliminar políticas administrativas de merchants
DROP POLICY IF EXISTS "merchants_select_admin" ON public.merchants;
DROP POLICY IF EXISTS "merchants_insert_admin" ON public.merchants;
DROP POLICY IF EXISTS "merchants_update_admin" ON public.merchants;
DROP POLICY IF EXISTS "merchants_delete_admin" ON public.merchants;

-- 2. Eliminar políticas administrativas de campaigns
DROP POLICY IF EXISTS "campaigns_admin_manage" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_insert_admin" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_update_admin" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_delete_admin" ON public.campaigns;

-- 3. Restaurar lectura de comercios para usuarios autenticados
-- NOTA DE CONTENCIÓN: NO se restaura la política insegura merchants_delete_auth
-- para evitar que usuarios no administradores puedan eliminar comercios.
CREATE POLICY "merchants_select_auth" ON public.merchants
  FOR SELECT TO public
  USING (auth.role() = 'authenticated');

-- 4. La política campaigns_select_public ("true") permanece activa para lectura del POS.
-- En contención, las escrituras en campaigns quedan reservadas a service_role.

-- 5. Retirar función auxiliar
DROP FUNCTION IF EXISTS public.is_active_admin();

COMMIT;
