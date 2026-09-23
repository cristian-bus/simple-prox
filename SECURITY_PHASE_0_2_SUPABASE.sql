-- KioscoProX / Simple ProX — Script SQL Aplicado en Fase 0.2
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Fecha: 23 de Septiembre de 2026

-- ==============================================================================
-- 1. TABLA DE IDENTIDADES DE TERMINAL (Privada)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.terminal_identities (
  installation_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  commerce_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.terminal_identities ENABLE ROW LEVEL SECURITY;

-- Nota de Seguridad: No se definen políticas para anon o public.
-- La tabla es 100% privada para el service_role utilizado por la Edge Function terminal-sync.
COMMENT ON TABLE public.terminal_identities IS 'Almacén seguro de tokens de terminal para autenticación de Simple ProX';


-- ==============================================================================
-- 2. ETAPA B: CIERRE DE POLÍTICAS PÚBLICAS PERMISIVAS EN POSTGREST
-- ==============================================================================

-- Revocar inserción pública directa en merchants (anon ya no puede crear comercios arbitrarios)
DROP POLICY IF EXISTS "merchants_insert_public" ON public.merchants;

-- Revocar actualización pública directa en merchants (anon ya no puede modificar comercios ajenos)
DROP POLICY IF EXISTS "merchants_update_public" ON public.merchants;

-- Revocar inserción pública directa en campaign_events (anon ya no puede insertar métricas sintéticas)
DROP POLICY IF EXISTS "campaign_events_insert_public" ON public.campaign_events;
