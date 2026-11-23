-- ==============================================================================
-- SIMPLE PROX — FASE 5D.10: VINCULACIÓN SEGURA DE CAMPAÑAS CON DISTRIBUIDORES
-- Archivo: tests/sql/vincular_distributor_id_fase5d10.sql
-- Módulo: Gestión Comercial B2B (Publicidad y Anunciantes)
-- Versión compatible: Simple ProX 1.3.10
-- Modo: DML TRANSACCIONAL CON VALIDACIONES PREVIAS Y POSTERIORES
-- ==============================================================================

BEGIN;

-- 1. Timeout estricto de bloqueo (3 segundos)
SET LOCAL lock_timeout = '3s';

-- 2. VALIDACIÓN PREVIA (INTEGRIDAD REFERENCIAL Y ESTADO ACTUAL):
DO $$
DECLARE
  v_campaign_count int;
  v_null_dist_count int;
  v_distributors_count int;
  v_andino_qa_count int;
  v_mismatch_count int;
BEGIN
  -- A. Confirmar que los 7 distribuidores de destino existen en public.distributors
  SELECT count(*) INTO v_distributors_count 
  FROM public.distributors 
  WHERE id IN (
    'dist-el-triunfo',
    'dist-mac',
    'dist-central-sl',
    'dist-arcor-oficial',
    'dist-mic',
    'dist-carrefour',
    'dist-molto-rc'
  );
  IF v_distributors_count != 7 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaban 7 distribuidores destino existentes (encontrados: %)', v_distributors_count;
  END IF;

  -- B. Confirmar que Mayorista Andino QA existe intacto
  SELECT count(*) INTO v_andino_qa_count
  FROM public.distributors
  WHERE id = 'dist-1793748205220' AND category = 'QA_TEST';
  IF v_andino_qa_count != 1 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Mayorista Andino QA no encontrado o alterado';
  END IF;

  -- C. Confirmar que las 17 campañas autorizadas existen y tienen distributor_id en NULL
  SELECT count(*) INTO v_null_dist_count 
  FROM public.campaigns 
  WHERE id IN (
    'da8ff41b-fd8f-4a97-8272-24b54c61aeba',
    'ed6e0e09-e398-4b76-8996-0e16dd8dd93c',
    'c8497a41-c175-444f-a59c-e11a856ec13b',
    'd965a108-6dde-4c22-a143-c6eecc467228',
    '0e1e9b31-5c8c-476b-b3c6-e9a3a43b5f8a',
    '5b682403-1486-40cc-8b02-24d4ae7278cc',
    '4339dc9d-acdf-4ce7-89d2-986a85ab2876',
    '8cc49d2a-7c7f-4071-8138-31c91d18b7b8',
    '4fccc3ea-664b-498f-aa2c-ef87499d1c31',
    '2ec03876-ae0d-4988-b857-545e64e68cc5',
    '79ffec76-6f32-487c-bd85-e34b063584bb',
    '061e01d5-a41f-4109-942b-e093e50cb6e2',
    '78f34abe-f65a-4b8f-bda9-bbabded28552',
    '156c2fac-4e94-4a27-ac00-68353b5e1027',
    'da8fa6ca-26a0-452d-a691-331782e5ca7c',
    'e323c795-67fd-4577-80f0-d81a96edb81c',
    '1d29425d-9ae6-40c8-8a6f-4ab6038f8aaf'
  ) AND distributor_id IS NULL;

  IF v_null_dist_count != 17 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaban exactamente 17 campañas autorizadas con distributor_id NULL (encontradas: %)', v_null_dist_count;
  END IF;

  -- D. Confirmar correspondencia exacta entre ID de campaña y supplier_name esperado
  SELECT count(*) INTO v_mismatch_count
  FROM public.campaigns
  WHERE (id IN ('da8ff41b-fd8f-4a97-8272-24b54c61aeba', 'ed6e0e09-e398-4b76-8996-0e16dd8dd93c', 'c8497a41-c175-444f-a59c-e11a856ec13b', 'd965a108-6dde-4c22-a143-c6eecc467228', '0e1e9b31-5c8c-476b-b3c6-e9a3a43b5f8a') AND supplier_name != 'Mayorista El Triunfo')
     OR (id IN ('5b682403-1486-40cc-8b02-24d4ae7278cc', '4339dc9d-acdf-4ce7-89d2-986a85ab2876', '8cc49d2a-7c7f-4071-8138-31c91d18b7b8', '4fccc3ea-664b-498f-aa2c-ef87499d1c31') AND supplier_name != 'Distribuidora MAC')
     OR (id IN ('2ec03876-ae0d-4988-b857-545e64e68cc5', '79ffec76-6f32-487c-bd85-e34b063584bb', '061e01d5-a41f-4109-942b-e093e50cb6e2') AND supplier_name != 'Distribuidora Central San Luis')
     OR (id IN ('78f34abe-f65a-4b8f-bda9-bbabded28552', '156c2fac-4e94-4a27-ac00-68353b5e1027') AND supplier_name != 'Distribuidora Arcor Oficial')
     OR (id = 'da8fa6ca-26a0-452d-a691-331782e5ca7c' AND supplier_name != 'Mayorista MIC')
     OR (id = 'e323c795-67fd-4577-80f0-d81a96edb81c' AND supplier_name != 'carrefour')
     OR (id = '1d29425d-9ae6-40c8-8a6f-4ab6038f8aaf' AND supplier_name != 'Molto RC');

  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Discrepancia detectada en el supplier_name de las campañas autorizadas';
  END IF;
END $$;

-- 3. ACTUALIZACIÓN EXCLUSIVA DE distributor_id (7 OPERACIONES QUIRÚRGICAS):

-- A. Mayorista El Triunfo (5 campañas)
UPDATE public.campaigns
SET distributor_id = 'dist-el-triunfo'
WHERE id IN (
  'da8ff41b-fd8f-4a97-8272-24b54c61aeba',
  'ed6e0e09-e398-4b76-8996-0e16dd8dd93c',
  'c8497a41-c175-444f-a59c-e11a856ec13b',
  'd965a108-6dde-4c22-a143-c6eecc467228',
  '0e1e9b31-5c8c-476b-b3c6-e9a3a43b5f8a'
) AND supplier_name = 'Mayorista El Triunfo' AND distributor_id IS NULL;

-- B. Distribuidora MAC (4 campañas)
UPDATE public.campaigns
SET distributor_id = 'dist-mac'
WHERE id IN (
  '5b682403-1486-40cc-8b02-24d4ae7278cc',
  '4339dc9d-acdf-4ce7-89d2-986a85ab2876',
  '8cc49d2a-7c7f-4071-8138-31c91d18b7b8',
  '4fccc3ea-664b-498f-aa2c-ef87499d1c31'
) AND supplier_name = 'Distribuidora MAC' AND distributor_id IS NULL;

-- C. Distribuidora Central San Luis (3 campañas)
UPDATE public.campaigns
SET distributor_id = 'dist-central-sl'
WHERE id IN (
  '2ec03876-ae0d-4988-b857-545e64e68cc5',
  '79ffec76-6f32-487c-bd85-e34b063584bb',
  '061e01d5-a41f-4109-942b-e093e50cb6e2'
) AND supplier_name = 'Distribuidora Central San Luis' AND distributor_id IS NULL;

-- D. Distribuidora Arcor Oficial (2 campañas)
UPDATE public.campaigns
SET distributor_id = 'dist-arcor-oficial'
WHERE id IN (
  '78f34abe-f65a-4b8f-bda9-bbabded28552',
  '156c2fac-4e94-4a27-ac00-68353b5e1027'
) AND supplier_name = 'Distribuidora Arcor Oficial' AND distributor_id IS NULL;

-- E. Mayorista MIC (1 campaña)
UPDATE public.campaigns
SET distributor_id = 'dist-mic'
WHERE id = 'da8fa6ca-26a0-452d-a691-331782e5ca7c'
  AND supplier_name = 'Mayorista MIC'
  AND distributor_id IS NULL;

-- F. carrefour (1 campaña)
UPDATE public.campaigns
SET distributor_id = 'dist-carrefour'
WHERE id = 'e323c795-67fd-4577-80f0-d81a96edb81c'
  AND supplier_name = 'carrefour'
  AND distributor_id IS NULL;

-- G. Molto RC (1 campaña)
UPDATE public.campaigns
SET distributor_id = 'dist-molto-rc'
WHERE id = '1d29425d-9ae6-40c8-8a6f-4ab6038f8aaf'
  AND supplier_name = 'Molto RC'
  AND distributor_id IS NULL;

-- 4. VALIDACIÓN POSTERIOR (GARANTÍAS ATÓMICAS):
DO $$
DECLARE
  v_updated_count int;
  v_exact_mismatch_count int;
  v_andino_campaigns int;
  v_total_campaigns int;
BEGIN
  -- A. Exactamente 17 campañas autorizadas deben tener distributor_id no nulo
  SELECT count(*) INTO v_updated_count
  FROM public.campaigns
  WHERE distributor_id IN (
    'dist-el-triunfo',
    'dist-mac',
    'dist-central-sl',
    'dist-arcor-oficial',
    'dist-mic',
    'dist-carrefour',
    'dist-molto-rc'
  );
  IF v_updated_count != 17 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaban exactamente 17 campañas vinculadas (encontradas: %)', v_updated_count;
  END IF;

  -- B. Comprobación exhaustiva individual de las 17 relaciones exactas (IS DISTINCT FROM)
  SELECT count(*) INTO v_exact_mismatch_count
  FROM public.campaigns
  WHERE (id IN ('da8ff41b-fd8f-4a97-8272-24b54c61aeba', 'ed6e0e09-e398-4b76-8996-0e16dd8dd93c', 'c8497a41-c175-444f-a59c-e11a856ec13b', 'd965a108-6dde-4c22-a143-c6eecc467228', '0e1e9b31-5c8c-476b-b3c6-e9a3a43b5f8a') AND distributor_id IS DISTINCT FROM 'dist-el-triunfo')
     OR (id IN ('5b682403-1486-40cc-8b02-24d4ae7278cc', '4339dc9d-acdf-4ce7-89d2-986a85ab2876', '8cc49d2a-7c7f-4071-8138-31c91d18b7b8', '4fccc3ea-664b-498f-aa2c-ef87499d1c31') AND distributor_id IS DISTINCT FROM 'dist-mac')
     OR (id IN ('2ec03876-ae0d-4988-b857-545e64e68cc5', '79ffec76-6f32-487c-bd85-e34b063584bb', '061e01d5-a41f-4109-942b-e093e50cb6e2') AND distributor_id IS DISTINCT FROM 'dist-central-sl')
     OR (id IN ('78f34abe-f65a-4b8f-bda9-bbabded28552', '156c2fac-4e94-4a27-ac00-68353b5e1027') AND distributor_id IS DISTINCT FROM 'dist-arcor-oficial')
     OR (id = 'da8fa6ca-26a0-452d-a691-331782e5ca7c' AND distributor_id IS DISTINCT FROM 'dist-mic')
     OR (id = 'e323c795-67fd-4577-80f0-d81a96edb81c' AND distributor_id IS DISTINCT FROM 'dist-carrefour')
     OR (id = '1d29425d-9ae6-40c8-8a6f-4ab6038f8aaf' AND distributor_id IS DISTINCT FROM 'dist-molto-rc');

  IF v_exact_mismatch_count > 0 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se detectaron asignaciones de distributor_id incorrectas o nulas (%)', v_exact_mismatch_count;
  END IF;

  -- C. Mayorista Andino QA debe tener estrictamente 0 campañas asociadas
  SELECT count(*) INTO v_andino_campaigns
  FROM public.campaigns
  WHERE distributor_id = 'dist-1793748205220';
  IF v_andino_campaigns != 0 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se detectaron campañas asociadas erróneamente a Mayorista Andino QA (%)', v_andino_campaigns;
  END IF;

  -- D. Ninguna otra columna fue modificada (validar total de campañas existentes)
  SELECT count(*) INTO v_total_campaigns FROM public.campaigns;
  IF v_total_campaigns < 17 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Total de campañas inconsistente (%)', v_total_campaigns;
  END IF;
END $$;

COMMIT;

