-- ============================================================================
-- SIMPLE PROX - FASE 4B: LIMPIEZA CONTROLADA DE LA PRUEBA B (ETAPA A)
-- ============================================================================
-- Este script realiza la eliminación atómica y segura exclusivamente de los
-- 6 registros técnicos creados durante la Prueba B en Supabase producción.
--
-- Registros a eliminar:
-- 1. Tres eventos técnicos:
--    - 'b4c64b26-c33a-401a-b7bd-8a6ae5c44074' (impression)
--    - '7125c644-6402-40d3-8b67-ea79cfa9dbd2' (offer_open)
--    - 'a460d3fb-4e24-4ab8-b751-0920fdb75a2c' (whatsapp_click)
-- 2. Una campaña técnica: '00000000-0000-4000-b000-000000000001'
-- 3. Una terminal técnica: 'spx_test_autoenroll_2026'
-- 4. Un comercio técnico: 'spx_test_autoenroll_2026'
--
-- Garantías de seguridad:
-- - Timeout de lock de 3s para evitar esperas indefinidas.
-- - Captura de baseline comercial dinámico.
-- - Verificación explícita de los 9 comercios comerciales por ID.
-- - Bloqueo a nivel de fila (FOR UPDATE) sobre los registros técnicos.
-- - Verificación anti-cascada (cero eventos residuales antes de eliminar la campaña).
-- - Rollback total automático ante cualquier error o discrepancia.
-- - CERO impacto en las campañas, comercios y eventos comerciales.
-- ============================================================================

-- ============================================================================
-- PARTE 1: BLOQUE TRANSACCIONAL ATÓMICO DE LIMPIEZA
-- ============================================================================

DO $$
DECLARE
  v_pre_commercial_events INT;
  v_pre_commercial_campaigns INT;
  v_pre_commercial_merchants INT;
  v_commercial_merchants_matched INT;

  v_pre_test_events INT;
  v_pre_test_campaigns INT;
  v_pre_test_terminals INT;
  v_pre_test_merchants INT;

  v_del_events INT;
  v_remaining_campaign_events INT;
  v_del_campaigns INT;
  v_del_terminals INT;
  v_del_merchants INT;

  v_post_commercial_events INT;
  v_post_commercial_campaigns INT;
  v_post_commercial_merchants INT;
  v_remaining_test_events INT;
  v_remaining_test_campaigns INT;
  v_remaining_test_terminals INT;
  v_remaining_test_merchants INT;
BEGIN
  -- 1. Timeout de espera de bloqueo: 3 segundos
  PERFORM set_config('lock_timeout', '3s', true);

  -- 2. Bloqueo de filas exclusivas a nivel transacción (FOR UPDATE)
  PERFORM id FROM public.campaigns 
  WHERE id = '00000000-0000-4000-b000-000000000001'::uuid 
  FOR UPDATE;

  PERFORM installation_id FROM public.terminal_identities 
  WHERE installation_id = 'spx_test_autoenroll_2026' 
  FOR UPDATE;

  PERFORM id FROM public.merchants 
  WHERE id = 'spx_test_autoenroll_2026' 
  FOR UPDATE;

  PERFORM id FROM public.campaign_events 
  WHERE id IN (
    'b4c64b26-c33a-401a-b7bd-8a6ae5c44074'::uuid,
    '7125c644-6402-40d3-8b67-ea79cfa9dbd2'::uuid,
    'a460d3fb-4e24-4ab8-b751-0920fdb75a2c'::uuid
  ) 
  FOR UPDATE;

  -- 3. Captura de baseline comercial
  SELECT COUNT(*) INTO v_pre_commercial_events 
  FROM public.campaign_events 
  WHERE campaign_id != '00000000-0000-4000-b000-000000000001'::uuid;

  SELECT COUNT(*) INTO v_pre_commercial_campaigns 
  FROM public.campaigns 
  WHERE id != '00000000-0000-4000-b000-000000000001'::uuid;

  SELECT COUNT(*) INTO v_pre_commercial_merchants 
  FROM public.merchants 
  WHERE id != 'spx_test_autoenroll_2026';

  -- Validar presencia de los 9 comercios comerciales específicos por su ID primario
  SELECT COUNT(*) INTO v_commercial_merchants_matched 
  FROM public.merchants 
  WHERE id IN (
    '58a8f3df-6d23-4e4a-ba8b-c750b0d532e2',
    '7e3bbe1d-ab7a-4275-b110-8f8701b075d5',
    '83b2866d-6523-44ba-a248-e5a0cac93f44',
    '874c2ce1-d24e-42ad-9aa1-a72f384f4522',
    'e89c48ac-ee4c-4053-8e8d-201ebf5f75c3',
    'fc74cf1e-5e32-4a12-a833-91565136f089',
    'LTMEI6YT',
    'PC-TEST-DIAGNOSTIC',
    'WG6KX8UI'
  );

  IF v_commercial_merchants_matched != 9 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): No se encontraron los 9 comercios comerciales específicos por ID';
  END IF;

  -- 4. Validación estricta de elementos técnicos
  SELECT COUNT(*) INTO v_pre_test_events 
  FROM public.campaign_events 
  WHERE id IN (
    'b4c64b26-c33a-401a-b7bd-8a6ae5c44074'::uuid,
    '7125c644-6402-40d3-8b67-ea79cfa9dbd2'::uuid,
    'a460d3fb-4e24-4ab8-b751-0920fdb75a2c'::uuid
  )
  AND campaign_id = '00000000-0000-4000-b000-000000000001'::uuid
  AND merchant_id = 'spx_test_autoenroll_2026';

  SELECT COUNT(*) INTO v_pre_test_campaigns 
  FROM public.campaigns 
  WHERE id = '00000000-0000-4000-b000-000000000001'::uuid
    AND title = '[TEST-B] Campaña Controlada B2B E2E'
    AND category = 'Pruebas';

  SELECT COUNT(*) INTO v_pre_test_terminals 
  FROM public.terminal_identities 
  WHERE installation_id = 'spx_test_autoenroll_2026';

  SELECT COUNT(*) INTO v_pre_test_merchants 
  FROM public.merchants 
  WHERE id = 'spx_test_autoenroll_2026'
    AND name = 'Kiosco Test AutoEnroll';

  IF v_pre_test_events != 3 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaban exactamente 3 eventos técnicos (encontrados: %)', v_pre_test_events;
  END IF;

  IF v_pre_test_campaigns != 1 OR v_pre_test_terminals != 1 OR v_pre_test_merchants != 1 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Discrepancia en registros de campaña, terminal o comercio técnico';
  END IF;

  -- 5. Eliminación de eventos técnicos
  DELETE FROM public.campaign_events
  WHERE id IN (
    'b4c64b26-c33a-401a-b7bd-8a6ae5c44074'::uuid,
    '7125c644-6402-40d3-8b67-ea79cfa9dbd2'::uuid,
    'a460d3fb-4e24-4ab8-b751-0920fdb75a2c'::uuid
  )
  AND campaign_id = '00000000-0000-4000-b000-000000000001'::uuid
  AND merchant_id = 'spx_test_autoenroll_2026';
  GET DIAGNOSTICS v_del_events = ROW_COUNT;

  IF v_del_events != 3 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaba eliminar exactamente 3 eventos, se eliminaron %', v_del_events;
  END IF;

  -- 6. Barrera anti-cascada: cero eventos residuales para la campaña
  SELECT COUNT(*) INTO v_remaining_campaign_events 
  FROM public.campaign_events 
  WHERE campaign_id = '00000000-0000-4000-b000-000000000001'::uuid;

  IF v_remaining_campaign_events > 0 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Existen % eventos adicionales asociados a la campaña. Se aborta la eliminación de campaigns.', v_remaining_campaign_events;
  END IF;

  -- 7. Eliminación de campaña técnica
  DELETE FROM public.campaigns
  WHERE id = '00000000-0000-4000-b000-000000000001'::uuid
    AND title = '[TEST-B] Campaña Controlada B2B E2E'
    AND category = 'Pruebas';
  GET DIAGNOSTICS v_del_campaigns = ROW_COUNT;

  IF v_del_campaigns != 1 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaba eliminar 1 campaña y se eliminaron %', v_del_campaigns;
  END IF;

  -- 8. Eliminación de terminal técnica
  DELETE FROM public.terminal_identities
  WHERE installation_id = 'spx_test_autoenroll_2026';
  GET DIAGNOSTICS v_del_terminals = ROW_COUNT;

  IF v_del_terminals != 1 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaba eliminar 1 terminal y se eliminaron %', v_del_terminals;
  END IF;

  -- 9. Eliminación de comercio técnico
  DELETE FROM public.merchants
  WHERE id = 'spx_test_autoenroll_2026'
    AND name = 'Kiosco Test AutoEnroll';
  GET DIAGNOSTICS v_del_merchants = ROW_COUNT;

  IF v_del_merchants != 1 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaba eliminar 1 comercio y se eliminaron %', v_del_merchants;
  END IF;

  -- 10. Validación dinámica post-eliminación
  SELECT COUNT(*) INTO v_post_commercial_events 
  FROM public.campaign_events 
  WHERE campaign_id != '00000000-0000-4000-b000-000000000001'::uuid;

  SELECT COUNT(*) INTO v_post_commercial_campaigns 
  FROM public.campaigns 
  WHERE id != '00000000-0000-4000-b000-000000000001'::uuid;

  SELECT COUNT(*) INTO v_post_commercial_merchants 
  FROM public.merchants 
  WHERE id != 'spx_test_autoenroll_2026';

  IF v_post_commercial_events != v_pre_commercial_events THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Discrepancia en eventos comerciales (antes: %, después: %)', v_pre_commercial_events, v_post_commercial_events;
  END IF;

  IF v_post_commercial_campaigns != v_pre_commercial_campaigns THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Discrepancia en campañas comerciales (antes: %, después: %)', v_pre_commercial_campaigns, v_post_commercial_campaigns;
  END IF;

  IF v_post_commercial_merchants != v_pre_commercial_merchants THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Discrepancia en comercios comerciales (antes: %, después: %)', v_pre_commercial_merchants, v_post_commercial_merchants;
  END IF;

  -- 11. Validación de ausencia absoluta de residuos técnicos
  SELECT COUNT(*) INTO v_remaining_test_events FROM public.campaign_events WHERE campaign_id = '00000000-0000-4000-b000-000000000001'::uuid OR merchant_id = 'spx_test_autoenroll_2026';
  SELECT COUNT(*) INTO v_remaining_test_campaigns FROM public.campaigns WHERE id = '00000000-0000-4000-b000-000000000001'::uuid;
  SELECT COUNT(*) INTO v_remaining_test_terminals FROM public.terminal_identities WHERE installation_id = 'spx_test_autoenroll_2026';
  SELECT COUNT(*) INTO v_remaining_test_merchants FROM public.merchants WHERE id = 'spx_test_autoenroll_2026';

  IF v_remaining_test_events != 0 OR v_remaining_test_campaigns != 0 OR v_remaining_test_terminals != 0 OR v_remaining_test_merchants != 0 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Quedaron registros técnicos residuales';
  END IF;

  RAISE NOTICE 'LIMPIEZA TRANSACCIONAL EXITOSA: 3 eventos, 1 campaña, 1 terminal y 1 comercio eliminados con éxito. Integridad comercial 100%% preservada.';
END $$;
