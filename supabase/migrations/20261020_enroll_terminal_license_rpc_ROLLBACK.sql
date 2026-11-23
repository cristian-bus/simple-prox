-- ==============================================================================
-- KioscoProX / Simple ProX — Script de Rollback: Enrolamiento Seguro por Licencia
-- Archivo: 20261020_enroll_terminal_license_rpc_ROLLBACK.sql
-- Modo: BORRADOR LOCAL — NO EJECUTAR EN PRODUCCIÓN HASTA AUTORIZACIÓN
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.enroll_terminal_with_license(TEXT, TEXT, JSONB, BOOLEAN);

COMMIT;
