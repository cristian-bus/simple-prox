-- ============================================================================
-- SIMPLE PROX — FASE 15: LIMPIEZA TRANSACCIONAL QUIRÚRGICA SEGURA
-- ============================================================================
-- Elimina atómicamente y sin residuos exclusivamente los registros sintéticos
-- creados durante la prueba controlada en Supabase producción.
--
-- GARANTÍAS DE SEGURIDAD ESTRICTAS:
-- 1. Eliminación de eventos condicionada simultáneamente a:
--    campaign_id, merchant_id y los event_id sintéticos observados (LIKE 'evt-qa-f15-%').
-- 2. Verificación estricta de ROW_COUNT tras cada DELETE.
-- 3. Confirmación de coincidencia de título, nombre y códigos antes de borrar.
-- 4. Verificación de presencia intacta de las 21 campañas comerciales (>= 21).
-- 5. No exige que los contadores de eventos comerciales permanezcan estáticos.
-- 6. Verificación final de CERO residuos sintéticos en todas las tablas.
-- 7. Rollback total automático ante cualquier discrepancia.
-- ============================================================================

DO $$
DECLARE
  v_test_event_ids uuid[];
  v_count_test_events int := 0;
  v_invalid_events int := 0;
  v_del_events int := 0;
  v_found_campaigns int := 0;
  v_del_campaigns int := 0;
  v_found_terminals int := 0;
  v_del_terminals int := 0;
  v_found_merchants int := 0;
  v_del_merchants int := 0;
  v_remaining_campaign_events int := 0;
  v_remaining_test_campaigns int := 0;
  v_remaining_test_terminals int := 0;
  v_remaining_test_merchants int := 0;
  v_commercial_campaigns_count int := 0;
BEGIN
  -- 1. Timeout estricto de bloqueo (3 segundos)
  PERFORM set_config('lock_timeout', '3s', true);

  -- 2. Confirmar que campaña, terminal y comercio corresponden exactamente a las entidades sintéticas
  SELECT count(*) INTO v_found_campaigns 
  FROM public.campaigns 
  WHERE id = '00000000-0000-4000-b000-000000000014'::uuid 
    AND title = '[TEST-F14] Promoción Sintética Controlada Fase 14'
    AND status = 'draft';

  SELECT count(*) INTO v_found_terminals 
  FROM public.terminal_identities 
  WHERE installation_id = 'spx-test-fase14-terminal' 
    AND commerce_id = 'COMM-TEST-QA-FASE14';

  SELECT count(*) INTO v_found_merchants 
  FROM public.merchants 
  WHERE id = 'spx-test-fase14-terminal' 
    AND name = 'Kiosco QA Pruebas Fase 14'
    AND province_code = 'AR-QA-F14';

  IF v_found_campaigns != 1 OR v_found_terminals != 1 OR v_found_merchants != 1 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Campaña, terminal o comercio sintéticos no coinciden con los registros esperados (campañas: %, terminales: %, comercios: %)',
      v_found_campaigns, v_found_terminals, v_found_merchants;
  END IF;

  -- 3. Bloqueo exclusivo a nivel de fila (FOR UPDATE) sobre los registros sintéticos
  PERFORM id FROM public.campaigns 
  WHERE id = '00000000-0000-4000-b000-000000000014'::uuid 
  FOR UPDATE;

  PERFORM installation_id FROM public.terminal_identities 
  WHERE installation_id = 'spx-test-fase14-terminal' 
  FOR UPDATE;

  PERFORM id FROM public.merchants 
  WHERE id = 'spx-test-fase14-terminal' 
  FOR UPDATE;

  -- 4. Validar que no existan eventos espurios o ajenos a la prueba asociados a la campaña
  SELECT count(*) INTO v_invalid_events
  FROM public.campaign_events
  WHERE campaign_id = '00000000-0000-4000-b000-000000000014'::uuid
    AND (merchant_id != 'spx-test-fase14-terminal' OR event_id NOT LIKE 'evt-qa-f15-%');

  IF v_invalid_events > 0 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se detectaron % eventos sospechosos no atribuibles al test en la campaña sintética', v_invalid_events;
  END IF;

  -- 5. Capturar y bloquear dinámicamente los eventos de prueba observados
  SELECT array_agg(id), count(*) INTO v_test_event_ids, v_count_test_events
  FROM public.campaign_events
  WHERE campaign_id = '00000000-0000-4000-b000-000000000014'::uuid
    AND merchant_id = 'spx-test-fase14-terminal'
    AND event_id LIKE 'evt-qa-f15-%';

  IF v_count_test_events > 0 THEN
    PERFORM id FROM public.campaign_events
    WHERE id = ANY(v_test_event_ids)
    FOR UPDATE;
  END IF;

  -- 6. Salvaguarda comercial: validar que las 21 campañas comerciales siguen presentes
  SELECT count(*) INTO v_commercial_campaigns_count
  FROM public.campaigns
  WHERE id != '00000000-0000-4000-b000-000000000014'::uuid;

  IF v_commercial_campaigns_count < 21 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Discrepancia en catálogo comercial (se esperaban >= 21, encontradas: %)', v_commercial_campaigns_count;
  END IF;

  -- 7. Eliminación de eventos sintéticos verificando ROW_COUNT
  IF v_count_test_events > 0 THEN
    DELETE FROM public.campaign_events
    WHERE id = ANY(v_test_event_ids)
      AND campaign_id = '00000000-0000-4000-b000-000000000014'::uuid
      AND merchant_id = 'spx-test-fase14-terminal'
      AND event_id LIKE 'evt-qa-f15-%';
    GET DIAGNOSTICS v_del_events = ROW_COUNT;

    IF v_del_events != v_count_test_events THEN
      RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Discrepancia en ROW_COUNT al eliminar eventos (esperados: %, eliminados: %)',
        v_count_test_events, v_del_events;
    END IF;
  END IF;

  -- 8. Barrera anti-cascada: validar cero eventos residuales en la campaña sintética
  SELECT count(*) INTO v_remaining_campaign_events
  FROM public.campaign_events
  WHERE campaign_id = '00000000-0000-4000-b000-000000000014'::uuid;

  IF v_remaining_campaign_events > 0 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Quedaron % eventos residuales asociados a la campaña', v_remaining_campaign_events;
  END IF;

  -- 9. Eliminación de la campaña sintética verificando ROW_COUNT
  DELETE FROM public.campaigns
  WHERE id = '00000000-0000-4000-b000-000000000014'::uuid
    AND title = '[TEST-F14] Promoción Sintética Controlada Fase 14'
    AND status = 'draft';
  GET DIAGNOSTICS v_del_campaigns = ROW_COUNT;

  IF v_del_campaigns != 1 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): ROW_COUNT erróneo al eliminar campaña (esperado: 1, obtenido: %)', v_del_campaigns;
  END IF;

  -- 10. Eliminación de la terminal técnica verificando ROW_COUNT
  DELETE FROM public.terminal_identities
  WHERE installation_id = 'spx-test-fase14-terminal'
    AND commerce_id = 'COMM-TEST-QA-FASE14';
  GET DIAGNOSTICS v_del_terminals = ROW_COUNT;

  IF v_del_terminals != 1 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): ROW_COUNT erróneo al eliminar terminal (esperado: 1, obtenido: %)', v_del_terminals;
  END IF;

  -- 11. Eliminación del comercio técnico verificando ROW_COUNT
  DELETE FROM public.merchants
  WHERE id = 'spx-test-fase14-terminal'
    AND name = 'Kiosco QA Pruebas Fase 14'
    AND province_code = 'AR-QA-F14';
  GET DIAGNOSTICS v_del_merchants = ROW_COUNT;

  IF v_del_merchants != 1 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): ROW_COUNT erróneo al eliminar comercio (esperado: 1, obtenido: %)', v_del_merchants;
  END IF;

  -- 12. Confirmación final de CERO residuos sintéticos en todo el esquema
  SELECT count(*) INTO v_remaining_test_campaigns FROM public.campaigns WHERE id = '00000000-0000-4000-b000-000000000014'::uuid;
  SELECT count(*) INTO v_remaining_test_terminals FROM public.terminal_identities WHERE installation_id = 'spx-test-fase14-terminal';
  SELECT count(*) INTO v_remaining_test_merchants FROM public.merchants WHERE id = 'spx-test-fase14-terminal';

  IF v_remaining_test_campaigns != 0 OR v_remaining_test_terminals != 0 OR v_remaining_test_merchants != 0 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Quedaron registros técnicos residuales post-limpieza';
  END IF;

  RAISE NOTICE 'LIMPIEZA TRANSACCIONAL FASE 15 COMPLETADA EXITOSAMENTE: % eventos, 1 campaña, 1 terminal y 1 comercio eliminados. Integridad comercial 100%% preservada.', v_del_events;
END $$;
