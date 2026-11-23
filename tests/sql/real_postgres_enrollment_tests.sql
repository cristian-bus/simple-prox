-- ==============================================================================
-- KioscoProX / Simple ProX — Pruebas Automatizadas en PostgreSQL Real Aislado
-- Archivo: tests/sql/real_postgres_enrollment_tests.sql
-- ==============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1. SETUP DE ROLES SUPABASE
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
END $$;

-- 2. SETUP DE TABLAS BASE (Esquema real)
CREATE TABLE IF NOT EXISTS public.terminal_identities (
  installation_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  commerce_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchants (
  id TEXT PRIMARY KEY,
  installation_id TEXT,
  commerce_id TEXT,
  name TEXT,
  address TEXT,
  phone TEXT,
  installer TEXT,
  status TEXT DEFAULT 'active',
  app_version TEXT DEFAULT '1.3.9',
  last_active TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMIT;

-- 3. APLICAR MIGRACIÓN RPC
\i /workspace/supabase/migrations/20261020_enroll_terminal_license_rpc.sql

-- 4. EJECUCIÓN DE PRUEBAS UNITARIAS EN POSTGRESQL REAL
DO $$
DECLARE
  v_res JSONB;
  v_row RECORD;
  v_perm_anon BOOLEAN;
  v_perm_service BOOLEAN;
BEGIN
  RAISE NOTICE '--- INICIANDO PRUEBAS EN POSTGRESQL REAL ---';

  -- TEST 1: Primer enrolamiento legítimo
  v_res := public.enroll_terminal_with_license(
    'TERM-REAL-01',
    'hash_original_01',
    '{"storeName": "Kiosco Real 1", "address": "Calle Falsa 123", "phone": "112233"}'::jsonb,
    false
  );
  IF (v_res->>'success')::boolean != true OR (v_res->>'action') != 'first_enrollment' THEN
    RAISE EXCEPTION 'TEST 1 FALLÓ: Primer enrolamiento no tuvo éxito: %', v_res;
  END IF;

  SELECT * INTO v_row FROM public.terminal_identities WHERE installation_id = 'TERM-REAL-01';
  IF v_row.status != 'active' OR v_row.token_hash != 'hash_original_01' THEN
    RAISE EXCEPTION 'TEST 1 FALLÓ: terminal_identities no guardó los datos correctos';
  END IF;
  RAISE NOTICE '✅ [TEST 1 REAL PASS] Primer enrolamiento legítimo exitoso.';

  -- TEST 2: Intento de rotación NO autorizada con credencial activa (allow_rotation = false)
  v_res := public.enroll_terminal_with_license(
    'TERM-REAL-01',
    'hash_atacante_02',
    '{}'::jsonb,
    false
  );
  IF (v_res->>'success')::boolean != false OR (v_res->>'code') != 'ALREADY_ENROLLED' THEN
    RAISE EXCEPTION 'TEST 2 FALLÓ: No se bloqueó la rotación no autorizada: %', v_res;
  END IF;

  SELECT * INTO v_row FROM public.terminal_identities WHERE installation_id = 'TERM-REAL-01';
  IF v_row.token_hash != 'hash_original_01' THEN
    RAISE EXCEPTION 'TEST 2 FALLÓ: La credencial original fue sobrescrita indebidamente!';
  END IF;
  RAISE NOTICE '✅ [TEST 2 REAL PASS] Bloqueo estricto de rotación no autorizada (ALREADY_ENROLLED).';

  -- TEST 3: Rotación autorizada administrativamente (allow_rotation = true)
  v_res := public.enroll_terminal_with_license(
    'TERM-REAL-01',
    'hash_rotado_autorizado_03',
    '{}'::jsonb,
    true
  );
  IF (v_res->>'success')::boolean != true OR (v_res->>'action') != 'credential_rotated' THEN
    RAISE EXCEPTION 'TEST 3 FALLÓ: Rotación autorizada falló: %', v_res;
  END IF;

  SELECT * INTO v_row FROM public.terminal_identities WHERE installation_id = 'TERM-REAL-01';
  IF v_row.token_hash != 'hash_rotado_autorizado_03' THEN
    RAISE EXCEPTION 'TEST 3 FALLÓ: La credencial no fue actualizada en rotación autorizada';
  END IF;
  RAISE NOTICE '✅ [TEST 3 REAL PASS] Rotación autorizada exitosa sin duplicación de filas.';

  -- TEST 4: Terminal revocada (Fail-Closed)
  INSERT INTO public.terminal_identities (installation_id, token_hash, status)
  VALUES ('TERM-REVOKED-01', 'hash_rev', 'revoked');

  v_res := public.enroll_terminal_with_license('TERM-REVOKED-01', 'new_hash', '{}'::jsonb, true);
  IF (v_res->>'success')::boolean != false OR (v_res->>'code') != 'TERMINAL_REVOKED' THEN
    RAISE EXCEPTION 'TEST 4 FALLÓ: Terminal revocada no fue bloqueada: %', v_res;
  END IF;
  RAISE NOTICE '✅ [TEST 4 REAL PASS] Terminal revocada bloqueada categóricamente.';

  -- TEST 5: Terminal suspendida (Fail-Closed)
  INSERT INTO public.terminal_identities (installation_id, token_hash, status)
  VALUES ('TERM-SUSPENDED-01', 'hash_susp', 'suspended');

  v_res := public.enroll_terminal_with_license('TERM-SUSPENDED-01', 'new_hash', '{}'::jsonb, false);
  IF (v_res->>'success')::boolean != false OR (v_res->>'code') != 'TERMINAL_REVOKED' THEN
    RAISE EXCEPTION 'TEST 5 FALLÓ: Terminal suspendida no fue bloqueada: %', v_res;
  END IF;
  RAISE NOTICE '✅ [TEST 5 REAL PASS] Terminal suspendida bloqueada categóricamente.';

  -- TEST 6: Preservación de datos comerciales en merchants
  -- Simular comercio pre-existente con datos cargados por admin
  INSERT INTO public.merchants (id, installation_id, commerce_id, name, address, phone, installer)
  VALUES ('TERM-MERCHANT-01', 'TERM-MERCHANT-01', 'COMM-01', 'Comercio Previo Don Tito', 'Ruta 2 Km 40', '0221-555', 'Instalador Norte');

  -- Enrolar terminal enviando datos vacíos o genéricos
  v_res := public.enroll_terminal_with_license(
    'TERM-MERCHANT-01',
    'hash_merch_01',
    '{"storeName": "", "address": null, "phone": null}'::jsonb,
    false
  );
  IF (v_res->>'success')::boolean != true THEN
    RAISE EXCEPTION 'TEST 6 FALLÓ: Enrolamiento de comercio falló: %', v_res;
  END IF;

  SELECT * INTO v_row FROM public.merchants WHERE id = 'TERM-MERCHANT-01';
  IF v_row.name != 'Comercio Previo Don Tito' OR v_row.address != 'Ruta 2 Km 40' OR v_row.phone != '0221-555' THEN
    RAISE EXCEPTION 'TEST 6 FALLÓ: Datos existentes en merchants fueron sobrescritos con null/vacío!';
  END IF;
  RAISE NOTICE '✅ [TEST 6 REAL PASS] Datos comerciales en merchants preservados intactos.';

  -- TEST 7: Verificación de permisos EXECUTE
  SELECT has_function_privilege('anon', 'public.enroll_terminal_with_license(TEXT, TEXT, JSONB, BOOLEAN)', 'EXECUTE')
  INTO v_perm_anon;
  
  SELECT has_function_privilege('service_role', 'public.enroll_terminal_with_license(TEXT, TEXT, JSONB, BOOLEAN)', 'EXECUTE')
  INTO v_perm_service;

  IF v_perm_anon = true THEN
    RAISE EXCEPTION 'TEST 7 FALLÓ: Rol anon tiene permisos EXECUTE en la función!';
  END IF;
  IF v_perm_service != true THEN
    RAISE EXCEPTION 'TEST 7 FALLÓ: Rol service_role no tiene permisos EXECUTE en la función!';
  END IF;
  RAISE NOTICE '✅ [TEST 7 REAL PASS] Permisos estrictos: denegado a anon, otorgado solo a service_role.';

  RAISE NOTICE '--- TODAS LAS PRUEBAS DE POSTGRESQL REAL PASARON ---';
END $$;

-- TEST 8: PROBAR ROLLBACK
\i /workspace/supabase/migrations/20261020_enroll_terminal_license_rpc_ROLLBACK.sql

DO $$
BEGIN
  IF to_regprocedure('public.enroll_terminal_with_license(TEXT, TEXT, JSONB, BOOLEAN)') IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 8 FALLÓ: El script de rollback no eliminó la función!';
  END IF;
  RAISE NOTICE '✅ [TEST 8 REAL PASS] Rollback ejecutado correctamente, función eliminada con éxito.';
END $$;
