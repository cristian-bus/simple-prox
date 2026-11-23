-- ==============================================================================
-- KioscoProX / Simple ProX — Copia de Seguridad Previa a Migración RLS
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Fecha de captura: 13 de Octubre de 2026
-- Objetivo: Registro exacto del estado de políticas, funciones y permisos previo al cambio.
-- ==============================================================================

-- 1. POLÍTICAS RLS PREVIAS EN public.merchants:
-- Policy: merchants_select_auth
-- CREATE POLICY "merchants_select_auth" ON public.merchants
--   FOR SELECT TO public
--   USING ((auth.role() = 'authenticated'::text));

-- Policy: merchants_delete_auth
-- CREATE POLICY "merchants_delete_auth" ON public.merchants
--   FOR DELETE TO public
--   USING ((auth.role() = 'authenticated'::text));

-- 2. POLÍTICAS RLS PREVIAS EN public.campaigns:
-- Policy: campaigns_select_public (Se conserva en la migración)
-- CREATE POLICY "campaigns_select_public" ON public.campaigns
--   FOR SELECT TO public
--   USING (true);

-- Policy: campaigns_all_auth
-- CREATE POLICY "campaigns_all_auth" ON public.campaigns
--   FOR ALL TO public
--   USING ((auth.role() = 'authenticated'::text))
--   WITH CHECK ((auth.role() = 'authenticated'::text));

-- 3. ESTADO DE FUNCIÓN public.is_active_admin():
-- NO EXISTÍA PREVIAMENTE.

-- 4. PRIVILEGIOS DE TABLA PREVIOS (information_schema.role_table_grants):
-- anon: SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE en merchants y campaigns.
-- authenticated: SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE en merchants y campaigns.
-- service_role: SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE en merchants y campaigns.
