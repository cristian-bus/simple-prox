-- ==============================================================================
-- KioscoProX / Simple ProX — Script de Rollback de Límite de Intentos Distribuido
-- ARCHIVO: supabase/migrations/20261011_activation_rate_limit_ROLLBACK.sql
-- ESTADO: PREPARADO — EJECUTAR ÚNICAMENTE PARA REVERTIR LA MIGRACIÓN DE RATE LIMIT
-- ==============================================================================

BEGIN;

-- 1. Eliminar funciones RPC si existen
DROP FUNCTION IF EXISTS public.check_and_record_activation_attempt(TEXT, TEXT, INT, INT, INT, INT);
DROP FUNCTION IF EXISTS public.clear_activation_rate_limit(TEXT);
DROP FUNCTION IF EXISTS public.clean_expired_activation_rate_limits(INT);

-- 2. Eliminar tabla de intentos si existe
DROP TABLE IF EXISTS public.activation_rate_limits;

COMMIT;
