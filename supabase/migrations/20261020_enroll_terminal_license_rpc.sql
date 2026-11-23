-- ==============================================================================
-- KioscoProX / Simple ProX — Migración Atómica: Enrolamiento Seguro por Licencia
-- Archivo: 20261020_enroll_terminal_license_rpc.sql
-- Modo: BORRADOR LOCAL — NO EJECUTAR EN SUPABASE PRODUCCIÓN HASTA AUTORIZACIÓN
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- FUNCIÓN RPC ATÓMICA: public.enroll_terminal_with_license
-- ==============================================================================
-- Propósito:
-- 1. Garantizar verificación atómica de estado en terminal_identities con bloqueo de fila (FOR UPDATE).
-- 2. Impedir categóricamente que terminales 'revoked' o 'suspended' puedan re-enrolarse (Fail Closed).
-- 3. Bloqueo estricto de reemisión no autorizada para terminales activas: un certificado
--    de licencia por sí solo SOLO permite el PRIMER enrolamiento. Para rotar credenciales
--    de una terminal activa se exige autorización administrativa (p_allow_rotation = true).
-- 4. Preservar intactos los datos administrativos de merchants (nombre, dirección, teléfono)
--    sin sobrescribir jamás con null o cadenas vacías.

CREATE OR REPLACE FUNCTION public.enroll_terminal_with_license(
  p_installation_id TEXT,
  p_token_hash TEXT,
  p_merchant_data JSONB DEFAULT '{}'::jsonb,
  p_allow_rotation BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_status TEXT;
  v_last_used TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
  v_merchant RECORD;
  v_store_name TEXT;
  v_address TEXT;
  v_phone TEXT;
  v_installer TEXT;
  v_app_version TEXT;
  v_err_constraint TEXT;
  v_err_table TEXT;
BEGIN
  -- 1. BLOQUEO DE FILA Y COMPROBACIÓN DE ESTADO EN terminal_identities
  SELECT status, last_used_at INTO v_existing_status, v_last_used
  FROM public.terminal_identities
  WHERE installation_id = p_installation_id
  FOR UPDATE;

  -- 2. BLOQUEO ABSOLUTO DE TERMINALES REVOCADAS O SUSPENDIDAS (Fail-Closed)
  IF FOUND THEN
    IF v_existing_status IN ('revoked', 'suspended') THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'TERMINAL_REVOKED',
        'error', 'Terminal en estado ''' || v_existing_status || ''': re-enrolamiento bloqueado, requiere autorización administrativa previa.'
      );
    END IF;

    -- 3. CONTROL DE REEMISIÓN DE TERMINALTOKEN
    -- Si la terminal ya posee credencial activa:
    IF v_existing_status = 'active' THEN
      -- Si NO se demostró autorización administrativa para rotar la credencial,
      -- se rechaza categóricamente para evitar que un certificado copiado invalide la terminal legítima.
      IF NOT p_allow_rotation THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'ALREADY_ENROLLED',
          'error', 'La terminal ya se encuentra enrolada con credencial activa. No se permite reemisión sin autorización administrativa previa.'
        );
      END IF;

      -- Si está autorizada administrativamente (ej: Master Key), aplicar actualización atómica
      UPDATE public.terminal_identities
      SET token_hash = p_token_hash,
          last_used_at = v_now
      WHERE installation_id = p_installation_id
        AND status = 'active';
    END IF;

  ELSE
    -- 4. PRIMER ENROLAMIENTO LEGÍTIMO: INSERT ESTRICTO CON MANEJO DE COLISIÓN CONCURRENTE
    BEGIN
      INSERT INTO public.terminal_identities (
        installation_id,
        token_hash,
        commerce_id,
        status,
        last_used_at,
        created_at
      ) VALUES (
        p_installation_id,
        p_token_hash,
        p_installation_id,
        'active',
        v_now,
        v_now
      );
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS
        v_err_constraint = CONSTRAINT_NAME,
        v_err_table = TABLE_NAME;

      -- Verificar exclusivamente que el conflicto proviene de la restricción de unicidad de installation_id (PK)
      IF v_err_table = 'terminal_identities' AND v_err_constraint = 'terminal_identities_pkey' THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'ALREADY_ENROLLED',
          'error', 'Conflicto de concurrencia: la terminal ya fue enrolada concurrentemente.'
        );
      ELSE
        -- Si corresponde a otra tabla o restricción no relacionada, relanzar la excepción
        RAISE;
      END IF;
    END;
  END IF;

  -- 5. PROTECCIÓN DE DATOS COMERCIALES EN public.merchants
  SELECT * INTO v_merchant FROM public.merchants WHERE id = p_installation_id FOR UPDATE;

  -- Extraer datos entrantes filtrando valores vacíos
  v_store_name := NULLIF(TRIM(p_merchant_data->>'storeName'), '');
  IF v_store_name IS NULL THEN
    v_store_name := NULLIF(TRIM(p_merchant_data->>'name'), '');
  END IF;
  v_address := NULLIF(TRIM(p_merchant_data->>'address'), '');
  v_phone := NULLIF(TRIM(p_merchant_data->>'phone'), '');
  v_installer := NULLIF(TRIM(p_merchant_data->>'installer'), '');
  v_app_version := COALESCE(NULLIF(TRIM(p_merchant_data->>'appVersion'), ''), '1.3.9');

  IF FOUND THEN
    -- Si el comercio ya existe: PRESERVAR valores existentes mediante COALESCE estricto
    UPDATE public.merchants
    SET last_active = v_now,
        last_seen_at = v_now,
        app_version = COALESCE(v_app_version, merchants.app_version),
        name = COALESCE(merchants.name, v_store_name),
        address = COALESCE(merchants.address, v_address),
        phone = COALESCE(merchants.phone, v_phone),
        installer = COALESCE(merchants.installer, v_installer)
    WHERE id = p_installation_id;
  ELSE
    -- Si no existe: Inserción inicial con valores proporcionados o fallback controlado
    INSERT INTO public.merchants (
      id,
      installation_id,
      commerce_id,
      name,
      address,
      phone,
      installer,
      status,
      app_version,
      last_active,
      last_seen_at
    ) VALUES (
      p_installation_id,
      p_installation_id,
      p_installation_id,
      COALESCE(v_store_name, 'Kiosco ' || p_installation_id),
      v_address,
      v_phone,
      v_installer,
      'active',
      v_app_version,
      v_now,
      v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'installation_id', p_installation_id,
    'action', CASE WHEN v_existing_status = 'active' THEN 'credential_rotated' ELSE 'first_enrollment' END
  );
END;
$$;

-- Permisos estrictos: solo ejecutable por service_role desde Edge Functions
REVOKE ALL ON FUNCTION public.enroll_terminal_with_license(TEXT, TEXT, JSONB, BOOLEAN) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_terminal_with_license(TEXT, TEXT, JSONB, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.enroll_terminal_with_license IS 'Procedimiento atómico transaccional para enrolamiento seguro por certificado de licencia, bloqueo de terminales revocadas, control de reemisión y preservación de datos en merchants';

COMMIT;
