-- KioscoProX / Simple ProX — Script SQL de Rollback para Fase 0.2
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Restaura con exactitud las políticas RLS activas previas a la Fase 0.2

-- 1. Restaurar inserción anónima pública en merchants
DROP POLICY IF EXISTS "merchants_insert_public" ON public.merchants;
CREATE POLICY "merchants_insert_public" ON public.merchants
FOR INSERT TO public
WITH CHECK (true);

-- 2. Restaurar actualización anónima pública en merchants
DROP POLICY IF EXISTS "merchants_update_public" ON public.merchants;
CREATE POLICY "merchants_update_public" ON public.merchants
FOR UPDATE TO public
USING (true)
WITH CHECK (true);

-- 3. Restaurar inserción pública en campaign_events
DROP POLICY IF EXISTS "campaign_events_insert_public" ON public.campaign_events;
CREATE POLICY "campaign_events_insert_public" ON public.campaign_events
FOR INSERT TO public
WITH CHECK (
  (event_type = ANY (ARRAY['impression'::text, 'offer_open'::text, 'whatsapp_click'::text]))
  AND (merchant_id IS NOT NULL)
  AND (length(merchant_id) > 0)
);

-- NOTA: La tabla public.terminal_identities puede conservarse sin riesgo
-- o eliminarse si se desea un rollback absoluto de esquema:
-- DROP TABLE IF EXISTS public.terminal_identities;
