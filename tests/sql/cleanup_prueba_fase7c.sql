-- ============================================================================
-- SIMPLE PROX — FASE 7C: LIMPIEZA TRANSACCIONAL DE EJECUCIÓN ÚNICA (SUPABASE)
-- ============================================================================
-- Elimina exclusivamente la campaña sintética creada para la prueba E2E.
--
-- GARANTÍAS DE SEGURIDAD:
-- 1. Ejecución estricta única: exige eliminar exactamente 1 fila (falla con ROLLBACK si v_deleted != 1).
-- 2. Condicionada al UUID exacto, título exacto y estado draft.
-- 3. Verificación de cero residuos sintéticos tras la eliminación.
-- 4. Verificación de que las 21 campañas comerciales protegidas están intactas (exactamente 21).
-- ============================================================================

DO $$
DECLARE
  v_deleted int := 0;
  v_residual_test int := 0;
  v_commercial_remaining int := 0;
BEGIN
  -- 1. Timeout estricto de bloqueo (3 segundos)
  PERFORM set_config('lock_timeout', '3s', true);

  -- 2. Eliminación condicionada a triple coincidencia exacta
  DELETE FROM public.campaigns
  WHERE id = '00000000-0000-4000-b000-000000000015'::uuid
    AND title = '[TEST-SMART] Sidra Real Prueba E2E'
    AND status = 'draft';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Validación estricta: debe eliminarse exactamente 1 fila
  IF v_deleted != 1 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaba eliminar exactamente 1 fila sintética pero se eliminaron % (verifique id, título y status draft)', v_deleted;
  END IF;

  -- 3. Confirmación de CERO residuos sintéticos en la tabla
  SELECT count(*) INTO v_residual_test 
  FROM public.campaigns 
  WHERE id = '00000000-0000-4000-b000-000000000015'::uuid;

  IF v_residual_test != 0 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Persisten registros sintéticos tras el borrado';
  END IF;

  -- 4. Confirmación de integridad de las 21 campañas comerciales protegidas
  SELECT count(*) INTO v_commercial_remaining FROM public.campaigns;
  IF v_commercial_remaining != 21 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se detectó alteración en las campañas comerciales (restantes: %, esperadas: 21)', v_commercial_remaining;
  END IF;

  RAISE NOTICE 'Limpieza exitosa. Registros sintéticos eliminados: %. Campañas comerciales conservadas: %.', v_deleted, v_commercial_remaining;
END $$;

