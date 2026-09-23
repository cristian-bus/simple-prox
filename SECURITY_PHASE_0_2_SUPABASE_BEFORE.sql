-- KioscoProX / Simple ProX — Estado de Políticas RLS Previo a Fase 0.2
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Fecha: 23 de Septiembre de 2026

-- ==============================================================================
-- 1. TABLA: public.merchants
-- ==============================================================================

-- Lectura restringida a administradores autenticados (implementada en Fase 0)
-- Policy: merchants_select_auth
-- CREATE POLICY "merchants_select_auth" ON public.merchants
-- FOR SELECT TO public
-- USING (auth.role() = 'authenticated');

-- Inserción anónima pública (riesgo residual documentado en Fase 0.1)
-- Policy: merchants_insert_public
-- CREATE POLICY "merchants_insert_public" ON public.merchants
-- FOR INSERT TO public
-- WITH CHECK (true);

-- Actualización anónima pública (riesgo residual documentado en Fase 0.1)
-- Policy: merchants_update_public
-- CREATE POLICY "merchants_update_public" ON public.merchants
-- FOR UPDATE TO public
-- USING (true)
-- WITH CHECK (true);

-- Eliminación restringida a administradores autenticados
-- Policy: merchants_delete_auth
-- CREATE POLICY "merchants_delete_auth" ON public.merchants
-- FOR DELETE TO public
-- USING (auth.role() = 'authenticated');


-- ==============================================================================
-- 2. TABLA: public.campaign_events
-- ==============================================================================

-- Lectura restringida a administradores autenticados (implementada en Fase 0)
-- Policy: campaign_events_select_auth
-- CREATE POLICY "campaign_events_select_auth" ON public.campaign_events
-- FOR SELECT TO public
-- USING (auth.role() = 'authenticated');

-- Inserción anónima restringida por tipo de evento (riesgo residual documentado en Fase 0.1)
-- Policy: campaign_events_insert_public
-- CREATE POLICY "campaign_events_insert_public" ON public.campaign_events
-- FOR INSERT TO public
-- WITH CHECK (
--   (event_type = ANY (ARRAY['impression'::text, 'offer_open'::text, 'whatsapp_click'::text]))
--   AND (merchant_id IS NOT NULL)
--   AND (length(merchant_id) > 0)
-- );

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
-- 3. TABLA: public.campaigns
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
