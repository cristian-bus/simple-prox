-- KioscoProX / Simple ProX — Estado de Políticas RLS Activas Posterior a Fase 0.2
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Fecha: 23 de Septiembre de 2026

-- ==============================================================================
-- 1. TABLA: public.merchants
-- ==============================================================================
-- RLS Habilitada: SÍ
-- Mutaciones directas anon vía PostgREST: DENEGADAS (Solo a través de Edge Function con identidad de terminal)

-- Lectura restringida a administradores autenticados
-- Policy: merchants_select_auth
-- CREATE POLICY "merchants_select_auth" ON public.merchants
-- FOR SELECT TO public
-- USING (auth.role() = 'authenticated');

-- Eliminación restringida a administradores autenticados
-- Policy: merchants_delete_auth
-- CREATE POLICY "merchants_delete_auth" ON public.merchants
-- FOR DELETE TO public
-- USING (auth.role() = 'authenticated');


-- ==============================================================================
-- 2. TABLA: public.campaign_events
-- ==============================================================================
-- RLS Habilitada: SÍ
-- Inserciones directas anon vía PostgREST: DENEGADAS (Solo a través de Edge Function con identidad de terminal)

-- Lectura restringida a administradores autenticados
-- Policy: campaign_events_select_auth
-- CREATE POLICY "campaign_events_select_auth" ON public.campaign_events
-- FOR SELECT TO public
-- USING (auth.role() = 'authenticated');

-- Actualización restringida a administradores autenticados
-- Policy: campaign_events_update_auth
-- CREATE POLICY "campaign_events_update_auth" ON public.campaign_events
-- FOR UPDATE TO public
-- USING (auth.role() = 'authenticated')
-- WITH CHECK (auth.role() = 'authenticated');

-- Eliminación restringida a administradores autenticados
-- Policy: campaign_events_delete_auth
-- CREATE POLICY "campaign_events_delete_auth" ON public.campaign_events
-- FOR DELETE TO public
-- USING (auth.role() = 'authenticated');


-- ==============================================================================
-- 3. TABLA: public.terminal_identities
-- ==============================================================================
-- RLS Habilitada: SÍ
-- Acceso público / anónimo: NINGUNO (100% Privada para service_role de Edge Function)


-- ==============================================================================
-- 4. TABLA: public.campaigns
-- ==============================================================================
-- Lectura pública para descarga del catálogo de ofertas
-- Policy: campaigns_select_public
-- CREATE POLICY "campaigns_select_public" ON public.campaigns
-- FOR SELECT TO public
-- USING (true);

-- Gestión completa restringida a administradores autenticados
-- Policy: campaigns_all_auth
-- CREATE POLICY "campaigns_all_auth" ON public.campaigns
-- FOR ALL TO public
-- USING (auth.role() = 'authenticated')
-- WITH CHECK (auth.role() = 'authenticated');
