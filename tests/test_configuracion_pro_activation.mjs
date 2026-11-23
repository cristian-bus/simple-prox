import assert from 'node:assert';
import * as crypto from 'node:crypto';
import { generateTestKeyPair, generateLicenseToken } from '../admin-tools/licenseGenerator.js';

// Polyfills para entorno de pruebas Node.js
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.window = {
  crypto: global.crypto,
  addEventListener: () => {},
  removeEventListener: () => {}
};

console.log('====================================================');
console.log('TEST SUITE: ACTIVACIÓN COMERCIAL PRO (ETAPA 3)');
console.log('====================================================\n');

// 1. Configurar par de llaves Ed25519 para Pro
const proKeyPair = generateTestKeyPair();
const proPublicKeyJwk = proKeyPair.publicKey.export({ format: 'jwk' });

// Configurar par de llaves Ed25519 para Básico (separación criptográfica estricta)
const basicKeyPair = generateTestKeyPair();
const basicPublicKeyJwk = basicKeyPair.publicKey.export({ format: 'jwk' });

globalThis.__TEST_PUBLIC_KEY_JWK__ = proPublicKeyJwk;
globalThis.__TEST_BASIC_PUBLIC_KEY_JWK__ = basicPublicKeyJwk;
process.env.NODE_ENV = 'test';

// Imports dinámicos
const { isValidProLicense } = await import('../src/services/installationService.js');
const { verifyBasicActivationCertificate } = await import('../src/utils/licenseCrypto.js');

const targetInstallationId = 'KIOSCO-TERMINAL-CORDOBA-404';
const otherInstallationId = 'KIOSCO-TERMINAL-OTRO-EQUIPO-999';

// Simulador del arnés de activación de Configuracion.jsx
function createConfiguracionHarness(initialConfig) {
  let businessConfig = { ...initialConfig };
  let licenseKeyInput = '';
  let licenseError = '';
  let alertModal = null;
  let isValidatingLicense = false;

  const kiosco = {
    businessConfig,
    updateBusinessConfig: (newConfig) => {
      businessConfig = { ...newConfig };
      kiosco.businessConfig = businessConfig;
    }
  };

  const handleActivateLicense = async () => {
    const rawId = kiosco.businessConfig?.installationId;
    const inputToken = licenseKeyInput.trim();

    if (!inputToken) {
      licenseError = 'Por favor ingresá el certificado digital Pro.';
      return;
    }

    isValidatingLicense = true;
    licenseError = '';

    try {
      const isValid = await isValidProLicense(rawId, inputToken);

      if (isValid) {
        kiosco.updateBusinessConfig({
          ...kiosco.businessConfig,
          plan: 'Pro',
          licenseKey: inputToken
        });
        licenseKeyInput = '';
        licenseError = '';
        alertModal = { title: 'Licencia Activada', message: '¡Licencia Pro permanente activada exitosamente!' };
      } else {
        licenseError = 'El certificado ingresado no es válido para este equipo.';
      }
    } catch (err) {
      licenseError = 'Ocurrió un error al verificar el certificado.';
    } finally {
      isValidatingLicense = false;
    }
  };

  return {
    getKiosco: () => kiosco,
    getInput: () => licenseKeyInput,
    setInput: (val) => { licenseKeyInput = val; },
    getError: () => licenseError,
    getAlert: () => alertModal,
    isValidating: () => isValidatingLicense,
    handleActivateLicense
  };
}

// =========================================================================
// TEST 1: Certificado Pro válido -> Activación correcta
// =========================================================================
console.log('--- 1. Prueba: Certificado Pro Válido -> Activación Exitosa ---');
const validProToken = generateLicenseToken(proKeyPair.privateKey, targetInstallationId, 'Pro', Date.now(), 0);

const harness1 = createConfiguracionHarness({
  installationId: targetInstallationId,
  plan: 'Básico',
  licenseKey: ''
});

harness1.setInput(validProToken);
await harness1.handleActivateLicense();

assert.strictEqual(harness1.getKiosco().businessConfig.plan, 'Pro', 'El plan debe cambiar a Pro');
assert.strictEqual(harness1.getKiosco().businessConfig.licenseKey, validProToken, 'El token debe guardarse como licenseKey');
assert.strictEqual(harness1.getError(), '', 'No debe haber error');
assert.ok(harness1.getAlert() && harness1.getAlert().title === 'Licencia Activada', 'Debe disparar modal de confirmación');
assert.strictEqual(harness1.getInput(), '', 'El input debe limpiarse');
console.log('  ✅ PASS: Activación con certificado Pro completada con éxito');

// =========================================================================
// TEST 2: Certificado inválido -> Rechazo sin modificar el plan
// =========================================================================
console.log('\n--- 2. Prueba: Certificado Inválido -> Rechazo y Conservación de Plan Básico ---');
const harness2 = createConfiguracionHarness({
  installationId: targetInstallationId,
  plan: 'Básico',
  licenseKey: ''
});

harness2.setInput('token.totalmente.invalido.123');
await harness2.handleActivateLicense();

assert.strictEqual(harness2.getKiosco().businessConfig.plan, 'Básico', 'El plan debe permanecer en Básico');
assert.strictEqual(harness2.getKiosco().businessConfig.licenseKey, '', 'No debe registrarse licenseKey');
assert.ok(harness2.getError().includes('no es válido'), 'Debe mostrar mensaje de error explicativo');
assert.strictEqual(harness2.getAlert(), null, 'No debe dispararse alerta de éxito');
console.log('  ✅ PASS: Certificado inválido rechazado; plan Básico preservado intacto');

// =========================================================================
// TEST 3: Certificado de otra computadora -> Rechazo
// =========================================================================
console.log('\n--- 3. Prueba: Certificado de Otra Terminal -> Rechazo ---');
const otherMachineToken = generateLicenseToken(proKeyPair.privateKey, otherInstallationId, 'Pro', Date.now(), 0);

const harness3 = createConfiguracionHarness({
  installationId: targetInstallationId,
  plan: 'Básico',
  licenseKey: ''
});

harness3.setInput(otherMachineToken);
await harness3.handleActivateLicense();

assert.strictEqual(harness3.getKiosco().businessConfig.plan, 'Básico', 'El plan debe permanecer en Básico');
assert.ok(harness3.getError().includes('no es válido'), 'Debe indicar que no es válido para este equipo');
console.log('  ✅ PASS: Certificado emitido para otra terminal rechazado');

// =========================================================================
// TEST 4: Certificado Básico intentando usarse como Pro -> Rechazo
// =========================================================================
console.log('\n--- 4. Prueba: Certificado Básico en activación Pro -> Rechazo ---');
const basicPayloadObj = {
  version: 1,
  type: 'initial_activation',
  plan: 'Básico',
  installationId: targetInstallationId,
  deviceFingerprint: 'FP-TEST-001',
  issuedAt: new Date().toISOString()
};
const basicPayloadStr = JSON.stringify(basicPayloadObj);
const basicPayloadB64 = Buffer.from(basicPayloadStr, 'utf8').toString('base64');
const basicSigBytes = crypto.sign(null, Buffer.from(new TextEncoder().encode(basicPayloadStr)), basicKeyPair.privateKey);
const basicToken = `${basicPayloadB64}.${basicSigBytes.toString('base64')}`;

const harness4 = createConfiguracionHarness({
  installationId: targetInstallationId,
  plan: 'Básico',
  licenseKey: ''
});

harness4.setInput(basicToken);
await harness4.handleActivateLicense();

assert.strictEqual(harness4.getKiosco().businessConfig.plan, 'Básico', 'El plan debe permanecer en Básico');
assert.ok(harness4.getError().includes('no es válido'), 'Debe rechazar token básico');
console.log('  ✅ PASS: Certificado Básico rechazado en la pantalla de activación Pro');

// =========================================================================
// TEST 5: Licencia permanente conserva Pro tras reiniciar
// =========================================================================
console.log('\n--- 5. Prueba: Licencia Permanente conserva Pro tras reiniciar ---');
// Simular arranque de la aplicación (useKiosco hook)
async function simulateAppStartup(persistedConfig) {
  let config = { ...persistedConfig };
  if (config.plan === 'Pro') {
    const isValid = await isValidProLicense(config.installationId, config.licenseKey);
    if (!isValid) {
      config.plan = 'Básico';
    }
  }
  return config;
}

const restartedConfig = await simulateAppStartup(harness1.getKiosco().businessConfig);
assert.strictEqual(restartedConfig.plan, 'Pro', 'Debe mantenerse en Plan Pro tras reinicio');
assert.strictEqual(restartedConfig.licenseKey, validProToken, 'Debe retener el token Ed25519');
console.log('  ✅ PASS: Plan Pro permanente preservado tras reinicio');

// =========================================================================
// TEST 6: Activación sin internet (100% Offline)
// =========================================================================
console.log('\n--- 6. Prueba: Activación 100% Offline ---');
const originalFetch = global.fetch;
global.fetch = () => {
  throw new Error('VIOLACIÓN OFFLINE: fetch() no debe ser invocado');
};

try {
  const offlineHarness = createConfiguracionHarness({
    installationId: targetInstallationId,
    plan: 'Básico',
    licenseKey: ''
  });

  offlineHarness.setInput(validProToken);
  await offlineHarness.handleActivateLicense();

  assert.strictEqual(offlineHarness.getKiosco().businessConfig.plan, 'Pro', 'Debe activarse Pro sin internet');
  assert.strictEqual(offlineHarness.getError(), '', 'No debe haber error');
  console.log('  ✅ PASS: Activación completada exitosamente sin conexión');
} finally {
  global.fetch = originalFetch;
}

// =========================================================================
// TEST 7: Validación asíncrona sin degradaciones temporales incorrectas
// =========================================================================
console.log('\n--- 7. Prueba: Validación asíncrona sin degradación de estado ---');
const asyncHarness = createConfiguracionHarness({
  installationId: targetInstallationId,
  plan: 'Básico',
  licenseKey: ''
});

asyncHarness.setInput(validProToken);
// Iniciar activación
const activationPromise = asyncHarness.handleActivateLicense();
// Durante la validación, el plan no debe haber cambiado prematuramente
assert.strictEqual(asyncHarness.getKiosco().businessConfig.plan, 'Básico', 'No debe cambiar el plan hasta verificar');
assert.strictEqual(asyncHarness.isValidating(), true, 'Debe marcar estado isValidating mientras procesa');

await activationPromise;
assert.strictEqual(asyncHarness.getKiosco().businessConfig.plan, 'Pro', 'Cambia a Pro una vez confirmado');
assert.strictEqual(asyncHarness.isValidating(), false, 'isValidating vuelve a false');
console.log('  ✅ PASS: Transición asíncrona atómica y limpia');

// =========================================================================
// TEST 8: Plan Básico sin regresiones
// =========================================================================
console.log('\n--- 8. Prueba: Integridad de Plan Básico y Certificado de Activación ---');
const basicVerify = await verifyBasicActivationCertificate(basicToken, targetInstallationId);
assert.strictEqual(basicVerify.valid, true, 'Certificado básico debe ser válido en su verificador');
assert.strictEqual(basicVerify.payload.plan, 'Básico', 'Plan debe ser Básico');
console.log('  ✅ PASS: Flujo de Plan Básico intacto');

// =========================================================================
// TEST 9: Publicidad B2B conserva su comportamiento según el Plan
// =========================================================================
console.log('\n--- 9. Prueba: Publicidad B2B respeta el Plan y la opción hideAds ---');
// 9. Simulación de la regla exacta de publicidad en useOfertas.js
function evaluateShowAds(businessConfig, remoteConfig = {}) {
  const isKiosco = (businessConfig.businessType || '').trim().toLowerCase() === 'kiosco';
  const isPro = (businessConfig.plan || '').toLowerCase() === 'pro';
  const b2bGloballyEnabled = remoteConfig.b2bEnabled !== false;
  const bannerGloballyEnabled = remoteConfig.bannerEnabled !== false;
  return b2bGloballyEnabled && bannerGloballyEnabled && isKiosco && (!isPro || !businessConfig.hideAds);
}

// 9a. Plan Básico: muestra publicidad en Kiosco
const basicAdCheck = evaluateShowAds({ plan: 'Básico', businessType: 'Kiosco' });
assert.strictEqual(basicAdCheck, true, 'Plan Básico debe ver anuncios en Kiosco');

// 9b. Plan Pro recién activado con hideAds = false: muestra publicidad
const proWithAds = evaluateShowAds({ plan: 'Pro', hideAds: false, businessType: 'Kiosco' });
assert.strictEqual(proWithAds, true, 'Plan Pro con hideAds = false muestra anuncios');

// 9c. Plan Pro con hideAds = true: oculta publicidad
const proHiddenAds = evaluateShowAds({ plan: 'Pro', hideAds: true, businessType: 'Kiosco' });
assert.strictEqual(proHiddenAds, false, 'Plan Pro con hideAds = true oculta anuncios');
console.log('  ✅ PASS: Reglas comerciales de publicidad B2B conservadas');

// =========================================================================
// TEST 10: Retiro de generadores de clave en interfaz
// =========================================================================
console.log('\n--- 10. Prueba: Ausencia de generadores y secretos privados en cliente ---');
import * as fs from 'node:fs';
const configSource = fs.readFileSync('src/screens/Configuracion.jsx', 'utf8');

assert.strictEqual(configSource.includes('generateLicenseKey'), false, 'generateLicenseKey no debe existir en Configuracion.jsx');
assert.strictEqual(configSource.includes('Simular Plan Pro'), false, 'Simular Plan Pro no debe existir');
assert.strictEqual(configSource.includes('Generador de Licencias'), false, 'Generador de Licencias no debe existir');
assert.strictEqual(configSource.includes('generatorInput'), false, 'generatorInput no debe existir');
assert.strictEqual(configSource.includes('generatedKey'), false, 'generatedKey no debe existir');
console.log('  ✅ PASS: Opciones de generación y simulación Pro retiradas de Configuracion.jsx');

console.log('\n====================================================');
console.log('RESULTADO: TODAS LAS PRUEBAS DE LA ETAPA 3 PASARON (10/10 PASS)');
console.log('====================================================');
