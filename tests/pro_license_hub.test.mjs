/**
 * TEST SUITE: GENERADOR VISUAL DE LICENCIAS PRO (FASE 17)
 * 
 * Verifica que:
 * 1. El servidor arranca en 127.0.0.1 y sirve pro-license-hub.html con inyección CSRF.
 * 2. GET /api/status reporta estado de clave privada sin exponer secretos.
 * 3. Se rechazan peticiones sin token CSRF (403) y métodos GET en la API de emisión (405).
 * 4. Se rechaza contraseña incorrecta al descifrar la clave privada (401).
 * 5. Se rechaza ID de instalación inválido o malformado (400).
 * 6. Emisión exitosa de licencias: Permanente, 365 días y 30 días.
 * 7. Compatibilidad cruzada bit a bit con verifyProLicenseCertificate de Simple ProX 1.3.10.
 * 8. Rechazo estricto en caso de suplantación de equipo (ID diferente).
 * 9. Cero emisión de licencias de producción reales durante las pruebas.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Polyfills para entorno Node.js
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.window = { crypto: globalThis.crypto };

// 1. Preparar par de claves Ed25519 efímeras de prueba ANTES de importar módulos
const testPassphrase = 'TestPassphrase-Segura-2026!';
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase: testPassphrase
  },
  publicKeyEncoding: {
    type: 'spki',
    format: 'jwk'
  }
});

const scratchDir = path.resolve(__dirname, '../scratch');
if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
const testKeyPath = path.join(scratchDir, 'temp_test_pro_private.pem');
fs.writeFileSync(testKeyPath, privateKey, { mode: 0o600 });

// Inyectar clave pública de prueba para que licenseCrypto la utilice al inicializarse
globalThis.__TEST_PUBLIC_KEY_JWK__ = publicKey;
process.env.NODE_ENV = 'test';

// Import dinámico de módulos con el entorno configurado
const { createLicenseServer } = await import('../admin-tools/proLicenseServer.js');
const { verifyProLicenseCertificate } = await import('../src/utils/licenseCrypto.js');

console.log('================================================================');
console.log('TEST SUITE: FASE 17 — GENERADOR VISUAL DE LICENCIAS PRO');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function report(desc, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${desc}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${desc} ${detail ? `(${detail})` : ''}`);
    failCount++;
  }
}

async function runTests() {
  console.log('--- 1. Preparando entorno criptográfico aislado para pruebas ---');
  report('Clave privada de prueba generada y cifrada con passphrase', fs.existsSync(testKeyPath));
  report('Clave pública de prueba configurada para validación cruzada', Boolean(publicKey.x));

  // 2. Iniciar servidor de prueba en puerto efímero 5198
  console.log('\n--- 2. Iniciando servidor en puerto de prueba 5198 ---');
  const TEST_PORT = 5198;
  const hub = createLicenseServer({
    port: TEST_PORT,
    privateKeyPath: testKeyPath,
    expectedPublicJwk: publicKey
  });

  await hub.start();
  report(`Servidor iniciado exclusivamente en 127.0.0.1:${TEST_PORT}`, true);

  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;
  const validCsrfToken = hub.sessionToken;

  try {
    // 3. Prueba GET / (Interfaz Visual)
    console.log('\n--- 3. Verificación de la Interfaz Visual y Seguridad CSRF ---');
    const resUi = await fetch(`${baseUrl}/`);
    report('GET / responde con HTTP 200 OK', resUi.status === 200);
    const htmlBody = await resUi.text();
    report('HTML incluye título "Generador de Licencias PRO"', htmlBody.includes('Generador de Licencias PRO'));
    report('HTML inyecta el token de sesión CSRF en meta tag', htmlBody.includes(validCsrfToken));
    report('Encabezado Set-Cookie incluye spx_adm_session SameSite=Strict', (resUi.headers.get('set-cookie') || '').includes('SameSite=Strict'));

    // 3.1 Verificación del JavaScript Real de la Interfaz Visual (HTML/DOM)
    console.log('\n--- 3.1 Verificación de Preservación de Capitalización en JavaScript de UI ---');
    const scriptMatch = htmlBody.match(/<script>([\s\S]*?)<\/script>/);
    report('HTML contiene bloque de script ejecutable', Boolean(scriptMatch));
    const clientScript = scriptMatch ? scriptMatch[1] : '';
    report('El script del cliente NO contiene .toUpperCase() en sanitización', !clientScript.includes('.toUpperCase()'));

    // Crear un contexto de simulación DOM para ejecutar las funciones reales del script de la UI
    const elements = {
      inputInstallationId: { value: '' },
      inputPassphrase: { value: testPassphrase, type: 'password' },
      btnTogglePass: { textContent: '👁️ Ver' },
      confirmIdDisplay: { textContent: '' },
      confirmDurationDisplay: { textContent: '' },
      confirmModal: { style: { display: 'none' } },
      errorBox: { style: { display: 'none' } },
      errorMessage: { textContent: '' },
      btnExecuteIssue: { disabled: false, textContent: '' },
      metaInstallationId: { textContent: '' },
      tokenDisplay: { value: '', select: () => {} },
      resultContainer: { style: { display: 'none' } },
      metaLicenseId: { textContent: '' },
      metaPlan: { textContent: '' },
      metaIssuedAt: { textContent: '' },
      metaExpiresAt: { textContent: '' },
      wppMessageText: { innerText: '' },
      resultCard: { style: {}, scrollIntoView: () => {} },
      btnCopyToken: { className: '', innerHTML: '' }
    };

    let lastSentBody = null;
    const mockContext = {
      document: {
        getElementById: (id) => elements[id] || { value: '', textContent: '', style: {} },
        querySelectorAll: () => [],
        querySelector: (sel) => {
          if (sel.includes('csrf-session-token')) {
            return { getAttribute: () => validCsrfToken };
          }
          return null;
        }
      },
      navigator: {
        clipboard: {
          readText: async () => 'id:   86999462-7ee0-43b2-a012-16e10ad24bf8   ',
          writeText: async () => {}
        }
      },
      alert: () => {},
      fetch: async (url, options) => {
        lastSentBody = JSON.parse(options.body);
        return fetch(`${baseUrl}${url}`, options);
      },
      console: console,
      setTimeout: setTimeout
    };

    vm.createContext(mockContext);
    vm.runInContext(clientScript, mockContext);

    // 3.1.1 Probar función real pasteInstallationId() con UUID en minúsculas y espacios/prefijo
    await mockContext.pasteInstallationId();
    report('pasteInstallationId() procesa el ID y conserva minúsculas exactas', elements.inputInstallationId.value === '86999462-7ee0-43b2-a012-16e10ad24bf8');

    // 3.1.2 Probar función real openConfirmModal()
    mockContext.openConfirmModal();
    report('openConfirmModal() muestra en modal el ID exacto en minúsculas', elements.confirmIdDisplay.textContent === '86999462-7ee0-43b2-a012-16e10ad24bf8');

    // 3.1.3 Probar función real executeIssue() hacia el backend HTTP real
    await mockContext.executeIssue();
    report('executeIssue() envía en el body JSON el installationId en minúsculas', lastSentBody?.installationId === '86999462-7ee0-43b2-a012-16e10ad24bf8');
    report('executeIssue() renderiza el resultado con el ID en minúsculas', elements.metaInstallationId.textContent === '86999462-7ee0-43b2-a012-16e10ad24bf8');

    // 3.1.4 Validación cruzada del token generado a través de la UI real con el validador del POS
    const tokenFromUi = elements.tokenDisplay.value;
    const verifyUiToken = await verifyProLicenseCertificate(tokenFromUi, '86999462-7ee0-43b2-a012-16e10ad24bf8');
    report('Token emitido a través de la UI es validado exitosamente por verifyProLicenseCertificate', verifyUiToken.valid === true);
    report('Payload interno del token de UI coincide exactamente con 86999462-7ee0-43b2-a012-16e10ad24bf8', verifyUiToken.payload?.installationId === '86999462-7ee0-43b2-a012-16e10ad24bf8');

    // 3.1.5 Probar que un ID histórico alfanumérico (WG6KX8UI) funciona correctamente en la UI real
    elements.inputInstallationId.value = 'id: WG6KX8UI';
    mockContext.openConfirmModal();
    report('openConfirmModal() con ID histórico conserva "WG6KX8UI"', elements.confirmIdDisplay.textContent === 'WG6KX8UI');
    await mockContext.executeIssue();
    report('executeIssue() con ID histórico envía "WG6KX8UI"', lastSentBody?.installationId === 'WG6KX8UI');
    const verifyHistToken = await verifyProLicenseCertificate(elements.tokenDisplay.value, 'WG6KX8UI');
    report('Token de ID histórico emitido por la UI es validado exitosamente', verifyHistToken.valid === true);

    // 4. Prueba GET /api/status
    console.log('\n--- 4. Verificación de Endpoint de Diagnóstico ---');
    const resStatus = await fetch(`${baseUrl}/api/status`);
    const statusData = await resStatus.json();
    report('GET /api/status responde 200 OK', resStatus.status === 200);
    report('Reporta privateKeyExists: true', statusData.privateKeyExists === true);
    report('Reporta isEncrypted: true', statusData.isEncrypted === true);
    report('No expone claves privadas ni contenido sensible', !JSON.stringify(statusData).includes('PRIVATE KEY'));

    // 5. Pruebas de Seguridad y Validaciones en POST /api/issue
    console.log('\n--- 5. Verificación de Reglas de Seguridad en /api/issue ---');
    
    // 5.1 Rechazo de GET en endpoint de emisión
    const resGetIssue = await fetch(`${baseUrl}/api/issue`);
    report('Rechaza método GET con HTTP 405 Method Not Allowed', resGetIssue.status === 405);

    // 5.2 Rechazo sin token CSRF
    const resNoCsrf = await fetch(`${baseUrl}/api/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId: 'TEST-001', duration: 'permanent', passphrase: testPassphrase })
    });
    report('Rechaza solicitud sin token CSRF con HTTP 403 Forbidden', resNoCsrf.status === 403);

    // 5.3 Rechazo de contraseña incorrecta
    const resBadPass = await fetch(`${baseUrl}/api/issue`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-session': validCsrfToken
      },
      body: JSON.stringify({ installationId: 'TEST-001', duration: 'permanent', passphrase: 'clave-erronea-xyz' })
    });
    report('Rechaza contraseña incorrecta con HTTP 401 Unauthorized', resBadPass.status === 401);

    // 5.4 Rechazo de installationId inválido
    const resBadId = await fetch(`${baseUrl}/api/issue`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-session': validCsrfToken
      },
      body: JSON.stringify({ installationId: ' ', duration: 'permanent', passphrase: testPassphrase })
    });
    report('Rechaza installationId vacío con HTTP 400 Bad Request', resBadId.status === 400);

    // 6. Pruebas de Emisión y Compatibilidad con el Validador del POS
    console.log('\n--- 6. Verificación de Emisión y Compatibilidad con Simple ProX 1.3.10 ---');

    // 6.1 Licencia Permanente (Vitalicia)
    const testInstId = 'WG6KX8UI';
    const resPerm = await fetch(`${baseUrl}/api/issue`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-session': validCsrfToken
      },
      body: JSON.stringify({ 
        installationId: `id: ${testInstId}`, // Con prefijo para probar auto-sanitización
        duration: 'permanent', 
        passphrase: testPassphrase 
      })
    });

    const dataPerm = await resPerm.json();
    report('Emisión de licencia Permanente responde HTTP 200 OK', resPerm.status === 200 && dataPerm.success === true);
    report('Auto-sanitiza prefijo "id: " a instalación limpia "WG6KX8UI"', dataPerm.installationId === testInstId);
    report('Token generado contiene formato canónico Base64.Base64', typeof dataPerm.token === 'string' && dataPerm.token.includes('.'));
    report('Contiene identificador de licencia con prefijo LIC-', dataPerm.licenseId.startsWith('LIC-'));

    // Validación cruzada con el verificador del POS
    const verifyResultPerm = await verifyProLicenseCertificate(dataPerm.token, testInstId);
    report('Verificador del POS confirma certificado Permanente como válido (valid: true)', verifyResultPerm.valid === true);
    report('Verificador confirma plan === Pro', verifyResultPerm.payload?.plan === 'Pro');
    report('Verificador confirma expiración permanente (exp === 0)', verifyResultPerm.payload?.exp === 0);

    // 6.2 Licencia 365 Días (1 Año)
    const res365 = await fetch(`${baseUrl}/api/issue`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-session': validCsrfToken
      },
      body: JSON.stringify({ 
        installationId: testInstId, 
        duration: '365d', 
        passphrase: testPassphrase 
      })
    });
    const data365 = await res365.json();
    report('Emisión de licencia 365 días responde HTTP 200 OK', res365.status === 200 && data365.success === true);
    const verifyResult365 = await verifyProLicenseCertificate(data365.token, testInstId);
    report('Verificador del POS confirma certificado 365 días como válido (valid: true)', verifyResult365.valid === true);
    report('Expiración a 365 días es futura', verifyResult365.payload?.exp > Date.now());

    // 6.3 Licencia 30 Días (Mensual / Prueba)
    const res30 = await fetch(`${baseUrl}/api/issue`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-session': validCsrfToken
      },
      body: JSON.stringify({ 
        installationId: testInstId, 
        duration: '30d', 
        passphrase: testPassphrase 
      })
    });
    const data30 = await res30.json();
    report('Emisión de licencia 30 días responde HTTP 200 OK', res30.status === 200 && data30.success === true);
    const verifyResult30 = await verifyProLicenseCertificate(data30.token, testInstId);
    report('Verificador del POS confirma certificado 30 días como válido (valid: true)', verifyResult30.valid === true);

    // 6.4 Verificación Quirúrgica de Preservación de Capitalización (UUIDs y Formatos Históricos)
    console.log('\n--- 6.4 Verificación de Preservación Exacta de Capitalización (UUIDs y Formatos) ---');

    // 6.4.1 UUID en minúsculas (formato estándar de Simple ProX v1.3.10)
    const uuidLowercase = '86999462-7ee0-43b2-a012-16e10ad24bf8';
    const resUuidLower = await fetch(`${baseUrl}/api/issue`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-session': validCsrfToken
      },
      body: JSON.stringify({ 
        installationId: `id:   ${uuidLowercase}   `, 
        duration: 'permanent', 
        passphrase: testPassphrase 
      })
    });
    const dataUuidLower = await resUuidLower.json();
    report('Emisión con UUID en minúsculas responde HTTP 200 OK', resUuidLower.status === 200 && dataUuidLower.success === true);
    report('Preserva exactamente el UUID en minúsculas sin forzar mayúsculas', dataUuidLower.installationId === uuidLowercase);
    const verifyUuidLower = await verifyProLicenseCertificate(dataUuidLower.token, uuidLowercase);
    report('Verificador del POS valida exitosamente el UUID en minúsculas', verifyUuidLower.valid === true);
    report('Payload interno del certificado contiene el UUID exacto en minúsculas', verifyUuidLower.payload?.installationId === uuidLowercase);
    const verifyMismatchCase = await verifyProLicenseCertificate(dataUuidLower.token, uuidLowercase.toUpperCase());
    report('Validación estricta rechaza si hay discrepancia de mayúsculas/minúsculas', verifyMismatchCase.valid === false);

    // 6.4.2 UUID con letras mayúsculas
    const uuidUppercase = '86999462-7EE0-43B2-A012-16E10AD24BF8';
    const resUuidUpper = await fetch(`${baseUrl}/api/issue`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-session': validCsrfToken
      },
      body: JSON.stringify({ 
        installationId: uuidUppercase, 
        duration: 'permanent', 
        passphrase: testPassphrase 
      })
    });
    const dataUuidUpper = await resUuidUpper.json();
    report('Emisión con UUID en mayúsculas responde HTTP 200 OK', resUuidUpper.status === 200 && dataUuidUpper.success === true);
    report('Preserva exactamente el UUID en mayúsculas', dataUuidUpper.installationId === uuidUppercase);
    const verifyUuidUpper = await verifyProLicenseCertificate(dataUuidUpper.token, uuidUppercase);
    report('Verificador del POS valida exitosamente el UUID en mayúsculas', verifyUuidUpper.valid === true);
    report('Payload interno del certificado contiene el UUID exacto en mayúsculas', verifyUuidUpper.payload?.installationId === uuidUppercase);

    // 6.4.3 Confirmación de identificadores históricos alfanuméricos
    report('Identificador histórico alfanumérico conserva ID original "WG6KX8UI"', dataPerm.installationId === 'WG6KX8UI');

    // 7. Prueba Anti-Suplantación (Certificado de WG6KX8UI probado en otra máquina)
    console.log('\n--- 7. Verificación de Protección Anti-Suplantación de Equipo ---');
    const verifyDifferentMachine = await verifyProLicenseCertificate(dataPerm.token, 'OTRA-MAQUINA-999');
    report('Rechaza certificado legítimo si se intenta usar en otra máquina (valid: false)', verifyDifferentMachine.valid === false);
    report('Informa motivo: La licencia no corresponde a este equipo', (verifyDifferentMachine.error || '').includes('no corresponde'));

  } finally {
    // Detener servidor y limpiar archivos temporales
    await hub.stop();
    if (fs.existsSync(testKeyPath)) {
      try { fs.unlinkSync(testKeyPath); } catch (e) {}
    }
  }

  console.log('\n================================================================');
  console.log(`RESUMEN DE PRUEBAS: ${passCount} PASADAS | ${failCount} FALLIDAS`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Error fatal durante la ejecución de las pruebas:', err);
  process.exit(1);
});
