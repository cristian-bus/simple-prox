-- ==============================================================================
-- SIMPLE PROX — FASE 5D.8: IMPORTACIÓN CONTROLADA DE 12 DISTRIBUIDORES
-- Archivo: tests/sql/importar_12_distribuidores_fase5d8.sql
-- Módulo: Gestión Comercial B2B (Directorio de Mayoristas)
-- Versión compatible: Simple ProX 1.3.10
-- Modo: DML ATÓMICO CON VALIDACIÓN PREVIA Y POSTERIOR (CERO CAMBIOS DE ESQUEMA)
-- ==============================================================================

BEGIN;

-- 1. Timeout de bloqueo estricto (3 segundos)
PERFORM set_config('lock_timeout', '3s', true);

-- 2. VALIDACIÓN PRE-INSERCIÓN:
-- A. Debe existir exactamente 1 distribuidor (Mayorista Andino QA)
DO $$
DECLARE
  v_dist_count int;
  v_qa_count int;
  v_camp_count int;
BEGIN
  SELECT count(*) INTO v_dist_count FROM public.distributors WHERE deleted = false;
  IF v_dist_count != 1 THEN
    RAISE EXCEPTION 'ABORTANDO: Se esperaba exactamente 1 distribuidor existente en Supabase (encontrados: %)', v_dist_count;
  END IF;

  SELECT count(*) INTO v_qa_count FROM public.distributors WHERE category = 'QA_TEST';
  IF v_qa_count != 1 THEN
    RAISE EXCEPTION 'ABORTANDO: No se encontró al Mayorista Andino QA con category = QA_TEST';
  END IF;

  SELECT count(*) INTO v_camp_count FROM public.campaigns WHERE status = 'active';
  IF v_camp_count != 17 THEN
    RAISE EXCEPTION 'ABORTANDO: Se esperaban 17 campañas activas intactas (encontradas: %)', v_camp_count;
  END IF;
END $$;

-- 3. INSERCIÓN CONTROLADA DE LOS 12 DISTRIBUIDORES
-- Grupo A: 3 Personalizados (record_type = 'prospect')
-- Grupo B: 9 Catálogo de Referencia (record_type = 'catalog_example')
INSERT INTO public.distributors (
  id,
  name,
  legal_name,
  cuit,
  contact_name,
  phone,
  whatsapp_number,
  email,
  province_code,
  city,
  address,
  category,
  min_purchase,
  conditions,
  record_type,
  status,
  commercial_start_date,
  notes,
  deleted
) VALUES
  -- GRUPO A: 3 DISTRIBUIDORES PERSONALIZADOS
  (
    'dist-mic',
    'Mayorista MIC',
    NULL,
    NULL,
    NULL,
    NULL,
    '2664805746',
    NULL,
    'AR-D',
    'San Luis Capital',
    NULL,
    'Bebidas',
    0.00,
    'Compra mínima: 20 unidades. Envio sin cargos',
    'prospect',
    'active',
    NULL,
    NULL,
    false
  ),
  (
    'dist-molto-rc',
    'Molto RC',
    NULL,
    NULL,
    NULL,
    NULL,
    '5454654654',
    NULL,
    'AR-X',
    'Río Cuarto',
    NULL,
    'Almacén',
    90000.00,
    'envio sin cargo',
    'prospect',
    'active',
    NULL,
    NULL,
    false
  ),
  (
    'dist-carrefour',
    'carrefour',
    NULL,
    NULL,
    NULL,
    NULL,
    '3534534',
    NULL,
    'AR-X',
    'Córdoba Capital',
    NULL,
    'Bebidas',
    0.00,
    NULL,
    'prospect',
    'active',
    NULL,
    NULL,
    false
  ),

  -- GRUPO B: 9 DISTRIBUIDORES DEL CATÁLOGO DE REFERENCIA
  (
    'dist-mac',
    'Distribuidora MAC',
    NULL,
    NULL,
    NULL,
    NULL,
    '5491144332211',
    NULL,
    'ALL',
    'Nacional',
    NULL,
    'Almacén',
    0.00,
    'Envío sin cargo en compras superiores a $80.000. Entrega en 24/48hs.',
    'catalog_example',
    'active',
    NULL,
    NULL,
    false
  ),
  (
    'dist-central-sl',
    'Distribuidora Central San Luis',
    NULL,
    NULL,
    NULL,
    NULL,
    '5492664001122',
    NULL,
    'AR-D',
    'San Luis Capital',
    NULL,
    'Bebidas',
    0.00,
    'Reparto de lunes a viernes. Pago contra entrega o transferencia.',
    'catalog_example',
    'active',
    NULL,
    NULL,
    false
  ),
  (
    'dist-el-triunfo',
    'Mayorista El Triunfo',
    NULL,
    NULL,
    NULL,
    NULL,
    '5492664003344',
    NULL,
    'AR-D',
    'San Luis Capital',
    NULL,
    'Snacks',
    0.00,
    'Mínimo 5 bultos cerrados. Envíos en San Luis.',
    'catalog_example',
    'active',
    NULL,
    NULL,
    false
  ),
  (
    'dist-arcor-oficial',
    'Distribuidora Arcor Oficial',
    NULL,
    NULL,
    NULL,
    NULL,
    '5492664005566',
    NULL,
    'AR-D',
    'San Luis Capital',
    NULL,
    'Golosinas',
    0.00,
    'Distribución directa de fábrica con garantía de fecha de vencimiento.',
    'catalog_example',
    'active',
    NULL,
    NULL,
    false
  ),
  (
    'dist-coca-femsa',
    'Coca-Cola FEMSA B2B',
    NULL,
    NULL,
    NULL,
    NULL,
    '5491166554433',
    NULL,
    'ALL',
    'Nacional',
    NULL,
    'Bebidas',
    0.00,
    'Canal oficial para comercios minoristas. Factura A y B.',
    'catalog_example',
    'active',
    NULL,
    NULL,
    false
  ),
  (
    'dist-quilmes',
    'Quilmes Directo',
    NULL,
    NULL,
    NULL,
    NULL,
    '5491155443322',
    NULL,
    'ALL',
    'Nacional',
    NULL,
    'Bebidas',
    0.00,
    'Llegada semanal con preventista asignado.',
    'catalog_example',
    'active',
    NULL,
    NULL,
    false
  ),
  (
    'dist-golomax',
    'Mayorista Golomax',
    NULL,
    NULL,
    NULL,
    NULL,
    '5491177665544',
    NULL,
    'ALL',
    'Nacional',
    NULL,
    'Golosinas',
    0.00,
    'Especialistas en golosinas importadas y nacionales.',
    'catalog_example',
    'active',
    NULL,
    NULL,
    false
  ),
  (
    'dist-ledesma',
    'Ledesma Papel & Almacén',
    NULL,
    NULL,
    NULL,
    NULL,
    '5491188776655',
    NULL,
    'ALL',
    'Nacional',
    NULL,
    'Almacén',
    0.00,
    'Precios por bulto cerrado de resmas y azúcar.',
    'catalog_example',
    'active',
    NULL,
    NULL,
    false
  ),
  (
    'dist-limpieza-total',
    'Distribuidora Limpieza Total',
    NULL,
    NULL,
    NULL,
    NULL,
    '5491199887766',
    NULL,
    'ALL',
    'Nacional',
    NULL,
    'Limpieza',
    0.00,
    'Productos concentrados y descartables gastronómicos.',
    'catalog_example',
    'active',
    NULL,
    NULL,
    false
  )
ON CONFLICT (id) DO NOTHING;

-- 4. VALIDACIÓN POST-INSERCIÓN:
DO $$
DECLARE
  v_total_after int;
  v_prospect_count int;
  v_catalog_count int;
  v_qa_count int;
BEGIN
  SELECT count(*) INTO v_total_after FROM public.distributors WHERE deleted = false;
  IF v_total_after != 13 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaban 13 distribuidores totales (encontrados: %)', v_total_after;
  END IF;

  SELECT count(*) INTO v_prospect_count FROM public.distributors WHERE record_type = 'prospect' AND deleted = false;
  IF v_prospect_count != 4 THEN -- 3 nuevos (MIC, Molto, carrefour) + 1 QA (Andino)
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaban 4 prospectos en total (encontrados: %)', v_prospect_count;
  END IF;

  SELECT count(*) INTO v_catalog_count FROM public.distributors WHERE record_type = 'catalog_example' AND deleted = false;
  IF v_catalog_count != 9 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): Se esperaban 9 distribuidores de catálogo (encontrados: %)', v_catalog_count;
  END IF;

  SELECT count(*) INTO v_qa_count FROM public.distributors WHERE category = 'QA_TEST';
  IF v_qa_count != 1 THEN
    RAISE EXCEPTION 'ABORTANDO (ROLLBACK): El registro de Mayorista Andino QA fue alterado';
  END IF;
END $$;

COMMIT;

