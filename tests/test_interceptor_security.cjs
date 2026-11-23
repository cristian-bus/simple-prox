/**
 * SIMPLE PROX - Test de Validación del Interceptor de Seguridad Deny-by-Default
 * FASE 5C.4D.4D
 * 
 * Valida de forma 100% local (sin red ni Supabase) que la lógica del interceptor
 * bloquea todos los casos negativos y solo permite el GET legítimo a las rutas exactas.
 */

const assert = require('assert');

console.log('=== TEST UNITARIO LOCAL: INTERCEPTOR DENY-BY-DEFAULT ===\n');

const ALLOWED_HOST = 'qtixbiikhvhzwshfgyeo.supabase.co';
const ALLOWED_EDGE_PATH = '/functions/v1/terminal-sync/campaigns';
const ALLOWED_REST_PATH = '/rest/v1/campaigns';

function validateRequest(urlStr, method = 'GET') {
  let parsedUrl;
  try {
    parsedUrl = new URL(urlStr);
  } catch (err) {
    throw new TypeError(`[DENY-BY-DEFAULT] URL inválida: ${urlStr}`);
  }

  if (parsedUrl.protocol === 'file:') {
    return { allowed: true, type: 'local_file' };
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new TypeError(`[DENY-BY-DEFAULT] Solo se permite HTTPS: ${urlStr}`);
  }

  if (parsedUrl.hostname !== ALLOWED_HOST) {
    throw new TypeError(`[DENY-BY-DEFAULT] Host no autorizado: ${parsedUrl.hostname}`);
  }

  if (method.toUpperCase() !== 'GET') {
    throw new TypeError(`[DENY-BY-DEFAULT] Método no autorizado: ${method}`);
  }

  const isAllowedEdge = parsedUrl.pathname === ALLOWED_EDGE_PATH;
  const isAllowedRest = parsedUrl.pathname === ALLOWED_REST_PATH;
  if (!isAllowedEdge && !isAllowedRest) {
    throw new TypeError(`[DENY-BY-DEFAULT] Ruta no autorizada: ${parsedUrl.pathname}`);
  }

  return { allowed: true, type: isAllowedEdge ? 'edge' : 'rest' };
}

// 1. Caso Negativo: Método POST bloqueado
console.log('1. Verificando bloqueo de POST a /campaigns...');
assert.throws(() => {
  validateRequest('https://qtixbiikhvhzwshfgyeo.supabase.co/functions/v1/terminal-sync/campaigns', 'POST');
}, /Método no autorizado: POST/);
console.log('   ✅ PASÓ: POST bloqueado con TypeError explícito.');

// 2. Caso Negativo: POST a /register bloqueado
console.log('2. Verificando bloqueo de POST a /register...');
assert.throws(() => {
  validateRequest('https://qtixbiikhvhzwshfgyeo.supabase.co/functions/v1/terminal-sync/register', 'POST');
}, /Método no autorizado: POST/);
console.log('   ✅ PASÓ: POST a /register bloqueado.');

// 3. Caso Negativo: Dominio incorrecto bloqueado
console.log('3. Verificando bloqueo de dominio no autorizado...');
assert.throws(() => {
  validateRequest('https://otro-proyecto.supabase.co/functions/v1/terminal-sync/campaigns', 'GET');
}, /Host no autorizado/);
console.log('   ✅ PASÓ: Host externo bloqueado.');

// 4. Caso Negativo: Protocolo HTTP no seguro bloqueado
console.log('4. Verificando bloqueo de protocolo HTTP...');
assert.throws(() => {
  validateRequest('http://qtixbiikhvhzwshfgyeo.supabase.co/functions/v1/terminal-sync/campaigns', 'GET');
}, /Solo se permite HTTPS/);
console.log('   ✅ PASÓ: HTTP inseguro bloqueado.');

// 5. Caso Negativo: Ruta parecida pero no idéntica bloqueada
console.log('5. Verificando bloqueo de ruta similar no autorizada (/campaigns_fake)...');
assert.throws(() => {
  validateRequest('https://qtixbiikhvhzwshfgyeo.supabase.co/functions/v1/terminal-sync/campaigns_fake', 'GET');
}, /Ruta no autorizada/);
console.log('   ✅ PASÓ: Ruta similar bloqueada.');

// 6. Caso Positivo: GET legítimo a Edge terminal-sync/campaigns
console.log('6. Verificando aceptación de GET legítimo a terminal-sync/campaigns...');
const resEdge = validateRequest('https://qtixbiikhvhzwshfgyeo.supabase.co/functions/v1/terminal-sync/campaigns', 'GET');
assert.strictEqual(resEdge.allowed, true);
assert.strictEqual(resEdge.type, 'edge');
console.log('   ✅ PASÓ: GET legítimo a Edge autorizado.');

// 7. Caso Positivo: GET legítimo a REST legacy /rest/v1/campaigns
console.log('7. Verificando aceptación de GET legítimo a REST legacy /rest/v1/campaigns?select=*...');
const resRest = validateRequest('https://qtixbiikhvhzwshfgyeo.supabase.co/rest/v1/campaigns?select=*', 'GET');
assert.strictEqual(resRest.allowed, true);
assert.strictEqual(resRest.type, 'rest');
console.log('   ✅ PASÓ: GET legítimo a REST autorizado.');

// 8. Caso Positivo: Archivo local file://
console.log('8. Verificando aceptación de recurso local file://...');
const resFile = validateRequest('file:///c:/Users/Pininas/KioscoProX/tests/test_pilot_campaigns_page.html');
assert.strictEqual(resFile.allowed, true);
assert.strictEqual(resFile.type, 'local_file');
console.log('   ✅ PASÓ: Recurso local autorizado.');

console.log('\n=== TODOS LOS CASOS DE SEGURIDAD DEL INTERCEPTOR PASARON EXITOSAMENTE (8/8) ===');
