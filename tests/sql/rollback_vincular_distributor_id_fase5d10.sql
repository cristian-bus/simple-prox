-- ==============================================================================
-- SIMPLE PROX — FASE 5D.10: ROLLBACK DE VINCULACIÓN DE CAMPAÑAS
-- Archivo: tests/sql/rollback_vincular_distributor_id_fase5d10.sql
-- Módulo: Gestión Comercial B2B (Publicidad y Anunciantes)
-- Versión compatible: Simple ProX 1.3.10
-- Modo: REVERSIÓN SEGURA, DETERMINISTA Y ATÓMICA
-- ==============================================================================

BEGIN;

-- 1. Timeout estricto de bloqueo (3 segundos)
SET LOCAL lock_timeout = '3s';

-- 2. VALIDACIÓN PRE-ROLLBACK:
DO $$
DECLARE
  v_linked_count int;
BEGIN
  -- Comprobar que exactamente las 17 campañas autorizadas tienen los distributor_id asignados por la Fase 5D.10
  SELECT count(*) INTO v_linked_count
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
  ) AND distributor_id IN (
    'dist-el-triunfo',
    'dist-mac',
    'dist-central-sl',
    'dist-arcor-oficial',
    'dist-mic',
    'dist-carrefour',
    'dist-molto-rc'
  );

  IF v_linked_count != 17 THEN
    RAISE EXCEPTION 'ABORTANDO ROLLBACK: No se encontraron las 17 campañas en el estado vinculado esperado (encontradas: %)', v_linked_count;
  END IF;
END $$;

-- 3. REVERSIÓN DETERMINISTA A distributor_id = NULL
UPDATE public.campaigns
SET distributor_id = NULL
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
) AND distributor_id IN (
  'dist-el-triunfo',
  'dist-mac',
  'dist-central-sl',
  'dist-arcor-oficial',
  'dist-mic',
  'dist-carrefour',
  'dist-molto-rc'
);

-- 4. VALIDACIÓN POST-ROLLBACK:
DO $$
DECLARE
  v_null_after int;
BEGIN
  SELECT count(*) INTO v_null_after
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

  IF v_null_after != 17 THEN
    RAISE EXCEPTION 'ABORTANDO: El rollback no restauró exactamente las 17 campañas a NULL (restauradas: %)', v_null_after;
  END IF;
END $$;

COMMIT;

