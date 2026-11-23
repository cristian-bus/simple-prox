-- ==============================================================================
-- KioscoProX / Simple ProX — Script de Verificación Integral de Seguridad RLS
-- Proyecto Supabase: qtixbiikhvhzwshfgyeo
-- Fecha: 13 de Octubre de 2026
-- Objetivo: Validar permisos positivos y negativos de INSERT, UPDATE y DELETE
--           detectando accesos indebidos incluso cuando devuelven 0 filas.
-- Ubicación: supabase/manual-scripts/ (Aislado de migraciones automáticas)
-- ==============================================================================

BEGIN;

-- =============================================================================
-- CASO 1: Administrador Real Activo (user_id = 16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2)
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "16cb0a7e-db5b-442a-8ee4-bf4f44b2aee2", "role": "authenticated"}', true);

-- 1.1 Verificar que la función reconozca al administrador real
DO $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'TEST FALLIDO: Administrador real no fue reconocido como activo por is_active_admin().';
  END IF;
END $$;

-- 1.2 Inserción de fixtures de prueba por el administrador (datos exclusivamente de test)
INSERT INTO public.merchants (id, name, app_version, last_active)
VALUES ('PC-TEST-FIXTURE-TARGET', 'Comercio Fixture Original', '1.3.9', now());

INSERT INTO public.campaigns (id, title, supplier_name, whatsapp_number, status)
VALUES ('00000000-0000-0000-0000-000000000088', 'Campaña Fixture Original', 'Mayorista Central', '+5491122334455', 'active');

-- 1.3 Verificar que el administrador puede actualizar ambos fixtures
DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.merchants
  SET name = 'Comercio Fixture Modificado por Admin'
  WHERE id = 'PC-TEST-FIXTURE-TARGET';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'TEST FALLIDO: Admin no pudo actualizar registro en merchants (filas: %).', v_rows;
  END IF;

  UPDATE public.campaigns
  SET title = 'Campaña Fixture Modificada por Admin'
  WHERE id = '00000000-0000-0000-0000-000000000088';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'TEST FALLIDO: Admin no pudo actualizar registro en campaigns (filas: %).', v_rows;
  END IF;
END $$;

-- =============================================================================
-- CASO 2: Usuario Autenticado NO Administrador (sub no registrado en admin_users)
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);

-- 2.1 Verificar que NO sea reconocido como administrador
DO $$
BEGIN
  IF public.is_active_admin() THEN
    RAISE EXCEPTION 'TEST FALLIDO: Usuario no admin fue reconocido indebidamente como administrador.';
  END IF;
END $$;

-- 2.2 INSERT NEGATIVO en merchants: Debe lanzar SQLSTATE 42501 específicamente
DO $$
DECLARE
  v_inserted boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.merchants (id, name, app_version)
    VALUES ('PC-TEST-NO-AUTH', 'No Permitido', '1.3.9');
    v_inserted := true;
  EXCEPTION 
    WHEN SQLSTATE '42501' THEN
      v_inserted := false; -- Rechazado por RLS como corresponde
    WHEN OTHERS THEN
      RAISE EXCEPTION 'TEST FALLIDO: Error inesperado en INSERT merchants (no fue RLS 42501): % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;

  IF v_inserted THEN
    RAISE EXCEPTION 'VULNERABILIDAD DETECTADA: Usuario no admin pudo insertar en merchants.';
  END IF;
END $$;

-- 2.3 INSERT NEGATIVO en campaigns: Debe lanzar SQLSTATE 42501 específicamente
DO $$
DECLARE
  v_inserted boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.campaigns (title, supplier_name, whatsapp_number, status)
    VALUES ('Campaña No Autorizada', 'Mayorista No Auth', '+5491100000000', 'active');
    v_inserted := true;
  EXCEPTION 
    WHEN SQLSTATE '42501' THEN
      v_inserted := false; -- Rechazado por RLS como corresponde
    WHEN OTHERS THEN
      RAISE EXCEPTION 'TEST FALLIDO: Error inesperado en INSERT campaigns (no fue RLS 42501): % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;

  IF v_inserted THEN
    RAISE EXCEPTION 'VULNERABILIDAD DETECTADA: Usuario no admin pudo insertar en campaigns.';
  END IF;
END $$;

-- 2.4 UPDATE NEGATIVO en merchants: Debe afectar 0 filas (bloqueado por USING de RLS)
DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.merchants
  SET name = 'Intento Hackeo No Admin'
  WHERE id = 'PC-TEST-FIXTURE-TARGET';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    RAISE EXCEPTION 'VULNERABILIDAD DETECTADA: Usuario no admin pudo modificar merchant existente (filas afectadas: %).', v_rows;
  END IF;
END $$;

-- 2.5 DELETE NEGATIVO en merchants: Debe afectar 0 filas (bloqueado por USING de RLS)
DO $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.merchants
  WHERE id = 'PC-TEST-FIXTURE-TARGET';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    RAISE EXCEPTION 'VULNERABILIDAD DETECTADA: Usuario no admin pudo eliminar merchant existente (filas afectadas: %).', v_rows;
  END IF;
END $$;

-- 2.6 UPDATE NEGATIVO en campaigns: Debe afectar 0 filas (bloqueado por USING de RLS)
DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.campaigns
  SET title = 'Intento Hackeo Campaña No Admin'
  WHERE id = '00000000-0000-0000-0000-000000000088';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    RAISE EXCEPTION 'VULNERABILIDAD DETECTADA: Usuario no admin pudo modificar campaña existente (filas afectadas: %).', v_rows;
  END IF;
END $$;

-- 2.7 DELETE NEGATIVO en campaigns: Debe afectar 0 filas (bloqueado por USING de RLS)
DO $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.campaigns
  WHERE id = '00000000-0000-0000-0000-000000000088';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    RAISE EXCEPTION 'VULNERABILIDAD DETECTADA: Usuario no admin pudo eliminar campaña existente (filas afectadas: %).', v_rows;
  END IF;
END $$;

-- =============================================================================
-- CASO 3: Usuario Anónimo / Terminal POS Cliente (rol anon)
-- =============================================================================
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);

-- 3.1 LECTURA DE CAMPAÑAS POR EL POS: Autorizada independientemente de si hay filas
DO $$
BEGIN
  PERFORM id, title FROM public.campaigns LIMIT 1;
END $$;

-- 3.2 INSERT NEGATIVO en merchants: Debe lanzar SQLSTATE 42501
DO $$
DECLARE
  v_inserted boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.merchants (id, name, app_version)
    VALUES ('PC-TEST-ANON', 'No Permitido', '1.3.9');
    v_inserted := true;
  EXCEPTION 
    WHEN SQLSTATE '42501' THEN
      v_inserted := false; -- Rechazado por RLS como corresponde
    WHEN OTHERS THEN
      RAISE EXCEPTION 'TEST FALLIDO: Error inesperado en INSERT anon merchants (no fue RLS 42501): % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;

  IF v_inserted THEN
    RAISE EXCEPTION 'VULNERABILIDAD DETECTADA: Usuario anónimo pudo insertar en merchants.';
  END IF;
END $$;

-- 3.3 INSERT NEGATIVO en campaigns: Debe lanzar SQLSTATE 42501
DO $$
DECLARE
  v_inserted boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.campaigns (title, supplier_name, whatsapp_number, status)
    VALUES ('Campaña Anon', 'Mayorista Anon', '+5491100000000', 'active');
    v_inserted := true;
  EXCEPTION 
    WHEN SQLSTATE '42501' THEN
      v_inserted := false; -- Rechazado por RLS como corresponde
    WHEN OTHERS THEN
      RAISE EXCEPTION 'TEST FALLIDO: Error inesperado en INSERT anon campaigns (no fue RLS 42501): % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;

  IF v_inserted THEN
    RAISE EXCEPTION 'VULNERABILIDAD DETECTADA: Usuario anónimo pudo insertar en campaigns.';
  END IF;
END $$;

-- 3.4 UPDATE NEGATIVO en merchants: Debe afectar 0 filas
DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.merchants
  SET name = 'Intento Hackeo Anon'
  WHERE id = 'PC-TEST-FIXTURE-TARGET';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    RAISE EXCEPTION 'VULNERABILIDAD DETECTADA: Usuario anónimo pudo modificar merchant existente (filas afectadas: %).', v_rows;
  END IF;
END $$;

-- 3.5 DELETE NEGATIVO en merchants: Debe afectar 0 filas
DO $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.merchants
  WHERE id = 'PC-TEST-FIXTURE-TARGET';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    RAISE EXCEPTION 'VULNERABILIDAD DETECTADA: Usuario anónimo pudo eliminar merchant existente (filas afectadas: %).', v_rows;
  END IF;
END $$;

-- 3.6 UPDATE NEGATIVO en campaigns: Debe afectar 0 filas
DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.campaigns
  SET title = 'Intento Hackeo Campaña Anon'
  WHERE id = '00000000-0000-0000-0000-000000000088';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    RAISE EXCEPTION 'VULNERABILIDAD DETECTADA: Usuario anónimo pudo modificar campaña existente (filas afectadas: %).', v_rows;
  END IF;
END $$;

-- 3.7 DELETE NEGATIVO en campaigns: Debe afectar 0 filas
DO $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.campaigns
  WHERE id = '00000000-0000-0000-0000-000000000088';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    RAISE EXCEPTION 'VULNERABILIDAD DETECTADA: Usuario anónimo pudo eliminar campaña existente (filas afectadas: %).', v_rows;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. VERIFICACIÓN FINAL DE INTEGRIDAD DE FIXTURES
-- -----------------------------------------------------------------------------
-- Confirmar que los registros siguen existiendo en la tabla y no fueron eliminados
RESET ROLE;
RESET "request.jwt.claims";

DO $$
BEGIN
  PERFORM 1 FROM public.merchants WHERE id = 'PC-TEST-FIXTURE-TARGET';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SANITY FAIL: El fixture de merchants desapareció durante las pruebas.';
  END IF;

  PERFORM 1 FROM public.campaigns WHERE id = '00000000-0000-0000-0000-000000000088';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SANITY FAIL: El fixture de campaigns desapareció durante las pruebas.';
  END IF;
END $$;

-- ROLLBACK OBLIGATORIO: Garantiza que ninguna fila de prueba persista en la base de datos
ROLLBACK;
