import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CONTAINER = 'spx_isolated_pg_test';
const DB_NAME = 'test_isolated_db';
const USER = 'postgres';

function runPsql(sql) {
  try {
    const res = execSync(`docker exec -i ${CONTAINER} psql -U ${USER} -d ${DB_NAME} -v ON_ERROR_STOP=1`, {
      input: sql,
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

async function runParallelPsql(sql1, sql2) {
  const p1 = new Promise((resolve) => {
    const child = spawn('docker', ['exec', '-i', CONTAINER, 'psql', '-U', USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1']);
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
    const child = spawn('docker', ['exec', '-i', CONTAINER, 'psql', '-U', USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1']);
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

async function main() {
  console.log('================================================================');
  console.log('AUDITORÍA SOBRE POSTGRESQL REAL AISLADO (MOTOR REAL POSTGRESQL)');
  console.log('Contenedor:', CONTAINER, '| Base de Datos:', DB_NAME);
  console.log('================================================================\n');

  // 1. SETUP DE ROLES Y TABLAS BASE
  console.log('[FASE 1] Inicializando esquema base y roles...');
  const setupSql = `
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

    TRUNCATE public.terminal_identities, public.merchants CASCADE;
  `;
  const setupRes = runPsql(setupSql);
  if (!setupRes.success) {
    console.error('❌ Error en Setup inicial:', setupRes.error);
    process.exit(1);
  }
  console.log('✅ Esquema base y roles inicializados correctamente.\n');

  // 2. APLICAR MIGRACIÓN RPC
  console.log('[FASE 2] Aplicando migración 20261020_enroll_terminal_license_rpc.sql...');
  const migrationPath = path.resolve('supabase/migrations/20261020_enroll_terminal_license_rpc.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const migRes = runPsql(migrationSql);
  if (!migRes.success) {
    console.error('❌ Error aplicando migración RPC:', migRes.error);
    process.exit(1);
  }
  console.log('✅ Migración aplicada exitosamente en PostgreSQL real.\n');

  // 3. PRUEBAS FUNCIONALES EN POSTGRESQL REAL
  console.log('[FASE 3] Ejecutando pruebas funcionales en PostgreSQL real...');

  // Test 1: Primer enrolamiento legítimo
  console.log('--- TEST 1: Primer Enrolamiento Legítimo ---');
  const t1 = runPsql(`
    SELECT public.enroll_terminal_with_license(
      'TERM-PG-01',
      'hash_inicial_01',
      '{"storeName": "Kiosco Central", "address": "Av Corrientes 1000", "phone": "1144445555"}'::jsonb,
      false
    );
    SELECT status, token_hash FROM public.terminal_identities WHERE installation_id = 'TERM-PG-01';
  `);
  console.log(t1.output);
  if (!t1.success || !t1.output.includes('"success": true') || !t1.output.includes('"action": "first_enrollment"')) {
    console.error('❌ TEST 1 FALLÓ');
    process.exit(1);
  }
  console.log('✅ TEST 1 PASÓ: Primer enrolamiento crea identidad activa.\n');

  // Test 2: Rotación no autorizada (allow_rotation = false)
  console.log('--- TEST 2: Intento de Rotación NO Autorizada con Certificado Copiado ---');
  const t2 = runPsql(`
    SELECT public.enroll_terminal_with_license(
      'TERM-PG-01',
      'hash_atacante_copia',
      '{}'::jsonb,
      false
    );
    SELECT token_hash FROM public.terminal_identities WHERE installation_id = 'TERM-PG-01';
  `);
  console.log(t2.output);
  if (!t2.success || !t2.output.includes('"code": "ALREADY_ENROLLED"') || !t2.output.includes('hash_inicial_01')) {
    console.error('❌ TEST 2 FALLÓ: No se bloqueó la rotación o se alteró la credencial previa!');
    process.exit(1);
  }
  console.log('✅ TEST 2 PASÓ: Rotación rechazada con ALREADY_ENROLLED y credencial original intacta.\n');

  // Test 3: Rotación autorizada (allow_rotation = true)
  console.log('--- TEST 3: Rotación Autorizada Administrativamente ---');
  const t3 = runPsql(`
    SELECT public.enroll_terminal_with_license(
      'TERM-PG-01',
      'hash_rotado_autorizado',
      '{}'::jsonb,
      true
    );
    SELECT token_hash FROM public.terminal_identities WHERE installation_id = 'TERM-PG-01';
  `);
  console.log(t3.output);
  if (!t3.success || !t3.output.includes('"action": "credential_rotated"') || !t3.output.includes('hash_rotado_autorizado')) {
    console.error('❌ TEST 3 FALLÓ: La rotación autorizada no actualizó el hash');
    process.exit(1);
  }
  console.log('✅ TEST 3 PASÓ: Rotación autorizada actualizó credencial sin crear filas duplicadas.\n');

  // Test 4: Terminal revocada (Fail-Closed)
  console.log('--- TEST 4: Terminal Revocada ---');
  const t4 = runPsql(`
    INSERT INTO public.terminal_identities (installation_id, token_hash, status)
    VALUES ('TERM-REV-01', 'hash_rev', 'revoked');

    SELECT public.enroll_terminal_with_license('TERM-REV-01', 'new_h', '{}'::jsonb, true);
  `);
  console.log(t4.output);
  if (!t4.success || !t4.output.includes('"code": "TERMINAL_REVOKED"')) {
    console.error('❌ TEST 4 FALLÓ: Terminal revocada no fue rechazada');
    process.exit(1);
  }
  console.log('✅ TEST 4 PASÓ: Terminal revocada bloqueada categóricamente.\n');

  // Test 5: Terminal suspendida (Fail-Closed)
  console.log('--- TEST 5: Terminal Suspendida ---');
  const t5 = runPsql(`
    INSERT INTO public.terminal_identities (installation_id, token_hash, status)
    VALUES ('TERM-SUSP-01', 'hash_susp', 'suspended');

    SELECT public.enroll_terminal_with_license('TERM-SUSP-01', 'new_h', '{}'::jsonb, false);
  `);
  console.log(t5.output);
  if (!t5.success || !t5.output.includes('"code": "TERMINAL_REVOKED"')) {
    console.error('❌ TEST 5 FALLÓ: Terminal suspendida no fue rechazada');
    process.exit(1);
  }
  console.log('✅ TEST 5 PASÓ: Terminal suspendida bloqueada categóricamente.\n');

  // Test 6: Preservación de datos en merchants
  console.log('--- TEST 6: Preservación de Datos Comerciales en Merchants ---');
  const t6 = runPsql(`
    INSERT INTO public.merchants (id, installation_id, commerce_id, name, address, phone, installer)
    VALUES ('TERM-MERCH-99', 'TERM-MERCH-99', 'COMM-99', 'Kiosco El Trébol Original', 'San Martín 500', '011-4321', 'Agente Sur');

    SELECT public.enroll_terminal_with_license(
      'TERM-MERCH-99',
      'hash_merch_99',
      '{"storeName": "", "address": null, "phone": null, "installer": ""}'::jsonb,
      false
    );

    SELECT name, address, phone, installer FROM public.merchants WHERE id = 'TERM-MERCH-99';
  `);
  console.log(t6.output);
  if (!t6.success || !t6.output.includes('Kiosco El Trébol Original') || !t6.output.includes('San Martín 500') || !t6.output.includes('011-4321')) {
    console.error('❌ TEST 6 FALLÓ: Datos existentes en merchants fueron borrados o sobrescritos!');
    process.exit(1);
  }
  console.log('✅ TEST 6 PASÓ: Datos comerciales preexistentes preservados con COALESCE.\n');

  // Test 7: Permisos EXECUTE
  console.log('--- TEST 7: Verificación de Permisos de Ejecución ---');
  const t7 = runPsql(`
    SELECT 
      has_function_privilege('anon', 'public.enroll_terminal_with_license(TEXT, TEXT, JSONB, BOOLEAN)', 'EXECUTE') as anon_allowed,
      has_function_privilege('service_role', 'public.enroll_terminal_with_license(TEXT, TEXT, JSONB, BOOLEAN)', 'EXECUTE') as service_allowed;
  `);
  console.log(t7.output);
  if (!t7.success || !/f\s+\|\s+t/.test(t7.output)) {
    console.error('❌ TEST 7 FALLÓ: Permisos incorrectos en la función');
    process.exit(1);
  }
  console.log('✅ TEST 7 PASÓ: anon denegado (f), service_role autorizado (t).\n');

  // Test 8: Concurrencia REAL con dos conexiones cliente simultáneas
  console.log('--- TEST 8: Concurrencia Real Simultánea (2 Sesiones Paralelas) ---');
  const concurrentInstallation = 'TERM-RACE-CONCURRENT-' + Date.now();
  const sqlClientA = `
    SELECT public.enroll_terminal_with_license(
      '${concurrentInstallation}',
      'hash_client_A',
      '{"storeName": "Race Store A"}'::jsonb,
      false
    );
  `;
  const sqlClientB = `
    SELECT public.enroll_terminal_with_license(
      '${concurrentInstallation}',
      'hash_client_B',
      '{"storeName": "Race Store B"}'::jsonb,
      false
    );
  `;

  console.log(`Disparando dos transacciones concurrentes hacia ${concurrentInstallation}...`);
  const [resA, resB] = await runParallelPsql(sqlClientA, sqlClientB);
  console.log('Resultado Sesión 1:', resA.stdout);
  console.log('Resultado Sesión 2:', resB.stdout);

  const outputsCombined = resA.stdout + ' ' + resB.stdout;
  const oneFirstEnrollment = outputsCombined.includes('"first_enrollment"');
  const oneAlreadyEnrolled = outputsCombined.includes('"ALREADY_ENROLLED"');

  if (!oneFirstEnrollment || !oneAlreadyEnrolled) {
    console.error('❌ TEST 8 FALLÓ: La concurrencia no resolvió limpiamente en first_enrollment + ALREADY_ENROLLED');
    process.exit(1);
  }

  // Verificar que la tabla tenga exactamente 1 fila y ningún registro corrupto
  const countRes = runPsql(`SELECT count(*) FROM public.terminal_identities WHERE installation_id = '${concurrentInstallation}';`);
  console.log(countRes.output);
  if (!countRes.output.includes('1')) {
    console.error('❌ TEST 8 FALLÓ: Fila duplicada detectada!');
    process.exit(1);
  }
  console.log('✅ TEST 8 PASÓ: Concurrencia real simultánea manejada con bloqueo atómico (1 ganó first_enrollment, 1 recibió ALREADY_ENROLLED, 0 duplicados).\n');

  // Test 8.b: Concurrencia Sincronizada en el primer INSERT (Reproducción de carrera con unique_violation)
  console.log('--- TEST 8.b: Concurrencia Sincronizada en primer INSERT (Captura específica de unique_violation) ---');
  const syncRaceId = 'TERM-RACE-INSERT-' + Date.now();
  const sqlSyncA = `
    BEGIN;
    SELECT public.enroll_terminal_with_license(
      '${syncRaceId}',
      'hash_sync_A',
      '{"storeName": "Sync Store A"}'::jsonb,
      false
    );
    SELECT pg_sleep(1.5);
    COMMIT;
  `;
  const sqlSyncB = `
    SELECT pg_sleep(0.3);
    SELECT public.enroll_terminal_with_license(
      '${syncRaceId}',
      'hash_sync_B',
      '{"storeName": "Sync Store B"}'::jsonb,
      false
    );
  `;

  console.log(`Disparando carrera forzada en primer INSERT hacia ${syncRaceId}...`);
  const [resSyncA, resSyncB] = await runParallelPsql(sqlSyncA, sqlSyncB);
  console.log('Resultado Sesión 1 (Sleep & Commit):', resSyncA.stdout);
  console.log('Resultado Sesión 2 (Blocked on INSERT -> Catch unique_violation):', resSyncB.stdout);

  if (!resSyncA.stdout.includes('"first_enrollment"') || !resSyncB.stdout.includes('"ALREADY_ENROLLED"')) {
    console.error('❌ TEST 8.b FALLÓ: La colisión de clave única no devolvió ALREADY_ENROLLED de forma controlada!');
    process.exit(1);
  }

  const syncCount = runPsql(`SELECT count(*) FROM public.terminal_identities WHERE installation_id = '${syncRaceId}';`);
  if (!syncCount.output.includes('1')) {
    console.error('❌ TEST 8.b FALLÓ: Se detectaron filas duplicadas o ausentes!');
    process.exit(1);
  }
  console.log('✅ TEST 8.b PASÓ: unique_violation en primer INSERT capturado específicamente en terminal_identities y devuelto como ALREADY_ENROLLED controlado.\n');

  // Test 9: Rollback Real
  console.log('--- TEST 9: Verificación de Rollback Real ---');
  const rollbackPath = path.resolve('supabase/migrations/20261020_enroll_terminal_license_rpc_ROLLBACK.sql');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');
  const rollRes = runPsql(rollbackSql);
  if (!rollRes.success) {
    console.error('❌ Error ejecutando rollback:', rollRes.error);
    process.exit(1);
  }

  const checkFunc = runPsql(`SELECT to_regprocedure('public.enroll_terminal_with_license(TEXT, TEXT, JSONB, BOOLEAN)');`);
  console.log(checkFunc.output);
  // to_regprocedure debe retornar null (espacio vacío en salida estándar de psql)
  if (checkFunc.output.includes('enroll_terminal_with_license')) {
    console.error('❌ TEST 9 FALLÓ: La función aún existe después del rollback!');
    process.exit(1);
  }
  console.log('✅ TEST 9 PASÓ: Rollback verificado exitosamente en PostgreSQL real. Función eliminada.\n');

  console.log('================================================================');
  console.log('TODAS LAS PRUEBAS EN POSTGRESQL REAL FUERON COMPLETADAS CON ÉXITO');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Error no controlado:', err);
  process.exit(1);
});
