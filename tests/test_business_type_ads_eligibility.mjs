import assert from 'assert';

console.log('====================================================');
console.log('TEST SUITE: ELEGIBILIDAD DE PUBLICIDAD POR RUBRO');
console.log('====================================================\n');

// Simulación de la regla exacta implementada en src/hooks/useOfertas.js
function evaluateShowAds(businessConfig, remoteConfig = {}) {
  const isKiosco = (businessConfig.businessType || '').trim().toLowerCase() === 'kiosco';
  const isPro = (businessConfig.plan || '').toLowerCase() === 'pro';
  
  const b2bGloballyEnabled = remoteConfig.b2bEnabled !== false;
  const bannerGloballyEnabled = remoteConfig.bannerEnabled !== false;
  
  return b2bGloballyEnabled && bannerGloballyEnabled && isKiosco && (!isPro || !businessConfig.hideAds);
}

// 1. Plan Básico con rubro "Kiosco" (Capitalizado)
console.log('--- 1. Prueba: Plan Básico con rubro "Kiosco" ---');
const res1 = evaluateShowAds({ businessType: 'Kiosco', plan: 'Básico' });
assert.strictEqual(res1, true, 'Debe mostrar publicidad para "Kiosco"');
console.log('  ✅ PASS: Publicidad visible para rubro "Kiosco"');

// 2. Plan Básico con rubro "kiosco" (Minúsculas)
console.log('\n--- 2. Prueba: Plan Básico con rubro "kiosco" ---');
const res2 = evaluateShowAds({ businessType: 'kiosco', plan: 'Básico' });
assert.strictEqual(res2, true, 'Debe mostrar publicidad para "kiosco"');
console.log('  ✅ PASS: Publicidad visible para rubro "kiosco"');

// 3. Plan Básico con rubro "KIOSCO" (Mayúsculas)
console.log('\n--- 3. Prueba: Plan Básico con rubro "KIOSCO" ---');
const res3 = evaluateShowAds({ businessType: 'KIOSCO', plan: 'Básico' });
assert.strictEqual(res3, true, 'Debe mostrar publicidad para "KIOSCO"');
console.log('  ✅ PASS: Publicidad visible para rubro "KIOSCO"');

// 3.1 Plan Básico con espacios accidentales " Kiosco "
console.log('\n--- 3.1 Prueba: Plan Básico con espacios " Kiosco " ---');
const res3b = evaluateShowAds({ businessType: ' Kiosco ', plan: 'Básico' });
assert.strictEqual(res3b, true, 'Debe mostrar publicidad para " Kiosco "');
console.log('  ✅ PASS: Publicidad visible con espacios trimmeados');

// 4. Plan Pro: toggle hideAds desactivado (quiere ver ofertas)
console.log('\n--- 4. Prueba: Plan Pro con hideAds = false ---');
const res4a = evaluateShowAds({ businessType: 'Kiosco', plan: 'Pro', hideAds: false });
assert.strictEqual(res4a, true, 'Plan Pro con hideAds=false debe ver anuncios');
console.log('  ✅ PASS: Plan Pro con hideAds = false muestra anuncios');

// 4.1 Plan Pro: toggle hideAds activado (oculta ofertas)
console.log('\n--- 4.1 Prueba: Plan Pro con hideAds = true ---');
const res4b = evaluateShowAds({ businessType: 'Kiosco', plan: 'Pro', hideAds: true });
assert.strictEqual(res4b, false, 'Plan Pro con hideAds=true debe ocultar anuncios');
console.log('  ✅ PASS: Plan Pro con hideAds = true oculta anuncios');

// 5. Otros rubros (no kioscos)
console.log('\n--- 5. Prueba: Otros rubros no kiosco ---');
const res5a = evaluateShowAds({ businessType: 'barberia', plan: 'Básico' });
assert.strictEqual(res5a, false, 'Rubro barberia no debe recibir banners de kiosco');

const res5b = evaluateShowAds({ businessType: 'petshop', plan: 'Básico' });
assert.strictEqual(res5b, false, 'Rubro petshop no debe recibir banners de kiosco');

const res5c = evaluateShowAds({ businessType: 'libreria', plan: 'Básico' });
assert.strictEqual(res5c, false, 'Rubro libreria no debe recibir banners de kiosco');
console.log('  ✅ PASS: Otros rubros excluidos de anuncios de kiosco según reglas');

// 6. Flags globales de Remote Config
console.log('\n--- 6. Prueba: Flags de Remote Config ---');
const res6a = evaluateShowAds({ businessType: 'Kiosco', plan: 'Básico' }, { b2bEnabled: false });
assert.strictEqual(res6a, false, 'Kill switch b2bEnabled apaga anuncios');

const res6b = evaluateShowAds({ businessType: 'Kiosco', plan: 'Básico' }, { bannerEnabled: false });
assert.strictEqual(res6b, false, 'Kill switch bannerEnabled apaga anuncios');
console.log('  ✅ PASS: Kill switches globales de Remote Config respetados');

console.log('\n====================================================');
console.log('RESULTADO: TODAS LAS PRUEBAS DE RUBRO PASARON (PASS)');
console.log('====================================================');

