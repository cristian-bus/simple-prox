-- ==============================================================================
-- FASE 6 — PASO 2.1: FUNCIONES DE RATE LIMITING PARA ACTIVACIÓN REMOTA
-- Proyecto Supabase Producción: qtixbiikhvhzwshfgyeo
-- Ejecutar exclusivamente en el SQL Editor oficial de Supabase
-- ==============================================================================

BEGIN;

-- 1. FUNCIÓN PARA LIMPIAR CONTADOR TRAS ACTIVACIÓN EXITOSA
CREATE OR REPLACE FUNCTION public.clear_activation_rate_limit(
  p_device_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_device_key IS NULL OR length(trim(p_device_key)) = 0 THEN
    RETURN;
  END IF;

  DELETE FROM public.activation_rate_limits
  WHERE key = p_device_key;
END;
$$;

-- Permisos estrictos para clear_activation_rate_limit
REVOKE ALL ON FUNCTION public.clear_activation_rate_limit(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_activation_rate_limit(TEXT) TO service_role;


-- 2. FUNCIÓN ATÓMICA DE RATE LIMITING (Anti-Deadlocks y Preservación de Bloqueo Activo)
CREATE OR REPLACE FUNCTION public.check_and_record_activation_attempt(
  p_device_key TEXT,
  p_ip_key TEXT,
  p_max_device_attempts INT DEFAULT 5,
  p_max_ip_attempts INT DEFAULT 15,
  p_window_seconds INT DEFAULT 900,
  p_block_seconds INT DEFAULT 900
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  
  -- Saneamiento defensivo de parámetros (evita anulación de bloqueo o ventanas <= 0s)
  v_max_dev INT := GREATEST(COALESCE(p_max_device_attempts, 5), 1);
  v_max_ip INT := GREATEST(COALESCE(p_max_ip_attempts, 15), 1);
  v_win_secs INT := GREATEST(COALESCE(p_window_seconds, 900), 1);
  v_blk_secs INT := GREATEST(COALESCE(p_block_seconds, 900), 1);

  v_window_interval INTERVAL := make_interval(secs => v_win_secs);
  v_block_interval INTERVAL := make_interval(secs => v_blk_secs);

  v_dev_blocked_until TIMESTAMPTZ;
  v_ip_blocked_until TIMESTAMPTZ;

  v_dev_attempts INT;
  v_ip_attempts INT;

  v_is_dev_blocked BOOLEAN := FALSE;
  v_is_ip_blocked BOOLEAN := FALSE;
  v_retry_after INT := 0;
BEGIN
  -- Validación defensiva de claves (evita registros nulos o cadenas vacías)
  IF p_device_key IS NULL OR length(trim(p_device_key)) = 0 THEN
    RETURN jsonb_build_object('allowed', FALSE, 'blocked', TRUE, 'reason', 'invalid_device_key');
  END IF;

  IF p_ip_key IS NULL OR length(trim(p_ip_key)) = 0 THEN
    RETURN jsonb_build_object('allowed', FALSE, 'blocked', TRUE, 'reason', 'invalid_ip_key');
  END IF;

  -- 0. Limpieza defensiva y oportunista (~5% de llamadas) sin sobrecargar la BD
  IF random() < 0.05 THEN
    PERFORM public.clean_expired_activation_rate_limits(86400);
  END IF;

  -- A. Verificar si el dispositivo o la IP ya se encuentran bajo bloqueo activo
  SELECT blocked_until INTO v_dev_blocked_until
  FROM public.activation_rate_limits
  WHERE key = p_device_key;

  IF v_dev_blocked_until IS NOT NULL AND v_dev_blocked_until > v_now THEN
    v_is_dev_blocked := TRUE;
    v_retry_after := GREATEST(v_retry_after, CEIL(EXTRACT(EPOCH FROM (v_dev_blocked_until - v_now)))::INT);
  END IF;

  SELECT blocked_until INTO v_ip_blocked_until
  FROM public.activation_rate_limits
  WHERE key = p_ip_key;

  IF v_ip_blocked_until IS NOT NULL AND v_ip_blocked_until > v_now THEN
    v_is_ip_blocked := TRUE;
    v_retry_after := GREATEST(v_retry_after, CEIL(EXTRACT(EPOCH FROM (v_ip_blocked_until - v_now)))::INT);
  END IF;

  IF v_is_dev_blocked OR v_is_ip_blocked THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'blocked', TRUE,
      'reason', CASE 
        WHEN v_is_dev_blocked THEN 'device_blocked'
        ELSE 'ip_blocked'
      END,
      'retry_after_seconds', v_retry_after
    );
  END IF;

  -- B & C. Incrementar contadores garantizando orden consistente de bloqueo (Anti-Deadlocks)
  -- Si p_device_key = p_ip_key, procesar una sola vez para evitar colisión interna
  IF p_device_key = p_ip_key THEN
    INSERT INTO public.activation_rate_limits (key, attempts, window_start, updated_at, blocked_until)
    VALUES (
      p_device_key,
      1,
      v_now,
      v_now,
      CASE WHEN 1 >= LEAST(v_max_dev, v_max_ip) THEN v_now + v_block_interval ELSE NULL END
    )
    ON CONFLICT (key) DO UPDATE
    SET
      attempts = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN 1
        WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN 1
        ELSE activation_rate_limits.attempts + 1
      END,
      window_start = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN v_now
        WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN v_now
        ELSE activation_rate_limits.window_start
      END,
      blocked_until = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until > v_now THEN activation_rate_limits.blocked_until
        WHEN (
          CASE
            WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN 1
            WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN 1
            ELSE activation_rate_limits.attempts + 1
          END
        ) >= LEAST(v_max_dev, v_max_ip) THEN v_now + v_block_interval
        ELSE NULL
      END,
      updated_at = v_now
    RETURNING attempts, blocked_until INTO v_dev_attempts, v_dev_blocked_until;

    v_ip_attempts := v_dev_attempts;
    v_ip_blocked_until := v_dev_blocked_until;

  ELSIF p_device_key < p_ip_key THEN
    -- Orden determinista 1: p_device_key primero, luego p_ip_key
    INSERT INTO public.activation_rate_limits (key, attempts, window_start, updated_at, blocked_until)
    VALUES (
      p_device_key,
      1,
      v_now,
      v_now,
      CASE WHEN 1 >= v_max_dev THEN v_now + v_block_interval ELSE NULL END
    )
    ON CONFLICT (key) DO UPDATE
    SET
      attempts = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN 1
        WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN 1
        ELSE activation_rate_limits.attempts + 1
      END,
      window_start = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN v_now
        WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN v_now
        ELSE activation_rate_limits.window_start
      END,
      blocked_until = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until > v_now THEN activation_rate_limits.blocked_until
        WHEN (
          CASE
            WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN 1
            WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN 1
            ELSE activation_rate_limits.attempts + 1
          END
        ) >= v_max_dev THEN v_now + v_block_interval
        ELSE NULL
      END,
      updated_at = v_now
    RETURNING attempts, blocked_until INTO v_dev_attempts, v_dev_blocked_until;

    INSERT INTO public.activation_rate_limits (key, attempts, window_start, updated_at, blocked_until)
    VALUES (
      p_ip_key,
      1,
      v_now,
      v_now,
      CASE WHEN 1 >= v_max_ip THEN v_now + v_block_interval ELSE NULL END
    )
    ON CONFLICT (key) DO UPDATE
    SET
      attempts = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN 1
        WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN 1
        ELSE activation_rate_limits.attempts + 1
      END,
      window_start = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN v_now
        WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN v_now
        ELSE activation_rate_limits.window_start
      END,
      blocked_until = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until > v_now THEN activation_rate_limits.blocked_until
        WHEN (
          CASE
            WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN 1
            WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN 1
            ELSE activation_rate_limits.attempts + 1
          END
        ) >= v_max_ip THEN v_now + v_block_interval
        ELSE NULL
      END,
      updated_at = v_now
    RETURNING attempts, blocked_until INTO v_ip_attempts, v_ip_blocked_until;

  ELSE
    -- Orden determinista 2: p_ip_key primero, luego p_device_key (garantiza orden global lexicográfico)
    INSERT INTO public.activation_rate_limits (key, attempts, window_start, updated_at, blocked_until)
    VALUES (
      p_ip_key,
      1,
      v_now,
      v_now,
      CASE WHEN 1 >= v_max_ip THEN v_now + v_block_interval ELSE NULL END
    )
    ON CONFLICT (key) DO UPDATE
    SET
      attempts = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN 1
        WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN 1
        ELSE activation_rate_limits.attempts + 1
      END,
      window_start = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN v_now
        WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN v_now
        ELSE activation_rate_limits.window_start
      END,
      blocked_until = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until > v_now THEN activation_rate_limits.blocked_until
        WHEN (
          CASE
            WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN 1
            WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN 1
            ELSE activation_rate_limits.attempts + 1
          END
        ) >= v_max_ip THEN v_now + v_block_interval
        ELSE NULL
      END,
      updated_at = v_now
    RETURNING attempts, blocked_until INTO v_ip_attempts, v_ip_blocked_until;

    INSERT INTO public.activation_rate_limits (key, attempts, window_start, updated_at, blocked_until)
    VALUES (
      p_device_key,
      1,
      v_now,
      v_now,
      CASE WHEN 1 >= v_max_dev THEN v_now + v_block_interval ELSE NULL END
    )
    ON CONFLICT (key) DO UPDATE
    SET
      attempts = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN 1
        WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN 1
        ELSE activation_rate_limits.attempts + 1
      END,
      window_start = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN v_now
        WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN v_now
        ELSE activation_rate_limits.window_start
      END,
      blocked_until = CASE
        WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until > v_now THEN activation_rate_limits.blocked_until
        WHEN (
          CASE
            WHEN activation_rate_limits.blocked_until IS NOT NULL AND activation_rate_limits.blocked_until <= v_now THEN 1
            WHEN v_now - activation_rate_limits.window_start > v_window_interval THEN 1
            ELSE activation_rate_limits.attempts + 1
          END
        ) >= v_max_dev THEN v_now + v_block_interval
        ELSE NULL
      END,
      updated_at = v_now
    RETURNING attempts, blocked_until INTO v_dev_attempts, v_dev_blocked_until;
  END IF;

  -- D. Evaluar si este intento detonó un nuevo bloqueo
  IF v_dev_blocked_until IS NOT NULL AND v_dev_blocked_until > v_now THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'blocked', TRUE,
      'reason', 'device_blocked_new',
      'attempts', v_dev_attempts,
      'retry_after_seconds', CEIL(EXTRACT(EPOCH FROM (v_dev_blocked_until - v_now)))::INT
    );
  END IF;

  IF v_ip_blocked_until IS NOT NULL AND v_ip_blocked_until > v_now THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'blocked', TRUE,
      'reason', 'ip_blocked_new',
      'attempts', v_ip_attempts,
      'retry_after_seconds', CEIL(EXTRACT(EPOCH FROM (v_ip_blocked_until - v_now)))::INT
    );
  END IF;

  -- E. Intento permitido
  RETURN jsonb_build_object(
    'allowed', TRUE,
    'blocked', FALSE,
    'device_attempts', v_dev_attempts,
    'ip_attempts', v_ip_attempts
  );
END;
$$;

-- Permisos estrictos para check_and_record_activation_attempt
REVOKE ALL ON FUNCTION public.check_and_record_activation_attempt(TEXT, TEXT, INT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_activation_attempt(TEXT, TEXT, INT, INT, INT, INT) TO service_role;

COMMIT;
