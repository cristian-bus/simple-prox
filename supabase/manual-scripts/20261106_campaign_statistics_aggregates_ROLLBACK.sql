-- ==============================================================================
-- KioscoProX / Simple ProX — Script de Rollback: Estadísticas Publicitarias (DDL)
-- Archivo: 20261106_campaign_statistics_aggregates_ROLLBACK.sql
-- Fase: FASE 4A (Reversibilidad Segura)
-- Escenario Aplicable: ESCENARIO A (Antes de haber activado la purga real de datos)
-- ATENCIÓN: Si ya se ejecutó una purga real, NO ejecutar este script sin haber
-- salvaguardado los datos agregados, pues los eventos crudos purgados no se recuperan.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Eliminar vistas
DROP VIEW IF EXISTS public.v_campaign_totals CASCADE;
DROP VIEW IF EXISTS public.v_campaign_combined_metrics CASCADE;

-- 2. Eliminar tablas creadas
DROP TABLE IF EXISTS public.consolidation_audit_log CASCADE;
DROP TABLE IF EXISTS public.purge_ledger CASCADE;
DROP TABLE IF EXISTS public.campaign_daily_aggregates CASCADE;

-- 3. Eliminar índice y columna en campaign_events
DROP INDEX IF EXISTS public.idx_campaign_events_unaggregated;
ALTER TABLE public.campaign_events DROP COLUMN IF EXISTS aggregated_at;

-- 4. (Opcional) Restauración de políticas RLS heredadas en campaign_events:
-- Descomentar exclusivamente si se desea volver al esquema permisivo anterior:
-- DROP POLICY IF EXISTS "campaign_events_admin_select" ON public.campaign_events;
-- DROP POLICY IF EXISTS "campaign_events_service_role" ON public.campaign_events;
-- CREATE POLICY "campaign_events_select_auth" ON public.campaign_events FOR SELECT TO public USING (auth.role() = 'authenticated');
-- CREATE POLICY "campaign_events_update_auth" ON public.campaign_events FOR UPDATE TO public USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "campaign_events_delete_auth" ON public.campaign_events FOR DELETE TO public USING (auth.role() = 'authenticated');
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_events TO anon, authenticated;

COMMIT;

