-- ============================================================================
-- SIMPLE PROX - FASE 4A: LIMPIEZA CONTROLADA DE LA PRUEBA A
-- ============================================================================
-- Este script realiza la eliminación atómica y segura exclusivamente de los
-- registros técnicos creados durante la Prueba A en Supabase producción.
--
-- Registros a eliminar:
-- 1. Campaña técnica: '00000000-0000-4000-a000-000000000001'
-- 2. Terminal técnica: 'spx_test_terminal_controlled_2026'
-- 3. Comercio técnico: 'spx_test_terminal_controlled_2026'
-- 4. Eventos técnicos: 'spx_test_evt_001' (impression) y 'spx_test_evt_002' (whatsapp_click)
--
-- Garantías de seguridad:
-- - 7 Aserciones de identidad, metadatos y conteos exactos antes de eliminar.
-- - Bloqueo a nivel de fila (FOR UPDATE) para evitar inserciones concurrentes.
-- - Verificación anti-cascada (cero eventos residuales antes de eliminar la campaña).
-- - Rollback total automático ante cualquier error o discrepancia.
-- - CERO impacto en las 21 campañas, 9 comercios y 9383 eventos comerciales.
-- ============================================================================

-- ============================================================================
-- PARTE 1: BLOQUE TRANSACCIONAL ATÓMICO DE LIMPIEZA (Ejecutar primero)
-- ============================================================================

DO $$
DECLARE
  v_events_deleted integer;
  v_terminals_deleted integer;
  v_merchants_deleted integer;
  v_campaigns_deleted integer;
  v_remaining_events integer;
  c_test_campaign_id uuid := '00000000-0000-4000-a000-000000000001'::uuid;
  c_test_terminal_id text := 'spx_test_terminal_controlled_2026';
BEGIN
  -- 1. Timeout de espera de bloqueo: 3 segundos
  PERFORM set_config('lock_timeout', '3s', true);

  -- 2. Bloqueos de fila selectivos sobre los registros técnicos
  PERFORM 1 FROM public.campaigns WHERE id = c_test_campaign_id FOR UPDATE;
  PERFORM 1 FROM public.terminal_identities WHERE installation_id = c_test_terminal_id FOR UPDATE;
  PERFORM 1 FROM public.merchants WHERE id = c_test_terminal_id FOR UPDATE;
  PERFORM 1 FROM public.campaign_events WHERE campaign_id = c_test_campaign_id FOR UPDATE;

  -- 3. Aserciones de seguridad (Verificaciones de identidad y metadatos)
  -- Aserción 1: Evento 1 coincide con metadatos exactos
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_events 
    WHERE event_id = 'spx_test_evt_001' 
      AND event_type = 'impression' 
      AND campaign_id = c_test_campaign_id 
      AND merchant_id = c_test_terminal_id
  ) THEN
    RAISE EXCEPTION 'SEGURIDAD ABORTADA: El evento spx_test_evt_001 no coincide con los metadatos esperados.';
  END IF;

  -- Aserción 2: Evento 2 coincide con metadatos exactos
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_events 
    WHERE event_id = 'spx_test_evt_002' 
      AND event_type = 'whatsapp_click' 
      AND campaign_id = c_test_campaign_id 
      AND merchant_id = c_test_terminal_id
  ) THEN
    RAISE EXCEPTION 'SEGURIDAD ABORTADA: El evento spx_test_evt_002 no coincide con los metadatos esperados.';
  END IF;

  -- Aserción 3: Cantidad exacta de eventos en la campaña técnica == 2
  IF (SELECT count(*) FROM public.campaign_events WHERE campaign_id = c_test_campaign_id) != 2 THEN
    RAISE EXCEPTION 'SEGURIDAD ABORTADA: La campaña técnica posee una cantidad de eventos distinta de 2.';
  END IF;

  -- Aserción 4: Cantidad exacta de eventos del comercio técnico en la campaña técnica == 2
  IF (SELECT count(*) FROM public.campaign_events WHERE campaign_id = c_test_campaign_id AND merchant_id = c_test_terminal_id) != 2 THEN
    RAISE EXCEPTION 'SEGURIDAD ABORTADA: El comercio técnico posee una cantidad de eventos distinta de 2.';
  END IF;

  -- Aserción 5: Metadatos de la terminal técnica coinciden
  IF NOT EXISTS (
    SELECT 1 FROM public.terminal_identities 
    WHERE installation_id = c_test_terminal_id 
      AND commerce_id = c_test_terminal_id 
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'SEGURIDAD ABORTADA: Los metadatos de la terminal técnica no coinciden.';
  END IF;

  -- Aserción 6: Metadatos del comercio técnico coinciden
  IF NOT EXISTS (
    SELECT 1 FROM public.merchants 
    WHERE id = c_test_terminal_id 
      AND name = 'Terminal Controlada Test' 
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'SEGURIDAD ABORTADA: Los metadatos del comercio técnico no coinciden.';
  END IF;

  -- Aserción 7: Metadatos de la campaña técnica coinciden y está pausada
  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE id = c_test_campaign_id 
      AND title = '[TEST-CONTROLADO] Campaña Exclusiva de Prueba E2E' 
      AND status = 'paused' 
      AND category = 'Pruebas'
  ) THEN
    RAISE EXCEPTION 'SEGURIDAD ABORTADA: La campaña técnica no coincide con los metadatos o no está pausada.';
  END IF;

  -- 4. Eliminación de eventos técnicos
  DELETE FROM public.campaign_events 
  WHERE campaign_id = c_test_campaign_id 
    AND merchant_id = c_test_terminal_id 
    AND event_id IN ('spx_test_evt_001', 'spx_test_evt_002');
  GET DIAGNOSTICS v_events_deleted = ROW_COUNT;
  IF v_events_deleted != 2 THEN
    RAISE EXCEPTION 'ROLLBACK: Se esperaba eliminar 2 eventos técnicos, se reportaron %.', v_events_deleted;
  END IF;

  -- 5. Validación anti-cascada: confirmación de cero eventos residuales
  SELECT count(*) INTO v_remaining_events FROM public.campaign_events WHERE campaign_id = c_test_campaign_id;
  IF v_remaining_events != 0 THEN
    RAISE EXCEPTION 'ROLLBACK: Quedan % eventos residuales asociados a la campaña técnica.', v_remaining_events;
  END IF;

  -- 6. Eliminación de terminal técnica
  DELETE FROM public.terminal_identities WHERE installation_id = c_test_terminal_id;
  GET DIAGNOSTICS v_terminals_deleted = ROW_COUNT;
  IF v_terminals_deleted != 1 THEN
    RAISE EXCEPTION 'ROLLBACK: Se esperaba eliminar 1 terminal técnica, se reportaron %.', v_terminals_deleted;
  END IF;

  -- 7. Eliminación de comercio técnico
  DELETE FROM public.merchants WHERE id = c_test_terminal_id;
  GET DIAGNOSTICS v_merchants_deleted = ROW_COUNT;
  IF v_merchants_deleted != 1 THEN
    RAISE EXCEPTION 'ROLLBACK: Se esperaba eliminar 1 comercio técnico, se reportaron %.', v_merchants_deleted;
  END IF;

  -- 8. Eliminación de campaña técnica
  DELETE FROM public.campaigns WHERE id = c_test_campaign_id;
  GET DIAGNOSTICS v_campaigns_deleted = ROW_COUNT;
  IF v_campaigns_deleted != 1 THEN
    RAISE EXCEPTION 'ROLLBACK: Se esperaba eliminar 1 campaña técnica, se reportaron %.', v_campaigns_deleted;
  END IF;

  RAISE NOTICE 'LIMPIEZA EXITOSA: 2 eventos, 1 terminal, 1 comercio y 1 campaña técnica eliminados correctamente.';
END $$;


-- ============================================================================
-- PARTE 2: CONSULTA DE VERIFICACIÓN POSTERIOR (Ejecutar inmediatamente después)
-- ============================================================================

SELECT 
  (SELECT count(*) FROM public.campaigns WHERE id = '00000000-0000-4000-a000-000000000001') AS test_campaign_count,
  (SELECT count(*) FROM public.terminal_identities WHERE installation_id = 'spx_test_terminal_controlled_2026') AS test_terminal_count,
  (SELECT count(*) FROM public.merchants WHERE id = 'spx_test_terminal_controlled_2026') AS test_merchant_count,
  (SELECT count(*) FROM public.campaign_events WHERE campaign_id = '00000000-0000-4000-a000-000000000001') AS test_events_count,
  (SELECT count(*) FROM public.campaigns WHERE id != '00000000-0000-4000-a000-000000000001') AS commercial_campaigns_count,
  (SELECT count(*) FROM public.merchants WHERE id != 'spx_test_terminal_controlled_2026') AS commercial_merchants_count,
  (SELECT count(*) FROM public.campaign_events WHERE campaign_id != '00000000-0000-4000-a000-000000000001') AS commercial_events_count;

-- RESULTADO ESPERADO DE VERIFICACIÓN:
-- test_campaign_count:        0
-- test_terminal_count:        0
-- test_merchant_count:        0
-- test_events_count:          0
-- commercial_campaigns_count: 21 (intactas)
-- commercial_merchants_count: 9  (intactos)
-- commercial_events_count:    9383 (intactos)
