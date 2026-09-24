-- KioscoProX / Simple ProX — Script SQL Rollback Fase 0.2.1b
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Fecha: 23 de Septiembre de 2026
-- Propósito: Revertir exclusivamente las adiciones de la Fase 0.2.1b (sin tocar Fase 0.2 ni 0.1)

-- 1. Eliminar función RPC atómica de enrolamiento
DROP FUNCTION IF EXISTS public.enroll_terminal_with_ticket(TEXT, TEXT, TEXT);

-- 2. Eliminar índice único parcial de ticket pending
DROP INDEX IF EXISTS public.idx_terminal_enrollment_tickets_single_pending;

-- 3. Eliminar tabla de tickets de enrolamiento y sus índices asociados
DROP TABLE IF EXISTS public.terminal_enrollment_tickets CASCADE;

-- 4. Eliminar tabla de usuarios administradores
DROP TABLE IF EXISTS public.admin_users CASCADE;
