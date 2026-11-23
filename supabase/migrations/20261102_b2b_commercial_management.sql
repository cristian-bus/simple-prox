-- ==============================================================================
-- KioscoProX / Simple ProX — Migración Atómica: Gestión Comercial B2B
-- Archivo: 20261102_b2b_commercial_management.sql
-- Módulo: Mayoristas, Acuerdos Publicitarios, Cuotas y Cobranzas
-- Versión compatible: Simple ProX 1.3.10
-- Modo: BORRADOR LOCAL — NO EJECUTAR EN SUPABASE PRODUCCIÓN HASTA AUTORIZACIÓN
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLA: public.distributors (Directorio de Mayoristas / Anunciantes)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.distributors (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  legal_name TEXT,
  cuit TEXT,
  contact_name TEXT,
  phone TEXT,
  whatsapp_number TEXT NOT NULL,
  email TEXT,
  province_code TEXT DEFAULT 'ALL',
  city TEXT,
  address TEXT,
  category TEXT DEFAULT 'General',
  min_purchase NUMERIC(12,2) DEFAULT 0.00 CHECK (min_purchase >= 0),
  conditions TEXT,
  record_type TEXT NOT NULL DEFAULT 'contracted' CHECK (record_type IN ('contracted', 'catalog_example', 'prospect')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'inactive', 'lead')),
  commercial_start_date DATE,
  notes TEXT,
  deleted BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.distributors IS 'Directorio de mayoristas, anunciantes B2B y registros de catálogo para Simple ProX';

-- ==============================================================================
-- 2. TABLA: public.distributor_contracts (Contratos y Acuerdos Comerciales B2B)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.distributor_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id TEXT NOT NULL REFERENCES public.distributors(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  advertising_package TEXT,
  contract_amount NUMERIC(12,2) NOT NULL CHECK (contract_amount >= 0),
  start_date DATE NOT NULL,
  end_date DATE,
  billing_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_frequency IN ('monthly', 'quarterly', 'semiannual', 'annual', 'one_time')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'finished', 'cancelled')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.distributor_contracts IS 'Acuerdos comerciales y pautas publicitarias contratadas por cada mayorista';

-- ==============================================================================
-- 3. TABLA: public.distributor_invoices (Cuotas y Períodos de Cobro)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.distributor_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES public.distributor_contracts(id) ON DELETE RESTRICT,
  distributor_id TEXT NOT NULL REFERENCES public.distributors(id) ON DELETE RESTRICT,
  period_label TEXT NOT NULL,
  due_date DATE NOT NULL,
  amount_original NUMERIC(12,2) NOT NULL CHECK (amount_original > 0),
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0 AND amount_paid <= amount_original),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.distributor_invoices IS 'Control administrativo de cuotas, períodos y vencimientos a cobrar a los mayoristas';

-- ==============================================================================
-- 4. TABLA: public.distributor_payments (Historial de Pagos y Cobranzas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.distributor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.distributor_invoices(id) ON DELETE RESTRICT,
  distributor_id TEXT NOT NULL REFERENCES public.distributors(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'transferencia' CHECK (payment_method IN ('transferencia', 'efectivo', 'cheque', 'otro')),
  reference_code TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.distributor_payments IS 'Registro inmutable de cobranzas efectivas asociadas a cuotas publicitarias con idempotencia estricta';

-- ==============================================================================
-- 5. VÍNCULO RETROCOMPATIBLE CON public.campaigns
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'distributor_id'
  ) THEN
    ALTER TABLE public.campaigns ADD COLUMN distributor_id TEXT REFERENCES public.distributors(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ==============================================================================
-- 6. TRIGGER DE INTEGRIDAD CONTABLE EN CUOTAS (Anti-Manipulación de amount_paid)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_enforce_invoice_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- A. En inserción: obligar a que nazca con amount_paid = 0 y status = 'pending'
  IF TG_OP = 'INSERT' THEN
    IF NEW.amount_original IS NULL OR NEW.amount_original <= 0 THEN
      RAISE EXCEPTION 'Violación de Integridad Contable: El importe original debe ser estrictamente mayor a 0.';
    END IF;
    NEW.amount_paid := 0.00;
    NEW.status := 'pending';
    RETURN NEW;
  END IF;

  -- B. En actualización: blindar amount_paid, amount_original y status contra mutación directa vía API
  IF TG_OP = 'UPDATE' THEN
    -- amount_original no puede ser menor a lo ya pagado ni menor o igual a cero
    IF NEW.amount_original IS NULL OR NEW.amount_original <= 0 THEN
      RAISE EXCEPTION 'Violación de Integridad Contable: El importe original debe ser estrictamente mayor a 0.';
    END IF;
    IF NEW.amount_original < OLD.amount_paid THEN
      RAISE EXCEPTION 'Violación de Integridad Contable: El importe original (% ARS) no puede ser inferior al total ya cobrado (% ARS).', NEW.amount_original, OLD.amount_paid;
    END IF;

    -- amount_paid NUNCA puede modificarse directamente por API (solo por trigger interno de pago depth > 1)
    IF (NEW.amount_paid IS DISTINCT FROM OLD.amount_paid) THEN
      IF pg_trigger_depth() <= 1 THEN
        RAISE EXCEPTION 'Violación de Integridad Contable: amount_paid no puede modificarse directamente. Debe registrarse un cobro en distributor_payments.';
      END IF;
    END IF;

    -- status solo puede mutar desde trigger de pago, o por vencimiento real legítimo, o por cancelación sin pagos
    IF (NEW.status IS DISTINCT FROM OLD.status) THEN
      IF pg_trigger_depth() <= 1 THEN
        IF NEW.status = 'overdue' AND (NEW.due_date < CURRENT_DATE OR OLD.due_date < CURRENT_DATE) AND OLD.amount_paid < OLD.amount_original THEN
          -- Vencimiento legítimo por fecha expirada
          NULL;
        ELSIF NEW.status = 'cancelled' AND OLD.amount_paid = 0 THEN
          -- Cancelación permitida únicamente si la cuota no tiene pagos registrados
          NULL;
        ELSE
          RAISE EXCEPTION 'Violación de Integridad Contable: el estado (%) no puede asignarse manualmente sin la operación de cobro correspondiente.', NEW.status;
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_integrity ON public.distributor_invoices;
CREATE TRIGGER trg_enforce_invoice_integrity
  BEFORE INSERT OR UPDATE ON public.distributor_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_invoice_integrity();

-- ==============================================================================
-- 7. TRIGGER DE PROCESAMIENTO ATÓMICO DE PAGO Y ACTUALIZACIÓN DE SALDO
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_process_distributor_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv RECORD;
  v_new_paid NUMERIC(12,2);
  v_new_status TEXT;
BEGIN
  -- Validar clave de idempotencia antes de verificar saldos para responder con precisión ante reintentos
  IF EXISTS (SELECT 1 FROM public.distributor_payments WHERE idempotency_key = NEW.idempotency_key) THEN
    RAISE EXCEPTION 'Operación duplicada: Ya existe un cobro registrado con la clave de idempotencia %.', NEW.idempotency_key;
  END IF;

  -- Bloqueo pesimista de fila (FOR UPDATE) para serializar pagos concurrentes
  SELECT * INTO v_inv FROM public.distributor_invoices
  WHERE id = NEW.invoice_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuota/Factura % inexistente.', NEW.invoice_id;
  END IF;

  -- Validar que el pago no supere el saldo remanente
  IF (v_inv.amount_paid + NEW.amount) > v_inv.amount_original THEN
    RAISE EXCEPTION 'Monto inválido: El pago de % supera el saldo pendiente de % (Original: %, Pagado antes: %).',
      NEW.amount, (v_inv.amount_original - v_inv.amount_paid), v_inv.amount_original, v_inv.amount_paid;
  END IF;

  v_new_paid := v_inv.amount_paid + NEW.amount;

  -- Determinar estado exacto tras el pago
  IF v_new_paid >= v_inv.amount_original THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partial';
  END IF;

  -- Asignar usuario responsable si está disponible
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  -- Actualizar cuota de manera atómica (esta actualización se ejecuta con trigger depth = 2, superando la guardia)
  UPDATE public.distributor_invoices
  SET amount_paid = v_new_paid,
      status = v_new_status,
      updated_at = timezone('utc'::text, now())
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_process_distributor_payment ON public.distributor_payments;
CREATE TRIGGER trg_process_distributor_payment
  BEFORE INSERT ON public.distributor_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_process_distributor_payment();

-- ==============================================================================
-- 8. FUNCIÓN DE RECALCULO DE CUOTAS VENCIDAS (Mantenimiento Administrativo)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_check_overdue_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  -- Validar privilegios administrativos antes de proceder
  IF current_user NOT IN ('service_role', 'postgres') THEN
    IF NOT public.is_active_admin() THEN
      RAISE EXCEPTION 'Acceso denegado: se requieren privilegios administrativos para ejecutar el mantenimiento de cuotas.';
    END IF;
  END IF;

  UPDATE public.distributor_invoices
  SET status = 'overdue',
      updated_at = timezone('utc'::text, now())
  WHERE status IN ('pending', 'partial')
    AND due_date < CURRENT_DATE
    AND amount_paid < amount_original;
    
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- ==============================================================================
-- 9. POLÍTICAS DE SEGURIDAD (RLS) ESTRICTAS
-- ==============================================================================
ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributor_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributor_payments ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas previas si existieran
DROP POLICY IF EXISTS "distributors_admin_select" ON public.distributors;
DROP POLICY IF EXISTS "distributors_admin_insert" ON public.distributors;
DROP POLICY IF EXISTS "distributors_admin_update" ON public.distributors;
DROP POLICY IF EXISTS "distributors_admin_delete" ON public.distributors;

DROP POLICY IF EXISTS "contracts_admin_select" ON public.distributor_contracts;
DROP POLICY IF EXISTS "contracts_admin_insert" ON public.distributor_contracts;
DROP POLICY IF EXISTS "contracts_admin_update" ON public.distributor_contracts;
DROP POLICY IF EXISTS "contracts_admin_delete" ON public.distributor_contracts;

DROP POLICY IF EXISTS "invoices_admin_select" ON public.distributor_invoices;
DROP POLICY IF EXISTS "invoices_admin_insert" ON public.distributor_invoices;
DROP POLICY IF EXISTS "invoices_admin_update" ON public.distributor_invoices;
DROP POLICY IF EXISTS "invoices_admin_delete" ON public.distributor_invoices;

DROP POLICY IF EXISTS "payments_admin_select" ON public.distributor_payments;
DROP POLICY IF EXISTS "payments_admin_insert" ON public.distributor_payments;

-- A. DISTRIBUTORS
CREATE POLICY "distributors_admin_select" ON public.distributors
  FOR SELECT TO authenticated
  USING (public.is_active_admin());

CREATE POLICY "distributors_admin_insert" ON public.distributors
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());

CREATE POLICY "distributors_admin_update" ON public.distributors
  FOR UPDATE TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE POLICY "distributors_admin_delete" ON public.distributors
  FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- B. CONTRACTS
CREATE POLICY "contracts_admin_select" ON public.distributor_contracts
  FOR SELECT TO authenticated
  USING (public.is_active_admin());

CREATE POLICY "contracts_admin_insert" ON public.distributor_contracts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());

CREATE POLICY "contracts_admin_update" ON public.distributor_contracts
  FOR UPDATE TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- C. INVOICES
CREATE POLICY "invoices_admin_select" ON public.distributor_invoices
  FOR SELECT TO authenticated
  USING (public.is_active_admin());

CREATE POLICY "invoices_admin_insert" ON public.distributor_invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());

CREATE POLICY "invoices_admin_update" ON public.distributor_invoices
  FOR UPDATE TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- D. PAYMENTS (Inmutables: solo lectura e inserción)
CREATE POLICY "payments_admin_select" ON public.distributor_payments
  FOR SELECT TO authenticated
  USING (public.is_active_admin());

CREATE POLICY "payments_admin_insert" ON public.distributor_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());

-- ==============================================================================
-- 10. REVOCACIÓN TOTAL A USUARIOS PÚBLICOS / ANÓNIMOS Y BLINDAJE DE FUNCIONES
-- ==============================================================================
REVOKE ALL ON public.distributors FROM anon;
REVOKE ALL ON public.distributor_contracts FROM anon;
REVOKE ALL ON public.distributor_invoices FROM anon;
REVOKE ALL ON public.distributor_payments FROM anon;

REVOKE TRUNCATE, TRIGGER ON public.distributors FROM authenticated, anon;
REVOKE TRUNCATE, TRIGGER ON public.distributor_contracts FROM authenticated, anon;
REVOKE TRUNCATE, TRIGGER ON public.distributor_invoices FROM authenticated, anon;
REVOKE TRUNCATE, TRIGGER, UPDATE, DELETE ON public.distributor_payments FROM authenticated, anon;

-- Revocar permisos de ejecución (EXECUTE) de todas las funciones SECURITY DEFINER a PUBLIC, anon y authenticated
REVOKE ALL ON FUNCTION public.fn_enforce_invoice_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_process_distributor_payment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_check_overdue_invoices() FROM PUBLIC, anon, authenticated;

-- Solo service_role y authenticated legítimo (con chequeo interno is_active_admin()) pueden ejecutar fn_check_overdue_invoices
GRANT EXECUTE ON FUNCTION public.fn_check_overdue_invoices() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_check_overdue_invoices() TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distributors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distributor_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distributor_invoices TO authenticated;
GRANT SELECT, INSERT ON public.distributor_payments TO authenticated;

COMMIT;
