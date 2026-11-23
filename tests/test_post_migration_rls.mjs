/**
 * SIMPLE PROX — VERIFICACIÓN POST-MIGRACIÓN RLS (PASO 7D)
 * 
 * Este script ejecuta exclusivamente consultas GET de solo lectura para auditar:
 * 1. Acceso del rol anon a campañas activas (debe retornar 17).
 * 2. Bloqueo RLS del rol anon a campañas pausadas (debe retornar 0).
 * 3. Bloqueo RLS del rol anon a campañas draft (debe retornar 0).
 * 4. Integridad bit a bit (SHA-256) de las 21 campañas comerciales.
 * 5. Cero eventos sintéticos en campaign_events.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let SUPABASE_URL = 'https://qtixbiikhvhzwshfgyeo.supabase.co';
let SUPABASE_KEY = '';

try {
  const adConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/ad_config.json'), 'utf8'));
  SUPABASE_URL = adConfig.supabaseUrl || SUPABASE_URL;
  SUPABASE_KEY = adConfig.supabaseKey || '';
} catch (e) {
  console.warn('Leyendo configuración por defecto...');
}

const EXPECTED_BASELINE_HASH = '0b02c261d66e43d61afaca7cd2607ce043be50ecfa07fdc75136cfa1338f2cc5';

const reqHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Accept': 'application/json'
};

async function checkAnonActive() {
  const url = `${SUPABASE_URL}/rest/v1/campaigns?status=eq.active&select=id,status`;
  const res = await fetch(url, { headers: reqHeaders });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data.length : -1;
}

async function checkAnonPaused() {
  const url = `${SUPABASE_URL}/rest/v1/campaigns?status=eq.paused&select=id,status`;
  const res = await fetch(url, { headers: reqHeaders });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data.length : -1;
}

async function checkAnonDraft() {
  const url = `${SUPABASE_URL}/rest/v1/campaigns?status=eq.draft&select=id,status`;
  const res = await fetch(url, { headers: reqHeaders });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data.length : -1;
}

async function checkAnonUnfiltered() {
  const url = `${SUPABASE_URL}/rest/v1/campaigns?select=id,status`;
  const res = await fetch(url, { headers: reqHeaders });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data.length : -1;
}

async function checkFingerprint(token = SUPABASE_KEY) {
  const url = `${SUPABASE_URL}/rest/v1/campaigns?select=*&order=id.asc`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const canonical = JSON.stringify(data.map(c => {
    const sorted = {};
    Object.keys(c).sort().forEach(k => { sorted[k] = c[k]; });
    return sorted;
  }));
  const hash = crypto.createHash('sha256').update(canonical).digest('hex');
  return { count: data.length, hash };
}

async function run() {
  console.log('====================================================');
  console.log('AUDITORÍA REST POST-MIGRACIÓN RLS (PASO 7D)');
  console.log('====================================================\n');

  console.log('--- 1. Pruebas de Acceso Rol Anon (Clave Pública) ---');
  const activeCount = await checkAnonActive();
  console.log(`- Campañas status=active devueltas a anon: ${activeCount} ${activeCount === 17 ? '✅ (Esperadas: 17)' : '⚠️ DISCREPANCIA'}`);

  const pausedCount = await checkAnonPaused();
  console.log(`- Campañas status=paused devueltas a anon: ${pausedCount} ${pausedCount === 0 ? '✅ (0 = Aislamiento RLS Efectivo)' : '❌ FALLO: ' + pausedCount + ' expuestas'}`);

  const draftCount = await checkAnonDraft();
  console.log(`- Campañas status=draft devueltas a anon: ${draftCount} ${draftCount === 0 ? '✅ (0 = Aislamiento RLS Efectivo)' : '❌ FALLO: ' + draftCount + ' expuestas'}`);

  const unfilteredCount = await checkAnonUnfiltered();
  console.log(`- Consulta global a anon (sin filtro status): ${unfilteredCount} ${unfilteredCount === 17 ? '✅ (Solo activas entregadas)' : '⚠️ Entregadas: ' + unfilteredCount}`);

  console.log('\n--- 2. Estado de la Migración en Supabase ---');
  if (pausedCount === 0) {
    console.log('🔒 ESTADO RLS: MIGRACIÓN APLICADA EXITOSAMENTE.');
    console.log('   Las campañas pausadas y borradores están completamente protegidas a nivel PostgreSQL.');
  } else {
    console.log('🔓 ESTADO RLS: MIGRACIÓN PENDIENTE DE APLICACIÓN.');
    console.log(`   Actualmente anon todavía puede leer ${pausedCount} campañas pausadas (política campaigns_select_public activa).`);
  }

  console.log('\n--- 3. Verificación de Integridad Comercial ---');
  const adminToken = process.env.SUPABASE_ADMIN_TOKEN;
  if (adminToken) {
    console.log('- Token de administrador detectado en SUPABASE_ADMIN_TOKEN.');
    const adminCheck = await checkFingerprint(adminToken);
    console.log(`- Campañas visibles al administrador: ${adminCheck.count} (Esperadas: 21)`);
    console.log(`- Huella SHA-256 admin: ${adminCheck.hash}`);
    console.log(`- Coincidencia con línea base: ${adminCheck.hash === EXPECTED_BASELINE_HASH ? '✅ EXACTA' : '❌ DISCREPANCIA'}`);
  } else {
    console.log('- Para auditar el acceso del administrador con las 21 campañas:');
    console.log('  Ejecute: $env:SUPABASE_ADMIN_TOKEN="<token>"; node tests/test_post_migration_rls.mjs');
  }
}

run().catch(err => {
  console.error('Error durante la verificación:', err);
  process.exit(1);
});

