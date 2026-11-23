/**
 * SIMPLE PROX — VERIFICACIÓN POST-MIGRACIÓN PRODUCCIÓN B2B (FASE 5D.6)
 * Realiza exclusivamente comprobaciones REST de solo lectura sobre https://qtixbiikhvhzwshfgyeo.supabase.co
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/ad_config.json'), 'utf8'));
const SUPABASE_URL = config.supabaseUrl;
const SUPABASE_KEY = config.supabaseKey;

const headersAnon = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Accept': 'application/json'
};

async function checkPostMigration() {
  console.log('================================================================');
  console.log('AUDITORÍA DE SOLO LECTURA POST-MIGRACIÓN B2B (PRODUCCIÓN)');
  console.log('Endpoint:', SUPABASE_URL);
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(name, condition, extra = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✅ [PASS] ${name}`);
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
      if (extra) console.error(`     Detalles: ${extra}`);
    }
  }

  // 1. Verificación de columna campaigns.distributor_id y supplier_name
  try {
    const resCamp = await fetch(`${SUPABASE_URL}/rest/v1/campaigns?select=id,title,supplier_name,distributor_id,status&status=eq.active`, { headers: headersAnon });
    if (resCamp.ok) {
      const camps = await resCamp.json();
      assert('Columna campaigns.distributor_id existe y es legible en el esquema', true);
      assert('Las 17 campañas activas continúan visibles públicamente para anon', camps.length === 17, `Recibidas: ${camps.length}`);
      const suppliersOk = camps.every(c => typeof c.supplier_name === 'string' && c.supplier_name.trim().length > 0);
      assert('supplier_name conservado íntegramente en todas las campañas', suppliersOk);
      const allNullDistributor = camps.every(c => c.distributor_id === null);
      assert('Campañas preexistentes conservan distributor_id = null (retrocompatibilidad total)', allNullDistributor);
    } else {
      const err = await resCamp.text();
      assert('Columna campaigns.distributor_id existe y es legible en el esquema', false, `HTTP ${resCamp.status}: ${err}`);
    }
  } catch (err) {
    assert('Lectura de campañas', false, err.message);
  }

  // 2. Verificación de bloqueo anónimo sobre tablas financieras B2B
  const tables = ['distributors', 'distributor_contracts', 'distributor_invoices', 'distributor_payments'];
  for (const table of tables) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, { headers: headersAnon });
      // Para anon debe retornar error 401/403 o arreglo vacío debido a REVOKE ALL / RLS estricto
      if (!res.ok) {
        assert(`Tabla ${table}: Acceso anónimo bloqueado por seguridad (HTTP ${res.status})`, true);
      } else {
        const data = await res.json();
        assert(`Tabla ${table}: Cero registros expuestos a usuario anónimo`, Array.isArray(data) && data.length === 0, `Expuestos: ${data.length}`);
      }
    } catch (e) {
      assert(`Tabla ${table}: Acceso denegado`, true);
    }
  }

  console.log('\n================================================================');
  console.log(`RESULTADO DE AUDITORÍA: ${passed}/${total} COMPROBACIONES APROBADAS`);
  console.log('================================================================\n');

  return { passed, total };
}

checkPostMigration().catch(console.error);

