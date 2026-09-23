-- KioscoProX / Simple ProX — Script SQL Fase 0.2.1
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Fecha: 23 de Septiembre de 2026

-- ==============================================================================
-- 1. TABLA DE TICKETS DE ENROLAMIENTO (Enrollment Tickets)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.terminal_enrollment_tickets (
  ticket_hash TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  commerce_id TEXT,
  store_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'revoked')),
  created_by TEXT DEFAULT 'admin'
);

ALTER TABLE public.terminal_enrollment_tickets ENABLE ROW LEVEL SECURITY;

-- Política RLS: Acceso total para administradores autenticados desde el Panel Admin
CREATE POLICY "enrollment_tickets_admin_all" ON public.terminal_enrollment_tickets
FOR ALL TO public
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Comentarios de documentación en esquema
COMMENT ON TABLE public.terminal_enrollment_tickets IS 'Tickets criptográficos de un solo uso para autorización estricta de enrolamiento de terminales';
