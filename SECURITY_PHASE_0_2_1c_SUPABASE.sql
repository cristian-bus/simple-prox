-- ============================================================================
-- KioscoProX / Simple ProX - Fase 0.2.1c: Recuperación Administrativa de Terminales
-- ============================================================================
-- Archivo: SECURITY_PHASE_0_2_1c_SUPABASE.sql
-- Propósito:
--   1. Agregar columnas de auditoría a public.terminal_identities:
--      - revoked_at TIMESTAMPTZ NULL
--      - revocation_reason TEXT NULL
--      - reenrolled_at TIMESTAMPTZ NULL
--   2. Actualizar la RPC atómica transaccional public.enroll_terminal_with_ticket
--      para permitir re-enrolamiento seguro de identidades previamente revocadas
--      por un administrador, con bloqueo pesimista de fila (FOR UPDATE),
--      verificación obligatoria de filas afectadas y rollback forzado ante
--      cualquier discrepancia o conflicto de concurrencia.
--
-- Regla de Oro:
--   - NO borra filas de terminal_identities.
--   - Preserva installation_id y commerce_id inalterados.
--   - Requiere obligatoriamente un ticket de enrolamiento emitido por admin_users.
--   - Si el UPDATE de re-enrolamiento no afecta exactamente 1 fila, aborta y revierte el ticket.
--   - Si el INSERT inicial colisiona por carrera, aborta y revierte el ticket.
--   - Ejecutable exclusivamente por service_role.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Agregar columnas de trazabilidad a public.terminal_identities
-- ----------------------------------------------------------------------------
ALTER TABLE public.terminal_identities
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS revocation_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS reenrolled_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.terminal_identities.revoked_at IS 'Fecha y hora de la revocación administrativa de la credencial';
COMMENT ON COLUMN public.terminal_identities.revocation_reason IS 'Motivo registrado por el administrador al revocar la credencial';
COMMENT ON COLUMN public.terminal_identities.reenrolled_at IS 'Fecha y hora del último re-enrolamiento exitoso tras una revocación previa';

-- ----------------------------------------------------------------------------
-- 2. Actualizar RPC public.enroll_terminal_with_ticket para Re-enrolamiento Seguro
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enroll_terminal_with_ticket(
  p_ticket_hash TEXT,
  p_installation_id TEXT,
  p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_existing_status TEXT;
  v_merchant RECORD;
  v_ticket RECORD;
  v_target_commerce_id TEXT;
  v_rows_affected INTEGER := 0;
BEGIN
  -- Validaciones básicas de parámetros
  IF p_ticket_hash IS NULL OR length(trim(p_ticket_hash)) < 32 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAM', 'error', 'ticket_hash inválido');
  END IF;

  IF p_installation_id IS NULL OR length(trim(p_installation_id)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAM', 'error', 'installation_id inválido');
  END IF;

  IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 32 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAM', 'error', 'token_hash inválido');
  END IF;

  -- 1. Bloqueo pesimista y verificación de estado si la identidad ya existe (ROW LOCK)
  SELECT status INTO v_existing_status
  FROM public.terminal_identities
  WHERE installation_id = p_installation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_status = 'active' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'ALREADY_ENROLLED',
        'error', 'Terminal ya enrolada previamente con credencial activa.'
      );
    ELSIF v_existing_status = 'revoked' THEN
      -- Fase 0.2.1c: Permitir re-enrolamiento de identidad previamente revocada
      NULL;
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'code', 'REENROLL_REQUIRES_ADMIN_RESET',
        'error', 'Terminal en estado ''' || v_existing_status || ''': re-enrolamiento bloqueado, requiere revocación administrativa previa.'
      );
    END IF;
  END IF;

  -- 2. Verificar precondición estricta: merchant debe existir pre-provisionado
  SELECT * INTO v_merchant FROM public.merchants WHERE id = p_installation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'MERCHANT_NOT_PROVISIONED',
      'error', 'MERCHANT_NOT_PROVISIONED: El comercio asociado no ha sido provisionado administrativamente.'
    );
  END IF;

  -- 3. Consumo atómico del ticket con bloqueo de fila
  UPDATE public.terminal_enrollment_tickets
  SET status = 'used',
      used_at = v_now
  WHERE ticket_hash = p_ticket_hash
    AND installation_id = p_installation_id
    AND status = 'pending'
    AND expires_at > v_now
  RETURNING * INTO v_ticket;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_OR_EXPIRED_TICKET',
      'error', 'Ticket de enrolamiento inválido, expirado, ya utilizado o no asignado a esta terminal.'
    );
  END IF;

  v_target_commerce_id := COALESCE(v_ticket.commerce_id, v_merchant.commerce_id, p_installation_id);

  -- 4. Registrar o actualizar identidad segura en terminal_identities
  IF v_existing_status IS NULL THEN
    -- Enrolamiento inicial: INSERT estricto protegido contra condición de carrera
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
        v_target_commerce_id,
        'active',
        v_now,
        v_now
      );
    EXCEPTION WHEN unique_violation THEN
      -- Carrera concurrente: abortar forzando ROLLBACK total del ticket
      RAISE EXCEPTION 'Conflicto de concurrencia: la identidad ya fue creada concurrentemente. Transacción revertida.' USING ERRCODE = '23505';
    END;

  ELSIF v_existing_status = 'revoked' THEN
    -- Re-enrolamiento de terminal revocada: UPDATE atómico bajo bloqueo FOR UPDATE previo
    UPDATE public.terminal_identities
    SET token_hash = p_token_hash,
        commerce_id = v_target_commerce_id,
        status = 'active',
        reenrolled_at = v_now,
        last_used_at = v_now
    WHERE installation_id = p_installation_id
      AND status = 'revoked';

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- Si por cualquier anomalía o carrera no se actualizó exactamente 1 fila,
    -- abortar provocando ROLLBACK total de la transacción (revierte el UPDATE del ticket)
    IF v_rows_affected <> 1 THEN
      RAISE EXCEPTION 'Fallo de integridad/concurrencia: re-enrolamiento no pudo actualizar la identidad revocada (filas afectadas: %). Transacción revertida.', v_rows_affected USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'installation_id', p_installation_id,
    'commerce_id', v_target_commerce_id
  );
END;
$$;

-- Restringir permisos de ejecución de la RPC exclusivamente a service_role
REVOKE ALL ON FUNCTION public.enroll_terminal_with_ticket(TEXT, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_terminal_with_ticket(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.enroll_terminal_with_ticket IS 'Procedimiento atómico transaccional para enrolamiento y re-enrolamiento seguro con ticket de un solo uso, bloqueo pesimista FOR UPDATE y reversión estricta';
