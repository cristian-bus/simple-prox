-- KioscoProX / Simple ProX — Script SQL de Rollback para Fase 0.2.1
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Revierte exclusivamente los cambios de esquema introducidos en Fase 0.2.1

DROP POLICY IF EXISTS "enrollment_tickets_admin_all" ON public.terminal_enrollment_tickets;
DROP TABLE IF EXISTS public.terminal_enrollment_tickets;
