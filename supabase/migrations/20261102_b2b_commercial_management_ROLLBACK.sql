-- ==============================================================================
-- KioscoProX / Simple ProX — Rollback No Destructivo: Gestión Comercial B2B
-- Archivo: 20261102_b2b_commercial_management_ROLLBACK.sql
-- Módulo: Mayoristas, Acuerdos Publicitarios, Cuotas y Cobranzas
-- Modo: SEGURO — NO DESTRUCTIVO (Preserva datos si existen registros financieros)
-- ==============================================================================

BEGIN;

-- 1. Verificación de Seguridad Previa:
-- Si ya existen pagos o cuotas registradas, ABORTAR para impedir pérdida accidental de información financiera
DO $$
DECLARE
  v_has_payments BOOLEAN := false;
  v_has_invoices BOOLEAN := false;
  v_has_contracts BOOLEAN := false;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'distributor_payments') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.distributor_payments LIMIT 1)' INTO v_has_payments;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'distributor_invoices') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.distributor_invoices LIMIT 1)' INTO v_has_invoices;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'distributor_contracts') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.distributor_contracts LIMIT 1)' INTO v_has_contracts;
  END IF;

  IF v_has_payments OR v_has_invoices OR v_has_contracts THEN
    RAISE EXCEPTION 'ROLLBACK ABORTADO POR SEGURIDAD: Existen registros financieros o comerciales en las tablas B2B. No se ejecutará DROP para preservar la información contable.';
  END IF;
END $$;

-- 2. Eliminar Triggers y Funciones de forma segura
DROP TRIGGER IF EXISTS trg_enforce_invoice_integrity ON public.distributor_invoices;
DROP FUNCTION IF EXISTS public.fn_enforce_invoice_integrity();
DROP TRIGGER IF EXISTS trg_process_distributor_payment ON public.distributor_payments;
DROP FUNCTION IF EXISTS public.fn_process_distributor_payment();
DROP FUNCTION IF EXISTS public.fn_check_overdue_invoices();

-- 3. Eliminar Políticas RLS
DROP POLICY IF EXISTS "payments_admin_insert" ON public.distributor_payments;
DROP POLICY IF EXISTS "payments_admin_select" ON public.distributor_payments;
DROP POLICY IF EXISTS "invoices_admin_update" ON public.distributor_invoices;
DROP POLICY IF EXISTS "invoices_admin_insert" ON public.distributor_invoices;
DROP POLICY IF EXISTS "invoices_admin_select" ON public.distributor_invoices;
DROP POLICY IF EXISTS "contracts_admin_delete" ON public.distributor_contracts;
DROP POLICY IF EXISTS "contracts_admin_update" ON public.distributor_contracts;
DROP POLICY IF EXISTS "contracts_admin_insert" ON public.distributor_contracts;
DROP POLICY IF EXISTS "contracts_admin_select" ON public.distributor_contracts;
DROP POLICY IF EXISTS "distributors_admin_delete" ON public.distributors;
DROP POLICY IF EXISTS "distributors_admin_update" ON public.distributors;
DROP POLICY IF EXISTS "distributors_admin_insert" ON public.distributors;
DROP POLICY IF EXISTS "distributors_admin_select" ON public.distributors;

-- 4. Eliminar Tablas ÚNICAMENTE si no contienen datos (seguro porque el bloque previo ya validó que están vacías)
-- Desvincular clave foránea en campaigns preservando la columna distributor_id
ALTER TABLE IF EXISTS public.campaigns DROP CONSTRAINT IF EXISTS campaigns_distributor_id_fkey;

DROP TABLE IF EXISTS public.distributor_payments;
DROP TABLE IF EXISTS public.distributor_invoices;
DROP TABLE IF EXISTS public.distributor_contracts;
DROP TABLE IF EXISTS public.distributors;

-- 5. Preservar columna distributor_id en campaigns para evitar romper referencias en clientes
-- (No se elimina la columna de campaigns, manteniendo retrocompatibilidad total)

COMMIT;
