-- ==============================================================================
-- FASE 0.2.2 — DEDUPLICACIÓN DE CAMPAIGN_EVENTS Y CONSTRAINT UNIQUE ESTÁNDAR
-- ARCHIVO: SECURITY_PHASE_0_2_2_SUPABASE.sql
-- ESTADO: CORREGIDO — NO EJECUTADO (REQUIERE AUTORIZACIÓN EXPLÍCITA)
-- ==============================================================================

BEGIN;

-- 1. Bloqueo transaccional contra escrituras concurrentes
-- Permite SELECT concurrentes pero bloquea INSERT/UPDATE/DELETE durante la transacción
LOCK TABLE public.campaign_events IN EXCLUSIVE MODE;

-- 2. Verificación previa de seguridad (Pre-flight assertion)
-- Se esperan exactamente 9443 filas totales, 0 nulos y 60 redundantes en 54 grupos de duplicados.
DO $$
DECLARE
  v_total BIGINT;
  v_distinct BIGINT;
  v_redundant BIGINT;
  v_nulls BIGINT;
BEGIN
  SELECT 
    COUNT(*), 
    COUNT(DISTINCT event_id), 
    COUNT(*) FILTER (WHERE event_id IS NULL)
  INTO v_total, v_distinct, v_nulls
  FROM public.campaign_events;

  v_redundant := v_total - v_distinct;

  IF v_nulls <> 0 THEN
    RAISE EXCEPTION 'Abortando: Se encontraron % filas con event_id NULL (se esperaban 0)', v_nulls;
  END IF;

  IF v_total <> 9443 THEN
    RAISE EXCEPTION 'Abortando: Se esperaban 9443 filas pero se encontraron %', v_total;
  END IF;

  IF v_redundant <> 60 THEN
    RAISE EXCEPTION 'Abortando: Se esperaban 60 filas redundantes pero se encontraron % (Total: %, Distintos: %)',
      v_redundant, v_total, v_distinct;
  END IF;
END $$;

-- 3. Deduplicación determinista:
-- Conserva exactamente una fila por event_id (la primera registrada por synced_at ASC, id ASC)
-- Elimina exactamente las 60 filas redundantes (rn > 1)
WITH ranked_events AS (
  SELECT
    id,
    event_id,
    ROW_NUMBER() OVER (
      PARTITION BY event_id 
      ORDER BY synced_at ASC, id ASC
    ) AS rn
  FROM public.campaign_events
)
DELETE FROM public.campaign_events
WHERE id IN (
  SELECT id FROM ranked_events WHERE rn > 1
);

-- 4. Verificación post-deduplicación
DO $$
DECLARE
  v_total BIGINT;
  v_distinct BIGINT;
  v_redundant BIGINT;
  v_nulls BIGINT;
BEGIN
  SELECT 
    COUNT(*), 
    COUNT(DISTINCT event_id), 
    COUNT(*) FILTER (WHERE event_id IS NULL)
  INTO v_total, v_distinct, v_nulls
  FROM public.campaign_events;

  v_redundant := v_total - v_distinct;

  IF v_nulls <> 0 THEN
    RAISE EXCEPTION 'Error crítico: Existen % filas con event_id NULL tras deduplicación', v_nulls;
  END IF;

  IF v_redundant <> 0 THEN
    RAISE EXCEPTION 'Error crítico: Aún existen % duplicados tras deduplicación', v_redundant;
  END IF;

  IF v_total <> 9383 THEN
    RAISE EXCEPTION 'Error crítico: Total final esperado 9383 pero se obtuvo %', v_total;
  END IF;
END $$;

-- 5. Creación de la restricción UNIQUE estándar sobre event_id
-- Crea automáticamente el índice UNIQUE btree estándar no parcial
-- Compatible al 100% con PostgreSQL 17 y Supabase upsert onConflict: 'event_id'
ALTER TABLE public.campaign_events
  ADD CONSTRAINT campaign_events_event_id_unique UNIQUE (event_id);

COMMIT;
