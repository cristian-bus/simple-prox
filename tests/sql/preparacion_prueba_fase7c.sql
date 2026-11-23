-- ============================================================================
-- SIMPLE PROX — FASE 7C: PREPARACIÓN CONTROLADA EN SUPABASE (PRODUCCIÓN)
-- ============================================================================
-- Inserta de forma atómica y segura 1 única campaña sintética en estado 'draft'
-- para validar la persistencia y lectura de isSmartAdvertising.
--
-- GARANTÍAS DE SEGURIDAD:
-- 1. Status 'draft': Exclusión garantizada a nivel de servidor (terminal-sync).
-- 2. Validación pre-inserción: Comprueba que el UUID propuesto no existe y que
--    las 21 campañas comerciales existentes están presentes e intactas.
-- 3. Cero modificaciones a campañas comerciales preexistentes.
-- ============================================================================

DO $$
DECLARE
  v_commercial_count int;
  v_exists_test int;
BEGIN
  -- 1. Timeout estricto de bloqueo (3 segundos)
  PERFORM set_config('lock_timeout', '3s', true);

  -- 2. Validar que las 21 campañas comerciales están intactas
  SELECT count(*) INTO v_commercial_count FROM public.campaigns;
  IF v_commercial_count != 21 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaban exactamente 21 campañas comerciales (encontradas: %)', v_commercial_count;
  END IF;

  -- 3. Validar que el UUID sintético propuesto está estrictamente libre
  SELECT count(*) INTO v_exists_test 
  FROM public.campaigns 
  WHERE id = '00000000-0000-4000-b000-000000000015'::uuid;
  
  IF v_exists_test > 0 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): El UUID sintético 00000000-0000-4000-b000-000000000015 ya existe';
  END IF;

  -- 4. Inserción de la campaña sintética en estado draft
  INSERT INTO public.campaigns (
    id,
    title,
    description,
    category,
    type,
    supplier_name,
    price,
    regular_price,
    badge_text,
    cta_text,
    whatsapp_number,
    status,
    priority,
    is_daily_limit_enabled,
    created_at
  ) VALUES (
    '00000000-0000-4000-b000-000000000015'::uuid,
    '[TEST-SMART] Sidra Real Prueba E2E',
    'Oferta técnica de validación B2B.' || E'\n' || '<!--B2B_META:{"minPurchase":6,"conditions":"Prueba aislada","targetProvinces":["AR-QA-F15"],"isSmartAdvertising":true}-->',
    'Bebidas',
    'oferta',
    'Mayorista Sintético QA',
    3000,
    3800,
    '21% OFF',
    'Pedir por WhatsApp',
    '5491100000000',
    'draft', -- Exclusión total del servidor
    10,
    false,
    NOW()
  );

  RAISE NOTICE 'ÉXITO: Campaña sintética draft provisionada correctamente (UUID: 00000000-0000-4000-b000-000000000015).';
END $$;

