-- KioscoProX / Simple ProX — Script SQL Fase 0.2.1 / 0.2.1a / 0.2.1b
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Fecha: 23 de Septiembre de 2026
-- Modo: CAMBIO QUIRÚRGICO — BORRADOR LOCAL — NO EJECUTAR EN PRODUCCIÓN

-- ==============================================================================
-- 1. TABLA DE USUARIOS ADMINISTRADORES (admin_users)
-- ==============================================================================
-- Propósito: Autoridad server-side para verificar privilegios de administración real
-- antes de permitir la emisión de Enrollment Tickets. No confía en auth.role() = 'authenticated'.

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Denegación total por RLS para anon y authenticated (deny-by-default)
-- Solo service_role tiene acceso para lecturas y verificaciones en la Edge Function.
REVOKE ALL ON public.admin_users FROM public, anon, authenticated;
GRANT ALL ON public.admin_users TO service_role;

COMMENT ON TABLE public.admin_users IS 'Tabla privada de administradores autorizados para emitir tickets y gestionar terminales';

-- BOOTSTRAP DEL PRIMER ADMINISTRADOR (Instrucción manual):
-- 1. Registrar usuario en Supabase Auth o localizar su UUID en auth.users.
-- 2. Ejecutar manualmente con permisos de superadmin:
--    INSERT INTO public.admin_users (user_id, is_active, notes)
--    VALUES ('<UUID_DEL_USUARIO_EN_AUTH_USERS>', true, 'Superadmin inicial');

-- ==============================================================================
-- 2. TABLA DE TICKETS DE ENROLAMIENTO (terminal_enrollment_tickets)
-- ==============================================================================
-- Propósito: Almacenamiento seguro de tickets de enrolamiento de un solo uso.
-- Duración estricta: 30 minutos.
-- RLS habilitada sin políticas para anon/authenticated (totalmente privada de PostgREST).

CREATE TABLE IF NOT EXISTS public.terminal_enrollment_tickets (
  ticket_hash TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  commerce_id TEXT,
  store_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'revoked')),
  created_by TEXT DEFAULT 'admin'
);

CREATE INDEX IF NOT EXISTS idx_terminal_enrollment_tickets_lookup 
  ON public.terminal_enrollment_tickets (ticket_hash, installation_id, status);

CREATE INDEX IF NOT EXISTS idx_terminal_enrollment_tickets_expiry 
  ON public.terminal_enrollment_tickets (expires_at);

ALTER TABLE public.terminal_enrollment_tickets ENABLE ROW LEVEL SECURITY;

-- Denegar todo acceso desde PostgREST público / anon / authenticated
REVOKE ALL ON public.terminal_enrollment_tickets FROM public, anon, authenticated;
GRANT ALL ON public.terminal_enrollment_tickets TO service_role;

COMMENT ON TABLE public.terminal_enrollment_tickets IS 'Tickets criptográficos de un solo uso para autorización estricta de enrolamiento (privada, solo service_role)';

-- ==============================================================================
-- 3. FUNCIÓN RPC TRANSACCIONAL ATÓMICA (enroll_terminal_with_ticket)
-- ==============================================================================
-- Propósito: Garantizar atomicidad estricta y protección contra reactivación indebida (Fase 0.2.1b).
-- Precondiciones:
--   a) Terminal no debe existir en terminal_identities:
--      - Si existe con status 'active' -> ALREADY_ENROLLED (409).
--      - Si existe con status 'revoked', 'suspended' u otro -> REENROLL_REQUIRES_ADMIN_RESET (409).
--   b) Merchant debe estar pre-provisionado en public.merchants (NO auto-crear).
--   c) Ticket debe ser válido, pending y no expirado.
-- En una sola transacción:
--   - Marca ticket como 'used'.
--   - Realiza INSERT estricto en terminal_identities (SIN ON CONFLICT DO UPDATE).
-- Si cualquier paso falla, NO se consume el ticket y se revierte todo.

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
  v_existing_status TEXT;
  v_ticket RECORD;
  v_merchant RECORD;
  v_now TIMESTAMPTZ := now();
  v_target_commerce_id TEXT;
BEGIN
  -- 1. REGLA DE ESTADOS (Fase 0.2.1b): Verificar si ya existe cualquier identidad previa
  SELECT status INTO v_existing_status
  FROM public.terminal_identities
  WHERE installation_id = p_installation_id;

  IF FOUND THEN
    IF v_existing_status = 'active' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'ALREADY_ENROLLED',
        'error', 'Terminal ya enrolada previamente con credencial activa.'
      );
    ELSE
      -- revoked, suspended o cualquier otro estado: FAIL CLOSED
      -- Prohibido reactivar automáticamente una identidad revocada o suspendida
      RETURN jsonb_build_object(
        'success', false,
        'code', 'REENROLL_REQUIRES_ADMIN_RESET',
        'error', 'Terminal en estado ''' || v_existing_status || ''': re-enrolamiento bloqueado, requiere reset administrativo previo.'
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
  -- Solo se consume si las precondiciones 1 y 2 fueron superadas exitosamente
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

  -- Determinar el commerce_id definitivo (prioridad ticket -> merchant existente)
  v_target_commerce_id := COALESCE(v_ticket.commerce_id, v_merchant.commerce_id, p_installation_id);

  -- 4. Registrar identidad segura en terminal_identities (SOLO INSERT ESTRICTO, SIN ON CONFLICT DO UPDATE)
  -- Si ya existiera por condición de carrera no detectada, el PRIMARY KEY falla cerrado y revierte la transacción.
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

-- Restringir permisos de ejecución de la RPC exclusivamente a service_role
REVOKE ALL ON FUNCTION public.enroll_terminal_with_ticket(TEXT, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_terminal_with_ticket(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.enroll_terminal_with_ticket IS 'Procedimiento atómico transaccional para enrolamiento seguro con ticket de un solo uso y bloqueo de reactivación indebida';
