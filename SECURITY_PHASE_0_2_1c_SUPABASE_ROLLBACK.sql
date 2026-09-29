-- ============================================================================
-- KioscoProX / Simple ProX - ROLLBACK Fase 0.2.1c
-- ============================================================================
-- Archivo: SECURITY_PHASE_0_2_1c_SUPABASE_ROLLBACK.sql
-- Propósito:
--   1. Restaurar la RPC public.enroll_terminal_with_ticket a la versión estricta
--      de la Fase 0.2.1b (bloqueo FAIL CLOSED para identidades revoked).
--   2. Eliminar las columnas de auditoría agregadas a public.terminal_identities.
-- ============================================================================

-- 1. Restaurar la RPC a versión Fase 0.2.1b
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
BEGIN
  IF p_ticket_hash IS NULL OR length(trim(p_ticket_hash)) < 32 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAM', 'error', 'ticket_hash inválido');
  END IF;

  IF p_installation_id IS NULL OR length(trim(p_installation_id)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAM', 'error', 'installation_id inválido');
  END IF;

  IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 32 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAM', 'error', 'token_hash inválido');
  END IF;

  SELECT status INTO v_existing_status
  FROM public.terminal_identities
  WHERE installation_id = p_installation_id;

  IF FOUND THEN
    IF v_existing_status = 'active' THEN
      RETURN jsonb_build_object('success', false, 'code', 'ALREADY_ENROLLED', 'error', 'Terminal ya enrolada previamente con credencial activa.');
    ELSE
      RETURN jsonb_build_object('success', false, 'code', 'REENROLL_REQUIRES_ADMIN_RESET', 'error', 'Terminal en estado ''' || v_existing_status || ''': re-enrolamiento bloqueado, requiere reset administrativo previo.');
    END IF;
  END IF;

  SELECT * INTO v_merchant FROM public.merchants WHERE id = p_installation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'MERCHANT_NOT_PROVISIONED', 'error', 'MERCHANT_NOT_PROVISIONED: El comercio asociado no ha sido provisionado administrativamente.');
  END IF;

  UPDATE public.terminal_enrollment_tickets
  SET status = 'used',
      used_at = v_now
  WHERE ticket_hash = p_ticket_hash
    AND installation_id = p_installation_id
    AND status = 'pending'
    AND expires_at > v_now
  RETURNING * INTO v_ticket;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_OR_EXPIRED_TICKET', 'error', 'Ticket de enrolamiento inválido, expirado, ya utilizado o no asignado a esta terminal.');
  END IF;

  v_target_commerce_id := COALESCE(v_ticket.commerce_id, v_merchant.commerce_id, p_installation_id);

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

  RETURN jsonb_build_object(
    'success', true,
    'installation_id', p_installation_id,
    'commerce_id', v_target_commerce_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_terminal_with_ticket(TEXT, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_terminal_with_ticket(TEXT, TEXT, TEXT) TO service_role;

-- 2. Eliminar columnas agregadas a public.terminal_identities
ALTER TABLE public.terminal_identities
  DROP COLUMN IF EXISTS reenrolled_at,
  DROP COLUMN IF EXISTS revocation_reason,
  DROP COLUMN IF EXISTS revoked_at;
