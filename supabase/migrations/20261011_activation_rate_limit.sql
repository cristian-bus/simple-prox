-- ==============================================================================
-- KioscoProX / Simple ProX — Migración de Límite de Intentos Distribuido
-- ARCHIVO: supabase/migrations/20261011_activation_rate_limit.sql
-- ESTADO: PREPARADO — NO EJECUTAR EN PRODUCCIÓN SIN AUTORIZACIÓN EXPLÍCITA
-- ==============================================================================

BEGIN;

-- 1. TABLA DE CONTROL DE INTENTOS DE ACTIVACIÓN (Totalmente Privada)
CREATE TABLE IF NOT EXISTS public.activation_rate_limits (
  key TEXT PRIMARY KEY,                       -- Clave hasheada ('dev:<hash>' o 'ip:<hash>')
  attempts INT NOT NULL DEFAULT 1,            -- Contador de intentos en la ventana actual
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(), -- Inicio de la ventana de tiempo
  blocked_until TIMESTAMPTZ DEFAULT NULL,     -- Timestamp hasta el cual está bloqueado
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now() -- Última actualización
);

-- 2. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.activation_rate_limits ENABLE ROW LEVEL SECURITY;

-- 3. AISLAMIENTO ESTRICTO DE ACCESOS
-- Revocar todos los permisos a roles públicos y clientes PostgREST anónimos/autenticados
REVOKE ALL ON TABLE public.activation_rate_limits FROM PUBLIC, anon, authenticated;
-- Acceso exclusivo al backend de confianza (Edge Function vía service_role)
GRANT ALL ON TABLE public.activation_rate_limits TO service_role;

COMMENT ON TABLE public.activation_rate_limits IS 'Almacén distribuido para prevención de fuerza bruta en activación remota';

-- 4. FUNCIÓN PARA LIMPIEZA SEGURA DE REGISTROS ANTIGUOS EXPIRADOS
-- Sin extensiones adicionales (pg_cron), sin daemons ni tareas programadas
CREATE OR REPLACE FUNCTION public.clean_expired_activation_rate_limits(
  p_older_than_seconds INT DEFAULT 86400
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted_count INT;
  v_now TIMESTAMPTZ := clock_timestamp();
  -- Forzar al menos 1 hora de antigüedad (3600s) para evitar purgas prematuras accidentales
  v_safe_retention_secs INT := GREATEST(COALESCE(p_older_than_seconds, 86400), 3600);
  v_cutoff TIMESTAMPTZ := v_now - make_interval(secs => v_safe_retention_secs);
BEGIN
  WITH deleted AS (
    DELETE FROM public.activation_rate_limits
    WHERE
      -- Condición 1: Nunca borrar si el bloqueo sigue vigente en este instante
      (blocked_until IS NULL OR blocked_until <= v_now)
      -- Condición 2: La última actividad (updated_at) debe ser anterior al umbral de corte
      AND updated_at < v_cutoff
      -- Condición 3: Tanto el bloqueo (si hubo) como la ventana deben haber expirado antes del corte
      AND (
        (blocked_until IS NOT NULL AND blocked_until < v_cutoff)
        OR
        (blocked_until IS NULL AND window_start < v_cutoff)
      )
    RETURNING key
  )
  SELECT count(*) INTO v_deleted_count FROM deleted;

  RETURN v_deleted_count;
END;
$$;

-- 5. FUNCIÓN ATÓMICA DE RATE LIMITING (Soporta alta concurrencia y previene deadlocks)
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

-- 6. FUNCIÓN PARA LIMPIAR CONTADOR DE DISPOSITIVO TRAS ACTIVACIÓN EXITOSA
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

-- 7. PROTECCIÓN DE FUNCIONES RPC
REVOKE ALL ON FUNCTION public.clean_expired_activation_rate_limits(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clean_expired_activation_rate_limits(INT) TO service_role;

REVOKE ALL ON FUNCTION public.check_and_record_activation_attempt(TEXT, TEXT, INT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_activation_attempt(TEXT, TEXT, INT, INT, INT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.clear_activation_rate_limit(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_activation_rate_limit(TEXT) TO service_role;

COMMIT;

