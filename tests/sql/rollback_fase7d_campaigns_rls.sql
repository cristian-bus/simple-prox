-- ==============================================================================
-- SIMPLE PROX — ROLLBACK DE EMERGENCIA: POLÍTICA SELECT EN CAMPAIGNS
-- ==============================================================================
-- ADVERTENCIA CRÍTICA DE SEGURIDAD:
-- La ejecución de este script restituye la política permisiva abierta 'USING (true)'.
-- Esto provocará nuevamente la EXPOSICIÓN PÚBLICA de campañas pausadas y borradores
-- ante cualquier cliente que utilice la clave anónima (anon key).
-- 
-- REGLA OPERATIVA:
-- Este rollback NO debe ejecutarse automáticamente.
-- Utilizar única y exclusivamente como medida de contingencia si se detecta
-- incompatibilidad imprevista no solucionable de forma inmediata.
-- ==============================================================================

BEGIN;

-- 1. Timeout estricto de bloqueo (3 segundos)
SET LOCAL lock_timeout = '3s';

-- 2. Eliminar las políticas seguras
DROP POLICY IF EXISTS "campaigns_select_active" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_select_admin" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_select_public" ON public.campaigns;

-- 3. Restablecer la política previa abierta (PERMISSIVE)
CREATE POLICY "campaigns_select_public" ON public.campaigns
  FOR SELECT TO public
  USING (true);

COMMIT;

