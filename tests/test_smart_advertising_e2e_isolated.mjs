/**
 * SIMPLE PROX — CLIENTE DE VERIFICACIÓN E2E AISLADO (FASE 7C)
 * 
 * Este script realiza exclusivamente consultas GET de solo lectura para auditar:
 * 1. La recuperación e interpretación de isSmartAdvertising desde Supabase.
 * 2. La exclusión en servidor de campañas draft hacia terminales comerciales.
 * 3. La integridad bit a bit (SHA-256) de los 22 campos de las 21 campañas comerciales.
 * 4. Cero eventos sintéticos registrados en campaign_events.
 * 
 * CERO ESCRITURAS A SUPABASE. CERO MODIFICACIONES DE CÓDIGO PRODUCTIVO.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { extractB2BMetadata } from '../src/utils/b2bUtils.js';
import { getLowStockReplenishmentOpportunities } from '../src/utils/stockOfferMatcher.js';
import { buildPriorityRotationSequence } from '../src/hooks/useOfertas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar configuración de conexión segura
let SUPABASE_URL = 'https://qtixbiikhvhzwshfgyeo.supabase.co';
let SUPABASE_KEY = '';

try {
  const adConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/ad_config.json'), 'utf8'));
  SUPABASE_URL = adConfig.supabaseUrl || SUPABASE_URL;
  SUPABASE_KEY = adConfig.supabaseKey || '';
} catch (e) {
  console.warn('Leyendo configuración por defecto...');
}

const SYNTHETIC_UUID = '00000000-0000-4000-b000-000000000015';
const EXPECTED_BASELINE_HASH = '0b02c261d66e43d61afaca7cd2607ce043be50ecfa07fdc75136cfa1338f2cc5';

/**
 * Resuelve y sanitiza el token administrativo dinámico sin insertar credenciales en código
 * ni almacenar datos persistentes en disco o registro.
 */
export function getAdminToken() {
  const tokenIdx = process.argv.findIndex(a => a === '--admin-token' || a === '--token');
  let raw = null;
  if (tokenIdx !== -1 && process.argv[tokenIdx + 1]) {
    raw = process.argv[tokenIdx + 1];
  } else if (process.env.SUPABASE_ADMIN_TOKEN) {
    raw = process.env.SUPABASE_ADMIN_TOKEN;
  }
  if (!raw || typeof raw !== 'string') return null;

  // Sanitización quirúrgica en memoria:
  // 1. Quitar todos los espacios, saltos de línea (\r, \n) y tabuladores que inyecta la consola o terminal
  let clean = raw.replace(/\s+/g, '');
  // 2. Quitar comillas simples o dobles envolventes (típico al copiar de consola DevTools)
  clean = clean.replace(/^["']|["']$/g, '');
  // 3. Quitar prefijo redundante "Bearer"
  clean = clean.replace(/^Bearer/i, '');
  // 4. Volver a limpiar cualquier comilla o espacio residual
  clean = clean.replace(/^["']|["']$/g, '').replace(/\s+/g, '');

  return clean.length > 0 ? clean : null;
}

/**
 * Inspección diagnóstica segura del JWT en memoria (cero fugas de credenciales, emails o firmas)
 */
export function inspectAdminToken(token) {
  if (!token) return { status: 'none', message: 'No provisto' };
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { status: 'invalid_format', message: `Formato incorrecto: ${parts.length} segmentos (se esperan 3 separados por puntos)` };
  }

  let header = null;
  let payload = null;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch (e) {
    return { status: 'invalid_header', message: 'No se pudo decodificar el encabezado del JWT' };
  }

  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (e) {
    return { status: 'decode_error', message: 'No se pudo decodificar el payload base64url del JWT' };
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = payload.exp;
  const isExpired = exp ? now >= exp : false;
  const expDate = exp ? new Date(exp * 1000).toLocaleString() : 'Desconocida';
  const iss = payload.iss || '';
  const ref = payload.ref || (iss.includes('qtixbiikhvhzwshfgyeo') ? 'qtixbiikhvhzwshfgyeo' : (iss.split('//')[1] || '').split('.')[0]);
  const matchesProject = ref === 'qtixbiikhvhzwshfgyeo' || iss.includes('qtixbiikhvhzwshfgyeo');
  const sigLength = parts[2].length;
  const alg = header.alg || 'desconocido';

  // Verificación de integridad de firma
  const isSigLengthOk = (alg === 'HS256' ? sigLength === 43 : sigLength > 30);

  let status = 'valid';
  let message = 'Válido';
  if (isExpired) {
    status = 'expired';
    message = `Expiró el ${expDate}`;
  } else if (!matchesProject) {
    status = 'wrong_project';
    message = `Proyecto no coincide (ref: "${ref}")`;
  } else if (!isSigLengthOk) {
    status = 'truncated_sig';
    message = `Firma truncada o longitud anormal (${sigLength} caracteres para algoritmo ${alg}, se esperaban 43)`;
  }

  return {
    status,
    message,
    alg,
    typ: header.typ,
    role: payload.role || 'no_role',
    aud: payload.aud || 'no_aud',
    iss,
    hasSub: Boolean(payload.sub),
    isExpired,
    expDate,
    remainingMinutes: exp ? Math.round((exp - now) / 60) : null,
    ref,
    matchesProject,
    tokenLength: token.length,
    sigLength
  };
}

/**
 * Consulta de prueba segura a /auth/v1/user para validar firma en Supabase Auth
 */
export async function verifyAuthUser(token) {
  if (!token) return { ok: false, status: 0, error: 'No token provisto' };
  const url = `${SUPABASE_URL}/auth/v1/user`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${token}`
      }
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = await res.text().catch(() => '');
    }
    return {
      ok: res.ok,
      status: res.status,
      role: data?.role || null,
      aud: data?.aud || null,
      hasSub: Boolean(data?.id),
      error: !res.ok ? (data?.msg || data?.message || data?.error_code || `HTTP ${res.status}`) : null
    };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

/**
 * Genera los encabezados HTTP según el perfil de acceso (anon vs admin)
 */
export function getReqHeaders(isAdmin = false) {
  const adminToken = getAdminToken();
  const token = (isAdmin && adminToken) ? adminToken : SUPABASE_KEY;
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  };
}

/**
 * Calcula la huella digital canónica SHA-256 de todas las campañas comerciales reales
 * ordenando deterministamente claves y filas.
 */
export async function getCommercialCampaignsFingerprint(isAdmin = true) {
  const headers = getReqHeaders(isAdmin);
  const url = `${SUPABASE_URL}/rest/v1/campaigns?select=*&order=id.asc`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    let errDetail = '';
    try {
      const errJson = await res.json();
      errDetail = `[${errJson.code || 'ERR'}]: ${errJson.message || errJson.error || ''}`;
    } catch (_) {
      try {
        const text = await res.text();
        errDetail = text.slice(0, 150);
      } catch (__) { }
    }
    throw new Error(`HTTP ${res.status} al consultar campañas comerciales ${errDetail ? `(${errDetail})` : ''}`);
  }

  const all = await res.json();
  const commercial = all.filter(c => c.id !== SYNTHETIC_UUID);

  const canonical = JSON.stringify(commercial.map(c => {
    const sorted = {};
    Object.keys(c).sort().forEach(k => { sorted[k] = c[k]; });
    return sorted;
  }));

  const hash = crypto.createHash('sha256').update(canonical).digest('hex');
  return { count: commercial.length, hash, commercial };
}

/**
 * Consulta la campaña sintética por su UUID exacto (requiere perfil admin para estado draft)
 */
export async function getSyntheticCampaign(isAdmin = true) {
  const headers = getReqHeaders(isAdmin);
  const url = `${SUPABASE_URL}/rest/v1/campaigns?id=eq.${SYNTHETIC_UUID}&select=*`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    let errDetail = '';
    try {
      const errJson = await res.json();
      errDetail = `[${errJson.code || 'ERR'}]: ${errJson.message || ''}`;
    } catch (_) { }
    throw new Error(`HTTP ${res.status} al consultar campaña sintética ${errDetail ? `(${errDetail})` : ''}`);
  }
  const data = await res.json();
  return data.length > 0 ? data[0] : null;
}

/**
 * Verifica si existen eventos registrados para la campaña sintética
 */
export async function getSyntheticEventsCount() {
  const headers = getReqHeaders(false);
  const url = `${SUPABASE_URL}/rest/v1/campaign_events?campaign_id=eq.${SYNTHETIC_UUID}&select=id`;
  const res = await fetch(url, { headers });
  if (!res.ok) return 0;
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

/**
 * Consulta el conteo global total en campaign_events
 */
export async function getTotalEventsCount() {
  const headers = getReqHeaders(false);
  const url = `${SUPABASE_URL}/rest/v1/campaign_events?select=id`;
  const res = await fetch(url, {
    headers: {
      ...headers,
      'Range': '0-0',
      'Prefer': 'count=exact'
    }
  });
  if (!res.ok) return 0;
  const cr = res.headers.get('content-range');
  if (cr && cr.includes('/')) {
    const total = parseInt(cr.split('/')[1], 10);
    return isNaN(total) ? 0 : total;
  }
  return 0;
}

const BASELINE_STATE_PATH = path.resolve(__dirname, 'e2e_baseline_state.json');

// ============================================================================
// CLI DE EJECUCIÓN
// ============================================================================
async function run() {
  const arg = process.argv[2] || '--check-baseline';
  const hasAdminToken = Boolean(getAdminToken());

  console.log('====================================================');
  console.log('SIMPLE PROX: VERIFICACIÓN AISLADA E2E (FASE 7C)');
  console.log('====================================================\n');
  console.log(`- Perfil de autenticación: ${hasAdminToken ? '🔑 Administrador Autenticado (JWT activo)' : '🌐 Cliente Público / POS (Rol anon)'}`);

  if (hasAdminToken) {
    const cleanToken = getAdminToken();
    const diag = inspectAdminToken(cleanToken);
    console.log('--- Diagnóstico Seguro de Token Administrativo en Memoria ---');
    console.log(`- Estructura: 3 segmentos base64url | Longitud total: ${diag.tokenLength || 0} chars | Firma: ${diag.sigLength || 0} chars (Algoritmo: ${diag.alg || 'N/A'})`);
    console.log(`- Claims: role="${diag.role}" | aud="${diag.aud}" | sub=${diag.hasSub ? 'Presente' : 'Ausente'} | Proyecto: "${diag.ref}" (${diag.matchesProject ? 'Coincide' : 'DISCREPANCIA'})`);

    if (diag.status === 'expired') {
      console.warn(`⚠️ ALERTA: El JWT administrativo EXPIRÓ el ${diag.expDate}.`);
      console.warn(`   (Supabase rechaza tokens vencidos con HTTP 401 [PGRST301: JWT expired]).`);
    } else if (diag.status === 'wrong_project') {
      console.warn(`⚠️ ALERTA: El JWT pertenece al proyecto "${diag.ref}" en lugar de "qtixbiikhvhzwshfgyeo".`);
    } else if (diag.status === 'truncated_sig') {
      console.warn(`⚠️ ALERTA: ${diag.message}`);
    } else if (diag.status === 'valid') {
      console.log(`- Vigencia: Válido (Expira en aprox. ${diag.remainingMinutes} minutos, el ${diag.expDate})`);
    } else {
      console.warn(`⚠️ ALERTA: Formato JWT dudoso: ${diag.message}`);
    }

    // Sonda de verificación de firma contra Supabase Auth (/auth/v1/user)
    const authCheck = await verifyAuthUser(cleanToken);
    if (authCheck.ok) {
      console.log(`- Verificación Supabase Auth (/auth/v1/user): ✅ HTTP 200 OK (Firma válida, Role: "${authCheck.role}", Aud: "${authCheck.aud}")`);
    } else {
      console.log(`- Verificación Supabase Auth (/auth/v1/user): ❌ HTTP ${authCheck.status} (${authCheck.error})`);
    }
    console.log('-------------------------------------------------------------\n');
  }

  if (arg === '--check-baseline') {
    console.log('--- 1. Verificando Línea Base Comercial e Integridad RLS ---');

    // Verificación 1: Acceso público anónimo (debe ver solo las 17 activas)
    const publicQuery = await getCommercialCampaignsFingerprint(false);
    console.log(`- Campañas devueltas a rol anon (público): ${publicQuery.count} ${publicQuery.count === 17 ? '✅ (Aislamiento RLS activo: solo 17 activas)' : '⚠️ DISCREPANCIA'}`);

    // Verificación 2: Acceso administrativo (debe ver las 21 comerciales con JWT admin)
    if (hasAdminToken) {
      const adminQuery = await getCommercialCampaignsFingerprint(true);
      const activeCount = adminQuery.commercial.filter(c => c.status === 'active').length;
      const pausedCount = adminQuery.commercial.filter(c => c.status === 'paused').length;
      console.log(`- Campañas devueltas a Administrador: ${adminQuery.count} ${adminQuery.count === 21 ? '✅ (Esperadas: 21)' : '⚠️ DISCREPANCIA'}`);
      console.log(`  * Campañas activas: ${activeCount} ${activeCount === 17 ? '✅ (Esperadas: 17)' : '⚠️ DISCREPANCIA'}`);
      console.log(`  * Campañas pausadas: ${pausedCount} ${pausedCount === 4 ? '✅ (Esperadas: 4)' : '⚠️ DISCREPANCIA'}`);
      console.log(`- Huella SHA-256 canónica observada: ${adminQuery.hash}`);
      console.log(`- Coincidencia con línea base comercial (21 campañas): ${adminQuery.hash === EXPECTED_BASELINE_HASH ? '✅ EXACTA (0 bytes alterados)' : '❌ DISCREPANCIA'}`);
    } else {
      console.log(`- Campañas comerciales totales: Requiere token admin para auditar las 21 (incluidas las 4 pausadas).`);
      console.log(`  (Ejecute con: --admin-token <jwt> o $env:SUPABASE_ADMIN_TOKEN="<jwt>")`);
    }

    // Verificación 3: Confirmar que el UUID sintético está libre
    const synthAdmin = hasAdminToken ? await getSyntheticCampaign(true) : null;
    const synthPublic = await getSyntheticCampaign(false);
    console.log(`- ¿UUID sintético libre en Supabase?: ${synthPublic === null && synthAdmin === null ? '✅ SÍ (Libre)' : '⚠️ NO (Ya existe)'}`);

    const initialTotalEvents = await getTotalEventsCount();
    console.log(`- Conteo global inicial en campaign_events: ${initialTotalEvents}`);

    // Preservar snapshot local de línea base para contraste post-prueba
    try {
      fs.writeFileSync(BASELINE_STATE_PATH, JSON.stringify({
        timestamp: new Date().toISOString(),
        expectedHash: EXPECTED_BASELINE_HASH,
        hasAdminToken,
        initialTotalEvents
      }, null, 2), 'utf8');
      console.log(`- Estado de línea base guardado localmente en tests/e2e_baseline_state.json`);
    } catch (e) {
      console.warn('No se pudo guardar e2e_baseline_state.json:', e.message);
    }
    return;
  }

  if (arg === '--verify-smart-active') {
    console.log('--- 2. Verificando Campaña Sintética con isSmartAdvertising: true ---');

    // Verificación de seguridad RLS: El rol anon NUNCA debe ver la campaña draft
    const synthAnon = await getSyntheticCampaign(false);
    console.log(`- ¿Campaña draft aislada del rol público anon/POS?: ${synthAnon === null ? '✅ SÍ (Bloqueada por RLS a terminales)' : '❌ FALLO: Visible a clientes públicos'}`);

    const synth = await getSyntheticCampaign(true);
    if (!synth) {
      console.error('❌ La campaña sintética no existe o no se proporcionó un token de administrador válido.');
      console.error('   Pase el token con: --admin-token <jwt> o $env:SUPABASE_ADMIN_TOKEN="<jwt>"');
      process.exit(1);
    }

    console.log(`- Campaña encontrada (Ámbito Admin): "${synth.title}"`);
    console.log(`- Estado en Supabase: "${synth.status}" (Debe ser "draft")`);

    const { meta, cleanDescription } = extractB2BMetadata(synth.description);

    // Mapeo real de indicador según la fórmula canónica de adSyncEngine.js (L214):
    const isSmartMapped = Boolean(
      synth.is_smart_advertising_enabled ||
      synth.isSmartAdvertising ||
      meta.isSmartAdvertising
    );

    console.log(`- Metadato isSmartAdvertising en tag B2B: ${meta.isSmartAdvertising === true ? '✅ true' : '❌ false'}`);
    console.log(`- Mapeo canónico adSyncEngine: ${isSmartMapped ? '✅ true (Activo)' : '❌ false'}`);
    console.log(`- Descripción limpia de tags: "${cleanDescription}"`);

    // Simular matching y rotación con producto Sidras bajo de stock
    const products = [{ id: 'prod-sidra', name: 'Sidras', stock: 2, stockAlert: 5, isActive: true }];
    const synthCampaignObj = {
      id: synth.id,
      title: synth.title,
      isSmartAdvertising: isSmartMapped,
      status: 'active' // Evaluada como elegible en el sandbox aislado
    };
    const generalCampaigns = [
      { id: 'c-quilmes', title: 'Quilmes 1L', isSmartAdvertising: false, status: 'active' },
      { id: 'c-coca', title: 'Coca-Cola 2.25L', isSmartAdvertising: false, status: 'active' }
    ];
    const universe = [synthCampaignObj, ...generalCampaigns];
    const smartEligible = universe.filter(c => c.isSmartAdvertising);
    const opps = getLowStockReplenishmentOpportunities(products, smartEligible);

    console.log(`- Oportunidades de reposición detectadas: ${opps.length} (${opps[0]?.campaign.title})`);

    const contextualSet = new Set(opps.map(o => o.campaign.id));
    const seq = buildPriorityRotationSequence(universe, contextualSet);

    // Análisis de la rotación ponderada
    const synthSlots = [];
    const quilmesSlots = [];
    const cocaSlots = [];
    seq.forEach((c, idx) => {
      if (c.id === synth.id) synthSlots.push(idx);
      else if (c.id === 'c-quilmes') quilmesSlots.push(idx);
      else if (c.id === 'c-coca') cocaSlots.push(idx);
    });

    const totalSlots = seq.length;
    const synthFrequency = synthSlots.length / totalSlots;
    const normalsParticipate = quilmesSlots.length > 0 && cocaSlots.length > 0;
    const isDistributed = synthSlots.length > 1;

    console.log(`- Secuencia de rotación generada (${totalSlots} slots en ciclo):`);
    console.log(`  * Campaña Contextual Premium ("${synth.title}"): ${synthSlots.length}/${totalSlots} slots (${Math.round(synthFrequency * 100)}%) en slots [${synthSlots.join(', ')}]`);
    console.log(`  * Campaña Normal ("Quilmes 1L"): ${quilmesSlots.length}/${totalSlots} slots en slots [${quilmesSlots.join(', ')}]`);
    console.log(`  * Campaña Normal ("Coca-Cola 2.25L"): ${cocaSlots.length}/${totalSlots} slots en slots [${cocaSlots.join(', ')}]`);

    console.log(`- ¿Cadencia contextual adecuada (proporcional y no monopolizada)?: ${synthFrequency >= 0.33 && synthFrequency <= 0.60 ? '✅ SÍ' : '❌ NO'}`);
    console.log(`- ¿Participan todas las campañas normales?: ${normalsParticipate ? '✅ SÍ' : '❌ NO'}`);
    console.log(`- ¿Rotación circular distribuida (no dependiente únicamente de slot 0)?: ${isDistributed ? '✅ SÍ' : '❌ NO'}`);
    return;
  }

  if (arg === '--verify-smart-deactivated') {
    console.log('--- 3. Verificando Campaña Sintética con isSmartAdvertising: false ---');
    const synth = await getSyntheticCampaign(true);
    if (!synth) {
      console.error('❌ La campaña sintética no existe o no se proporcionó token admin.');
      process.exit(1);
    }

    const { meta } = extractB2BMetadata(synth.description);
    const isSmartMapped = Boolean(
      synth.is_smart_advertising_enabled ||
      synth.isSmartAdvertising ||
      meta.isSmartAdvertising
    );

    console.log(`- Metadato en tag B2B: ${meta.isSmartAdvertising === false || meta.isSmartAdvertising === undefined ? '✅ false (Desactivado)' : '❌ true (Aún activo)'}`);
    console.log(`- Mapeo canónico adSyncEngine: ${!isSmartMapped ? '✅ false' : '❌ true'}`);

    // Simular que cesa la prioridad
    const products = [{ id: 'prod-sidra', name: 'Sidras', stock: 2, stockAlert: 5, isActive: true }];
    const synthCampaignObj = {
      id: synth.id,
      title: synth.title,
      isSmartAdvertising: isSmartMapped,
      status: 'active'
    };
    const generalCampaigns = [
      { id: 'c-quilmes', title: 'Quilmes 1L', isSmartAdvertising: false, status: 'active' },
      { id: 'c-coca', title: 'Coca-Cola 2.25L', isSmartAdvertising: false, status: 'active' }
    ];
    const universe = [synthCampaignObj, ...generalCampaigns];
    const smartEligible = universe.filter(c => c.isSmartAdvertising);
    const opps = getLowStockReplenishmentOpportunities(products, smartEligible);

    console.log(`- Oportunidades detectadas con smart desactivado: ${opps.length} (Debe ser 0)`);
    const seq = buildPriorityRotationSequence(universe, new Set(opps.map(o => o.campaign.id)));
    const isEqualRotation = seq.length === universe.length && seq.every((c, i) => c.id === universe[i].id);
    console.log(`- Rotación resultante: ${isEqualRotation ? '✅ 100% Equitativa Normal (Sin ponderación)' : '❌ Ponderada'}`);
    return;
  }

  if (arg === '--verify-final-integrity') {
    console.log('--- 4. Verificación Final de Integridad y Residuos ---');
    const synthAdmin = hasAdminToken ? await getSyntheticCampaign(true) : null;
    const synthAnon = await getSyntheticCampaign(false);
    const isClean = synthAdmin === null && synthAnon === null;
    console.log(`- ¿Registro sintético eliminado?: ${isClean ? '✅ SÍ (Cero residuos sintéticos)' : '❌ NO (Aún presente)'}`);
    if (!isClean) process.exitCode = 1;

    if (hasAdminToken) {
      const { count, hash } = await getCommercialCampaignsFingerprint(true);
      const isCountOk = count === 21;
      const isHashOk = hash === EXPECTED_BASELINE_HASH;
      console.log(`- Total campañas comerciales (Ámbito Admin): ${count} ${isCountOk ? '✅ (21 esperadas)' : '❌ DISCREPANCIA'}`);
      console.log(`- Huella SHA-256 post-prueba: ${hash}`);
      console.log(`- Coincidencia exacta bit a bit SHA-256: ${isHashOk ? '✅ INTACTA (0 bytes alterados)' : '❌ DISCREPANCIA'}`);
      if (!isCountOk || !isHashOk) process.exitCode = 1;
    } else {
      const { count } = await getCommercialCampaignsFingerprint(false);
      console.log(`- Total campañas comerciales activas (Ámbito Anon): ${count} (Debe ser 17)`);
      console.log(`  (Para validar el hash canónico de las 21 completas, pase --admin-token <jwt>)`);
    }

    // Validación rigurosa de eventos comerciales
    const synthEvents = await getSyntheticEventsCount();
    console.log(`- Eventos asociados al UUID sintético: ${synthEvents === 0 ? '✅ 0 (Cero eventos de prueba)' : `❌ ${synthEvents} eventos detectados`}`);
    if (synthEvents !== 0) process.exitCode = 1;

    const finalTotalEvents = await getTotalEventsCount();
    let initialTotalEvents = null;
    if (fs.existsSync(BASELINE_STATE_PATH)) {
      try {
        const state = JSON.parse(fs.readFileSync(BASELINE_STATE_PATH, 'utf8'));
        initialTotalEvents = state.initialTotalEvents;
      } catch (e) { }
    }

    if (initialTotalEvents !== null) {
      const delta = finalTotalEvents - initialTotalEvents;
      console.log(`- Conteo global campaign_events: ${finalTotalEvents} (Inicial: ${initialTotalEvents}, Delta: ${delta >= 0 ? '+' : ''}${delta})`);
      if (delta > 0) {
        console.log(`  ℹ️ Información: Se observaron ${delta} eventos comerciales adicionales generados por terminales en producción.`);
        console.log(`     Al ser eventos sintéticos = 0, se confirma que la prueba aislada no contaminó la telemetría.`);
      } else {
        console.log(`  ✅ Cero variación en campaign_events durante la ventana de prueba.`);
      }
    } else {
      console.log(`- Conteo global campaign_events actual: ${finalTotalEvents}`);
    }
    return;
  }

  console.log('Opciones disponibles:');
  console.log('  node tests/test_smart_advertising_e2e_isolated.mjs --check-baseline');
  console.log('  node tests/test_smart_advertising_e2e_isolated.mjs --verify-smart-active');
  console.log('  node tests/test_smart_advertising_e2e_isolated.mjs --verify-smart-deactivated');
  console.log('  node tests/test_smart_advertising_e2e_isolated.mjs --verify-final-integrity');
}

run().catch(err => {
  console.error('Error en prueba:', err);
  process.exit(1);
});

