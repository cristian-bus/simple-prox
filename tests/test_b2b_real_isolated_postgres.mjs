/**
 * SIMPLE PROX — VALIDACIÓN INTEGRADA REAL DEL MÓDULO COMERCIAL B2B
 * EJECUCIÓN AISLADA EN CONTENEDOR DOCKER POSTGRESQL TEMPORAL (FASE 5D.4)
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTAINER_NAME = 'spx_b2b_isolated_test_pg';
const DB_NAME = 'spx_b2b_test_db';
const DB_USER = 'postgres';
const DB_PASS = 'spx_test_secret_pass';

console.log('================================================================');
console.log('FASE 5D.4: VALIDACIÓN INTEGRADA B2B SOBRE POSTGRESQL AISLADO');
console.log('Contenedor Efímero:', CONTAINER_NAME);
console.log('Base de Datos:', DB_NAME);
console.log('================================================================\n');

function runPsql(sql, user = DB_USER, role = null) {
  let fullSql = '';
  if (role) {
    fullSql += `SET ROLE ${role};\n`;
  }
  fullSql += sql;

  try {
    const res = execSync(`docker exec -i ${CONTAINER_NAME} psql -U ${user} -d ${DB_NAME} -v ON_ERROR_STOP=1`, {
      input: fullSql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output: res.trim() };
  } catch (err) {
    return {
      success: false,
      error: (err.stderr || err.message || '').toString().trim(),
      output: (err.stdout || '').toString().trim()
    };
  }
}

function runParallelPsql(sql1, sql2) {
  const p1 = new Promise((resolve) => {
    const child = spawn('docker', ['exec', '-i', CONTAINER_NAME, 'psql', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1']);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.stdin.write(sql1);
    child.stdin.end();
  });

  const p2 = new Promise((resolve) => {
    const child = spawn('docker', ['exec', '-i', CONTAINER_NAME, 'psql', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1']);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.stdin.write(sql2);
    child.stdin.end();
  });

  return Promise.all([p1, p2]);
}

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assertTest(name, condition, details = '') {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ [PASS] ${name}`);
  } else {
    failedAssertions++;
    console.error(`  ❌ [FAIL] ${name}`);
    if (details) console.error(`     Detalles: ${details}`);
  }
}

async function main() {
  try {
    // 1. Limpieza preventiva y creación del contenedor
    console.log('1. PREPARACIÓN DEL CONTENEDOR TEMPORAL AISLADO...');
    try {
      execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'pipe' });
    } catch (e) {}

    console.log('   Iniciando contenedor postgres:16-alpine...');
    execSync(`docker run -d --name ${CONTAINER_NAME} -e POSTGRES_PASSWORD=${DB_PASS} -e POSTGRES_DB=${DB_NAME} postgres:16-alpine`, { stdio: 'pipe' });

    // Esperar a que PostgreSQL acepte conexiones
    let ready = false;
    for (let i = 0; i < 20; i++) {
      try {
        execSync(`docker exec -i ${CONTAINER_NAME} pg_isready -U ${DB_USER} -d ${DB_NAME}`, { stdio: 'pipe' });
        ready = true;
        break;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    if (!ready) {
      throw new Error('PostgreSQL no respondió a pg_isready a tiempo.');
    }
    console.log('   PostgreSQL temporal listo y escuchando en el contenedor aislado.');

    // 2. Inicializar entorno compatible con Supabase (auth, roles, campaigns)
    console.log('\n2. INICIALIZANDO ROLES Y DEPENDENCIAS DE SUPABASE...');
    const setupBaseSql = `
      -- Roles estándar de Supabase
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
      END $$;

      -- Schema auth y tabla auth.users
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Función auth.uid() simulada
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS UUID
      LANGUAGE sql STABLE
      AS $$
        SELECT COALESCE(
          current_setting('request.jwt.claim.sub', true)::uuid,
          '11111111-1111-4111-a111-111111111111'::uuid
        );
      $$;

      -- Función is_active_admin()
      CREATE OR REPLACE FUNCTION public.is_active_admin()
      RETURNS BOOLEAN
      LANGUAGE sql STABLE
      AS $$
        SELECT true;
      $$;

      -- Tabla base campaigns (preexistente en Simple ProX con 21 campañas de prueba)
      CREATE TABLE IF NOT EXISTS public.campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        supplier_name TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Permisos base
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
    `;
    const resSetup = runPsql(setupBaseSql);
    assertTest('Entorno base y roles Supabase simulados creados', resSetup.success, resSetup.error);

    // 3. Aplicar la migración 20261102_b2b_commercial_management.sql
    console.log('\n3. APLICANDO MIGRACIÓN B2B (20261102_b2b_commercial_management.sql)...');
    const migrationPath = path.resolve(__dirname, '../supabase/migrations/20261102_b2b_commercial_management.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const resMigration = runPsql(migrationSql);
    assertTest('Migración B2B aplicada exitosamente sin errores SQL', resMigration.success, resMigration.error);

    // 4. Verificar existencia de tablas y columnas
    console.log('\n4. VERIFICACIÓN ESTRUCTURAL...');
    const checkTablesSql = `
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('distributors', 'distributor_contracts', 'distributor_invoices', 'distributor_payments')
      ORDER BY table_name;
    `;
    const resTables = runPsql(checkTablesSql);
    assertTest('Las 4 tablas comerciales B2B fueron creadas', 
      resTables.success && resTables.output.includes('distributors') && resTables.output.includes('distributor_payments'), 
      resTables.output
    );

    const checkColSql = `
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'distributor_id';
    `;
    const resCol = runPsql(checkColSql);
    assertTest('Columna distributor_id agregada a campaigns preservando compatibilidad', 
      resCol.success && resCol.output.includes('distributor_id'), 
      resCol.output
    );

    // 5. PRUEBA REAL DE MAYORISTA (Punto 3 del requerimiento)
    console.log('\n5. PRUEBA DE MAYORISTA (QA DISTRIBUIDORA SIMPLE PROX)...');
    const createDistSql = `
      INSERT INTO public.distributors (id, name, cuit, contact_name, phone, whatsapp_number, status, commercial_start_date)
      VALUES (
        'dist_qa_simple_prox_01',
        'QA DISTRIBUIDORA SIMPLE PROX',
        '30-71999888-4',
        'Gerente Comercial QA',
        '+5491155554444',
        '+5491155554444',
        'active',
        CURRENT_DATE
      ) RETURNING id, name, cuit, status, commercial_start_date, created_at;
    `;
    const resDist = runPsql(createDistSql);
    assertTest('Mayorista QA registrado con identificador permanente y fechas automáticas', 
      resDist.success && resDist.output.includes('QA DISTRIBUIDORA SIMPLE PROX'), 
      resDist.error
    );

    // Consulta con rol anon (debe ser bloqueada / rechazada por RLS / REVOKE)
    const anonQuery = `SELECT * FROM public.distributors;`;
    const resAnon = runPsql(anonQuery, DB_USER, 'anon');
    assertTest('Consulta mediante usuario anónimo rechazada por seguridad (RLS / REVOKE)', 
      !resAnon.success || resAnon.output.includes('(0 rows)'), 
      resAnon.error || resAnon.output
    );

    // 6. PRUEBA DE CONTRATO Y CUOTA (Punto 4 del requerimiento)
    console.log('\n6. PRUEBA DE CONTRATO Y CUOTA...');
    const createContractSql = `
      INSERT INTO public.distributor_contracts (id, distributor_id, title, contract_amount, start_date, end_date, status)
      VALUES (
        '11111111-1111-4111-b111-111111111111',
        'dist_qa_simple_prox_01',
        'Pauta Publicitaria QA 1 Mes',
        60000.00,
        CURRENT_DATE,
        CURRENT_DATE + interval '1 month',
        'active'
      ) RETURNING id, contract_amount;
    `;
    const resContract = runPsql(createContractSql);
    assertTest('Contrato publicitario creado por ARS 60.000', 
      resContract.success && resContract.output.includes('60000.00'), 
      resContract.error
    );

    // Crear cuota legítima
    const createInvoiceSql = `
      INSERT INTO public.distributor_invoices (id, contract_id, distributor_id, period_label, due_date, amount_original)
      VALUES (
        '22222222-2222-4222-b222-222222222222',
        '11111111-1111-4111-b111-111111111111',
        'dist_qa_simple_prox_01',
        'Período QA Noviembre',
        CURRENT_DATE + interval '10 days',
        60000.00
      ) RETURNING id, amount_original, amount_paid, status;
    `;
    const resInvoice = runPsql(createInvoiceSql);
    assertTest('Cuota inicial creada: amount_original=60.000, amount_paid=0.00, status=pending', 
      resInvoice.success && resInvoice.output.includes('60000.00') && resInvoice.output.includes('0.00') && resInvoice.output.includes('pending'), 
      resInvoice.error || resInvoice.output
    );

    // Intento de crear cuota con amount_paid falsificado en INSERT
    const fakeInsertSql = `
      INSERT INTO public.distributor_invoices (id, contract_id, distributor_id, period_label, due_date, amount_original, amount_paid, status)
      VALUES (
        '33333333-3333-4333-b333-333333333333',
        '11111111-1111-4111-b111-111111111111',
        'dist_qa_simple_prox_01',
        'Período Falsificado',
        CURRENT_DATE + interval '5 days',
        50000.00,
        50000.00,
        'paid'
      ) RETURNING amount_paid, status;
    `;
    const resFakeInsert = runPsql(fakeInsertSql);
    assertTest('Intento de falsificar amount_paid en INSERT fue forzado por el trigger a 0.00 y pending', 
      resFakeInsert.success && resFakeInsert.output.includes('0.00') && resFakeInsert.output.includes('pending'), 
      resFakeInsert.output
    );

    // Intento de crear cuota con amount_original <= 0
    const zeroAmountSql = `
      INSERT INTO public.distributor_invoices (contract_id, distributor_id, period_label, due_date, amount_original)
      VALUES ('11111111-1111-4111-b111-111111111111', 'dist_qa_simple_prox_01', 'Error', CURRENT_DATE, 0);
    `;
    const resZeroAmount = runPsql(zeroAmountSql);
    assertTest('Cuota con importe original <= 0 rechazada por restricción de integridad', 
      !resZeroAmount.success && (resZeroAmount.error.includes('mayor a 0') || resZeroAmount.error.includes('check')), 
      resZeroAmount.error
    );

    // 7. PRUEBA DE PAGOS PARCIALES (Punto 5 del requerimiento)
    console.log('\n7. PRUEBA DE COBROS PARCIALES Y SALDOS...');
    // Pago 1: ARS 20.000
    const pay1Sql = `
      INSERT INTO public.distributor_payments (id, invoice_id, distributor_id, amount, payment_method, payment_date, idempotency_key)
      VALUES (
        '44444444-4444-4444-b444-444444444444',
        '22222222-2222-4222-b222-222222222222',
        'dist_qa_simple_prox_01',
        20000.00,
        'transferencia',
        CURRENT_DATE,
        'idemp_qa_test_payment_1'
      );
      SELECT amount_original, amount_paid, (amount_original - amount_paid) AS balance, status 
      FROM public.distributor_invoices WHERE id = '22222222-2222-4222-b222-222222222222';
    `;
    const resPay1 = runPsql(pay1Sql);
    assertTest('Pago 1 (ARS 20.000): amount_paid=20.000, saldo=40.000, status=partial', 
      resPay1.success && resPay1.output.includes('20000.00') && resPay1.output.includes('40000.00') && resPay1.output.includes('partial'), 
      resPay1.error || resPay1.output
    );

    // Pago 2: ARS 40.000 (completa el saldo)
    const pay2Sql = `
      INSERT INTO public.distributor_payments (id, invoice_id, distributor_id, amount, payment_method, payment_date, idempotency_key)
      VALUES (
        '55555555-5555-4555-b555-555555555555',
        '22222222-2222-4222-b222-222222222222',
        'dist_qa_simple_prox_01',
        40000.00,
        'transferencia',
        CURRENT_DATE,
        'idemp_qa_test_payment_2'
      );
      SELECT amount_original, amount_paid, (amount_original - amount_paid) AS balance, status 
      FROM public.distributor_invoices WHERE id = '22222222-2222-4222-b222-222222222222';
    `;
    const resPay2 = runPsql(pay2Sql);
    assertTest('Pago 2 (ARS 40.000): amount_paid=60.000, saldo=0.00, status=paid', 
      resPay2.success && resPay2.output.includes('60000.00') && resPay2.output.includes('0.00') && resPay2.output.includes('paid'), 
      resPay2.error || resPay2.output
    );

    // Verificar trazabilidad de ambos pagos registrados individualmente
    const checkPaymentsSql = `
      SELECT count(*) AS total_payments, sum(amount) AS total_amount 
      FROM public.distributor_payments 
      WHERE invoice_id = '22222222-2222-4222-b222-222222222222';
    `;
    const resCheckPayments = runPsql(checkPaymentsSql);
    assertTest('Ambos pagos registrados individualmente: total=2, sum=60.000,00', 
      resCheckPayments.success && resCheckPayments.output.includes('2') && resCheckPayments.output.includes('60000.00'), 
      resCheckPayments.output
    );

    // 8. PRUEBAS DE IDEMPOTENCIA, CONCURRENCIA Y SOBREPAGO (Punto 6)
    console.log('\n8. PRUEBAS DE IDEMPOTENCIA Y CONCURRENCIA...');
    // Reintento con la misma idempotency_key
    const dupKeySql = `
      INSERT INTO public.distributor_payments (invoice_id, distributor_id, amount, payment_method, payment_date, idempotency_key)
      VALUES (
        '22222222-2222-4222-b222-222222222222',
        'dist_qa_simple_prox_01',
        1000.00,
        'transferencia',
        CURRENT_DATE,
        'idemp_qa_test_payment_1'
      );
    `;
    const resDupKey = runPsql(dupKeySql);
    assertTest('Reintento con misma idempotency_key rechazado (Prevención de duplicidad)', 
      !resDupKey.success && (resDupKey.error.includes('duplicate key') || resDupKey.error.includes('idempotency_key') || resDupKey.error.includes('duplicad')), 
      resDupKey.error
    );

    // Intento de sobrepago (la cuota ya está saldada en 60.000 / 60.000)
    const overpaySql = `
      INSERT INTO public.distributor_payments (invoice_id, distributor_id, amount, payment_method, payment_date, idempotency_key)
      VALUES (
        '22222222-2222-4222-b222-222222222222',
        'dist_qa_simple_prox_01',
        5000.00,
        'transferencia',
        CURRENT_DATE,
        'idemp_qa_test_overpay'
      );
    `;
    const resOverpay = runPsql(overpaySql);
    assertTest('Intento de cobro superior al saldo disponible rechazado con excepción explícita', 
      !resOverpay.success && resOverpay.error.includes('supera el saldo pendiente'), 
      resOverpay.error
    );

    // Concurrencia: simular dos pagos simultáneos de 30.000 sobre una nueva cuota de 50.000 (solo 1 debe entrar)
    const newInvConcurrent = `
      INSERT INTO public.distributor_invoices (id, contract_id, distributor_id, period_label, due_date, amount_original)
      VALUES ('66666666-6666-4666-b666-666666666666', '11111111-1111-4111-b111-111111111111', 'dist_qa_simple_prox_01', 'Concurrent Test', CURRENT_DATE + 5, 50000.00);
    `;
    runPsql(newInvConcurrent);

    const concSql1 = `
      INSERT INTO public.distributor_payments (invoice_id, distributor_id, amount, payment_method, payment_date, idempotency_key)
      VALUES ('66666666-6666-4666-b666-666666666666', 'dist_qa_simple_prox_01', 30000.00, 'efectivo', CURRENT_DATE, 'idemp_conc_1');
    `;
    const concSql2 = `
      INSERT INTO public.distributor_payments (invoice_id, distributor_id, amount, payment_method, payment_date, idempotency_key)
      VALUES ('66666666-6666-4666-b666-666666666666', 'dist_qa_simple_prox_01', 30000.00, 'efectivo', CURRENT_DATE, 'idemp_conc_2');
    `;
    const [c1, c2] = await runParallelPsql(concSql1, concSql2);
    const onePassed = (c1.code === 0 && c2.code !== 0) || (c2.code === 0 && c1.code !== 0);
    assertTest('Pagos concurrentes bloqueados atómicamente por FOR UPDATE: Uno aceptado y el competidor rechazado', 
      onePassed, 
      `C1 code=${c1.code} (${c1.stderr}), C2 code=${c2.code} (${c2.stderr})`
    );

    // 9. SEGURIDAD E INTEGRIDAD CONTABLE (Punto 7)
    console.log('\n9. PRUEBAS DE SEGURIDAD E INTEGRIDAD CONTABLE...');
    // A. UPDATE directo de amount_paid
    const directUpdatePaidSql = `
      UPDATE public.distributor_invoices 
      SET amount_paid = 1000.00 
      WHERE id = '22222222-2222-4222-b222-222222222222';
    `;
    const resDirectUpdate = runPsql(directUpdatePaidSql);
    assertTest('UPDATE directo de amount_paid bloqueado por trigger fn_enforce_invoice_integrity()', 
      !resDirectUpdate.success && resDirectUpdate.error.includes('amount_paid no puede modificarse directamente'), 
      resDirectUpdate.error
    );

    // B. UPDATE directo de status
    const directUpdateStatusSql = `
      UPDATE public.distributor_invoices 
      SET status = 'paid' 
      WHERE id = '66666666-6666-4666-b666-666666666666';
    `;
    const resDirectStatus = runPsql(directUpdateStatusSql);
    assertTest('UPDATE directo de status bloqueado por trigger fn_enforce_invoice_integrity()', 
      !resDirectStatus.success && resDirectStatus.error.includes('el estado (paid) no puede asignarse manualmente'), 
      resDirectStatus.error
    );

    // C. UPDATE de amount_original a un valor menor que lo ya cobrado
    const lowerOriginalSql = `
      UPDATE public.distributor_invoices 
      SET amount_original = 10000.00 
      WHERE id = '22222222-2222-4222-b222-222222222222';
    `;
    const resLowerOriginal = runPsql(lowerOriginalSql);
    assertTest('UPDATE de amount_original < amount_paid bloqueado con excepción contable', 
      !resLowerOriginal.success && resLowerOriginal.error.includes('no puede ser inferior al total ya cobrado'), 
      resLowerOriginal.error
    );

    // D. DELETE de cuota con pagos asociados
    const deleteInvoiceSql = `
      DELETE FROM public.distributor_invoices WHERE id = '22222222-2222-4222-b222-222222222222';
    `;
    const resDeleteInvoice = runPsql(deleteInvoiceSql);
    assertTest('DELETE de cuota con pagos bloqueado por FK ON DELETE RESTRICT', 
      !resDeleteInvoice.success && resDeleteInvoice.error.includes('violates foreign key constraint'), 
      resDeleteInvoice.error
    );

    // E. UPDATE / DELETE sobre tabla distributor_payments con rol authenticated
    const updatePaymentAuthSql = `
      UPDATE public.distributor_payments 
      SET amount = 50000.00 
      WHERE id = '44444444-4444-4444-b444-444444444444';
    `;
    const resUpdatePaymentAuth = runPsql(updatePaymentAuthSql, DB_USER, 'authenticated');
    assertTest('UPDATE sobre distributor_payments denegado a rol authenticated (Inmutabilidad contable)', 
      !resUpdatePaymentAuth.success && resUpdatePaymentAuth.error.includes('permission denied'), 
      resUpdatePaymentAuth.error
    );

    const deletePaymentAuthSql = `
      DELETE FROM public.distributor_payments WHERE id = '44444444-4444-4444-b444-444444444444';
    `;
    const resDeletePaymentAuth = runPsql(deletePaymentAuthSql, DB_USER, 'authenticated');
    assertTest('DELETE sobre distributor_payments denegado a rol authenticated (Inmutabilidad contable)', 
      !resDeletePaymentAuth.success && resDeletePaymentAuth.error.includes('permission denied'), 
      resDeletePaymentAuth.error
    );

    // F. Ejecución de fn_check_overdue_invoices() por rol anon
    const runOverdueAnonSql = `SELECT public.fn_check_overdue_invoices();`;
    const resRunOverdueAnon = runPsql(runOverdueAnonSql, DB_USER, 'anon');
    assertTest('Ejecución de fn_check_overdue_invoices() denegada a rol anon por REVOKE EXECUTE', 
      !resRunOverdueAnon.success && resRunOverdueAnon.error.includes('permission denied'), 
      resRunOverdueAnon.error
    );

    // G. Consistencia estricta SUM(payments.amount) == invoices.amount_paid
    const reconcileSql = `
      SELECT 
        i.id,
        i.amount_paid,
        COALESCE(SUM(p.amount), 0.00) AS sum_payments,
        (i.amount_paid - COALESCE(SUM(p.amount), 0.00)) AS diff
      FROM public.distributor_invoices i
      LEFT JOIN public.distributor_payments p ON p.invoice_id = i.id
      GROUP BY i.id, i.amount_paid
      HAVING (i.amount_paid - COALESCE(SUM(p.amount), 0.00)) != 0.00;
    `;
    const resReconcile = runPsql(reconcileSql);
    assertTest('Consistencia contable matemática: CERO diferencias entre SUM(payments) y invoices.amount_paid', 
      resReconcile.success && (!resReconcile.output || resReconcile.output.includes('(0 rows)')), 
      resReconcile.output
    );

    // 10. VENCIMIENTOS Y CÁLCULOS TEMPORALES (Punto 8)
    console.log('\n10. PRUEBAS DE VENCIMIENTOS...');
    const datesSql = `
      -- 1. Cuota futura pendiente
      INSERT INTO public.distributor_invoices (id, contract_id, distributor_id, period_label, due_date, amount_original)
      VALUES ('77777777-7777-4777-b777-777777777777', '11111111-1111-4111-b111-111111111111', 'dist_qa_simple_prox_01', 'Futura', CURRENT_DATE + 15, 10000.00);

      -- 2. Cuota pasada impaga
      INSERT INTO public.distributor_invoices (id, contract_id, distributor_id, period_label, due_date, amount_original)
      VALUES ('88888888-8888-4888-b888-888888888888', '11111111-1111-4111-b111-111111111111', 'dist_qa_simple_prox_01', 'Pasada Impaga', CURRENT_DATE - 5, 10000.00);

      -- 3. Cuota pasada con pago parcial
      INSERT INTO public.distributor_invoices (id, contract_id, distributor_id, period_label, due_date, amount_original)
      VALUES ('99999999-9999-4999-b999-999999999999', '11111111-1111-4111-b111-111111111111', 'dist_qa_simple_prox_01', 'Pasada Parcial', CURRENT_DATE - 3, 10000.00);

      INSERT INTO public.distributor_payments (invoice_id, distributor_id, amount, payment_method, payment_date, idempotency_key)
      VALUES ('99999999-9999-4999-b999-999999999999', 'dist_qa_simple_prox_01', 3000.00, 'efectivo', CURRENT_DATE, 'idemp_past_partial');
    `;
    runPsql(datesSql);

    const queryDatesSql = `
      SELECT id, period_label, due_date, amount_original, amount_paid,
        CASE 
          WHEN amount_paid >= amount_original THEN 'PAID'
          WHEN due_date < CURRENT_DATE AND amount_paid > 0 THEN 'OVERDUE_PARTIAL'
          WHEN due_date < CURRENT_DATE AND amount_paid = 0 THEN 'OVERDUE_UNPAID'
          WHEN amount_paid > 0 THEN 'PARTIAL'
          ELSE 'PENDING'
        END AS dynamic_state
      FROM public.distributor_invoices
      WHERE id IN ('77777777-7777-4777-b777-777777777777', '88888888-8888-4888-b888-888888888888', '99999999-9999-4999-b999-999999999999')
      ORDER BY due_date;
    `;
    const resDates = runPsql(queryDatesSql);
    assertTest('Evaluación dinámica de vencimientos distingue OVERDUE_UNPAID de OVERDUE_PARTIAL y PENDING', 
      resDates.success && resDates.output.includes('OVERDUE_UNPAID') && resDates.output.includes('OVERDUE_PARTIAL') && resDates.output.includes('PENDING'), 
      resDates.output
    );

    // 11. PRUEBA DE ROLLBACK LIMPIO
    console.log('\n11. PRUEBA DE ROLLBACK...');
    // Primero, probar que el rollback ABORTA si hay datos contables registrados (Protección de datos)
    const rollbackPath = path.resolve(__dirname, '../supabase/migrations/20261102_b2b_commercial_management_ROLLBACK.sql');
    const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');
    const resRollbackWithData = runPsql(rollbackSql);
    assertTest('Rollback seguro: ABORTA automáticamente y protege tablas si existen datos contables', 
      !resRollbackWithData.success && resRollbackWithData.error.includes('ROLLBACK ABORTADO POR SEGURIDAD'), 
      resRollbackWithData.error
    );

  } finally {
    // 12. Destrucción segura del contenedor aislado
    console.log('\n12. LIMPIEZA FINAL DEL ENTORNO AISLADO...');
    try {
      execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'pipe' });
      console.log(`   Contenedor efímero ${CONTAINER_NAME} destruido completamente.`);
    } catch (e) {
      console.warn('   No se pudo remover el contenedor temporal:', e.message);
    }
  }

  console.log('\n================================================================');
  console.log(`RESUMEN FINAL DE ASERCIONES EN POSTGRESQL REAL:`);
  console.log(`Total Aserciones: ${totalAssertions}`);
  console.log(`Aprobadas:        ${passedAssertions}`);
  console.log(`Fallidas:         ${failedAssertions}`);
  console.log('================================================================\n');

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error fatal durante la validación integrada:', err);
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'pipe' });
  } catch (e) {}
  process.exit(1);
});
