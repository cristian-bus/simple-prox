-- ============================================================================
-- SIMPLE PROX — FASE 15: PREPARACIÓN CONTROLADA EN SUPABASE (PASO 2)
-- ============================================================================
-- Este script realiza la provisión atómica y segura de la campaña sintética draft
-- y de la identidad temporal de la terminal de prueba.
--
-- GARANTÍAS DE AISLAMIENTO:
-- 1. La campaña se crea en estado 'draft', lo que activa la exclusión estricta
--    en la Edge Function (eq('status', 'active')) y en clientes legacy.
-- 2. No se modifica ninguna de las 21 campañas comerciales existentes.
-- 3. La terminal se registra con el hash SHA-256 de 256 bits generado en memoria.
-- ============================================================================

DO $$
DECLARE
  v_commercial_count int;
  v_exists_campaign int;
  v_exists_terminal int;
BEGIN
  -- 1. Timeout estricto de bloqueo (3 segundos)
  PERFORM set_config('lock_timeout', '3s', true);

  -- 2. Validar que las 21 campañas comerciales están presentes e intactas
  SELECT count(*) INTO v_commercial_count FROM public.campaigns;
  IF v_commercial_count != 21 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaban exactamente 21 campañas comerciales (encontradas: %)', v_commercial_count;
  END IF;

  -- 3. Validar que los identificadores sintéticos no existen previamente
  SELECT count(*) INTO v_exists_campaign FROM public.campaigns WHERE id = '00000000-0000-4000-b000-000000000014'::uuid;
  SELECT count(*) INTO v_exists_terminal FROM public.terminal_identities WHERE installation_id = 'spx-test-fase14-terminal';
  
  IF v_exists_campaign > 0 OR v_exists_terminal > 0 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): El identificador sintético ya existe en el sistema';
  END IF;

  -- 4. Crear campaña sintética con status = 'draft'
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
    '00000000-0000-4000-b000-000000000014'::uuid,
    '[TEST-F14] Promoción Sintética Controlada Fase 14',
    '<!--B2B_META:{"minPurchase":1,"minPurchaseType":"$","conditions":"Validación técnica aislada de métricas Fase 15","startDate":"2026-10-01","endDate":"2026-12-31","targetProvinces":["AR-QA-F14"],"targetCities":["QA-CITY-F14"]}-->',
    'Pruebas QA',
    'oferta',
    'Mayorista Sintético QA',
    100.00,
    150.00,
    'TEST',
    'Pedir WhatsApp Test',
    '5492664000000',
    'draft', -- BARRERA DE AISLAMIENTO: SERVIDOR EXCLUYE Y NO ENVÍA A TERMINALES COMERCIALES
    999,
    false,
    now()
  );

  -- 5. Registrar identidad técnica en terminal_identities
  INSERT INTO public.terminal_identities (
    installation_id,
    token_hash,
    commerce_id,
    status,
    created_at
  ) VALUES (
    'spx-test-fase14-terminal',
    '2c54c524f3da6c8e7f5fd9e73c0ddb10e46c740883484b5c3fe40794447fcd8f',
    'COMM-TEST-QA-FASE14',
    'active',
    now()
  );

  -- 6. Registrar comercio técnico en merchants
  INSERT INTO public.merchants (
    id,
    installation_id,
    name,
    plan,
    province_code,
    province_name,
    city_code,
    city_name,
    status,
    last_active
  ) VALUES (
    'spx-test-fase14-terminal',
    'spx-test-fase14-terminal',
    'Kiosco QA Pruebas Fase 14',
    'Básico',
    'AR-QA-F14',
    'Provincia Sintetica QA',
    'QA-CITY-F14',
    'Ciudad QA',
    'active',
    now()
  );

  RAISE NOTICE 'PROVISIÓN FASE 15 EXITOSA: Campaña draft 00000000-0000-4000-b000-000000000014 y terminal spx-test-fase14-terminal creadas con éxito.';
END $$;

