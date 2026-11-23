/**
 * SIMPLE PROX - CLIENTE DE PRUEBA AISLADO E2E DE MÉTRICAS B2B (FASE 15)
 * 
 * Script de ejecución controlada del circuito HTTP API -> Supabase -> Panel Administrador.
 * Utiliza las credenciales efímeras generadas en tests/.pilot_cred_active.json (ignorado en .gitignore).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSION_FILE = path.resolve(__dirname, '.pilot_cred_active.json');
const SUPABASE_URL = 'https://qtixbiikhvhzwshfgyeo.supabase.co';

export function loadActiveSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    throw new Error(`Archivo de sesión no encontrado: ${SESSION_FILE}`);
  }
  const raw = fs.readFileSync(SESSION_FILE, 'utf8');
  return JSON.parse(raw);
}

export function wipeActiveSession() {
  if (fs.existsSync(SESSION_FILE)) {
    // Sobrescritura segura con bytes aleatorios antes de eliminar
    const fileSize = fs.statSync(SESSION_FILE).size || 512;
    fs.writeFileSync(SESSION_FILE, crypto.randomBytes(fileSize));
    fs.unlinkSync(SESSION_FILE);
    return true;
  }
  return false;
}

export async function sendSessionEvents() {
  const session = loadActiveSession();
  const endpoint = `${SUPABASE_URL}/functions/v1/terminal-sync/events`;

  const now = new Date();
  const events = [
    {
      eventId: session.eventIds[0],
      campaignId: session.campaignId,
      eventType: 'impression',
      timestamp: now.toISOString()
    },
    {
      eventId: session.eventIds[1],
      campaignId: session.campaignId,
      eventType: 'offer_open',
      timestamp: new Date(now.getTime() + 2000).toISOString()
    },
    {
      eventId: session.eventIds[2],
      campaignId: session.campaignId,
      eventType: 'whatsapp_click',
      timestamp: new Date(now.getTime() + 4500).toISOString()
    }
  ];

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-terminal-id': session.terminalId,
      'x-terminal-token': session.token
    },
    body: JSON.stringify({ events })
  });

  const statusCode = response.status;
  const resultJson = await response.json().catch(() => ({}));

  return {
    statusCode,
    success: response.ok,
    result: resultJson,
    eventsSent: events.map(e => ({ eventId: e.eventId, type: e.eventType }))
  };
}

if (process.argv[1]?.endsWith('test_b2b_e2e_isolated_client.mjs')) {
  const isSend = process.argv.includes('--send');
  const isWipe = process.argv.includes('--wipe');

  if (isWipe) {
    const wiped = wipeActiveSession();
    if (wiped) {
      console.log('✅ [DESTRUCCIÓN SEGURA] Archivo de credenciales efímeras sobrescrito y eliminado.');
    } else {
      console.log('ℹ️  [DESTRUCCIÓN SEGURA] El archivo de credenciales ya no existía.');
    }
    process.exit(0);
  }

  if (isSend) {
    console.log('[CLIENTE E2E] Iniciando envío controlado de 3 eventos a terminal-sync/events...');
    sendSessionEvents()
      .then(({ statusCode, success, result, eventsSent }) => {
        console.log(`[CLIENTE E2E] Código HTTP recibido: ${statusCode}`);
        console.log('[CLIENTE E2E] Respuesta del servidor:', JSON.stringify(result));
        console.log('[CLIENTE E2E] Eventos emitidos con éxito:', eventsSent);
        if (success && result?.processedCount === 3) {
          console.log('✅ [PASO 3 EXITOSO] 3 eventos sintéticos aceptados y procesados por Supabase.');
        } else {
          console.error('❌ [PASO 3 FALLIDO] La respuesta no confirmó el procesamiento de los 3 eventos.');
          process.exit(1);
        }
      })
      .catch((err) => {
        console.error('[CLIENTE E2E ERROR]', err.message);
        process.exit(1);
      });
  } else {
    try {
      const session = loadActiveSession();
      console.log('=== SESIÓN DE PRUEBA CARGADA Y LISTA ===');
      console.log('Campaign ID :', session.campaignId);
      console.log('Terminal ID :', session.terminalId);
      console.log('Token Hash  :', session.tokenHash);
      console.log('Eventos     :\n ', session.eventIds.join('\n  '));
      console.log('\nModo de uso:');
      console.log('  node tests/test_b2b_e2e_isolated_client.mjs --send   (Ejecuta el envío HTTP)');
      console.log('  node tests/test_b2b_e2e_isolated_client.mjs --wipe   (Destruye credenciales efímeras)');
    } catch (e) {
      console.error(e.message);
    }
  }
}
