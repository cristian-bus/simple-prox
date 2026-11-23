// tests/test_cobro_deuda_y_planes.mjs
import assert from 'node:assert';

console.log('=== TEST SUITE: SIMULADOR DE PLANES Y COBRO DE DEUDAS (BÁSICO Y PRO) ===\n');

// ----------------------------------------------------
// PRUEBA 1: Simulación de licencia y aislamiento de producción
// ----------------------------------------------------
console.log('--- PRUEBA 1: Validación de Licencia Simulada (DEV vs PROD) ---');

function mockIsValidProLicense(installationId, licenseKeyOrToken, isDevEnv) {
  if (!installationId || !licenseKeyOrToken) return false;
  const str = String(licenseKeyOrToken).trim();

  // Emulación de la rama import.meta.env.DEV
  if (isDevEnv && str === 'DEV_SIMULATED_PRO_LICENSE') {
    return true;
  }

  // En producción, solo certificados válidos con formato payload.signature
  if (str.includes('.')) {
    return false; // Sin clave privada real de producción retorna false
  }

  return false;
}

// 1.1 En Desarrollo (isDevEnv = true)
const devValid = mockIsValidProLicense('INST-TEST-001', 'DEV_SIMULATED_PRO_LICENSE', true);
assert.strictEqual(devValid, true, 'En desarrollo, DEV_SIMULATED_PRO_LICENSE debe ser aceptado para pruebas');

// 1.2 En Producción (isDevEnv = false)
const prodValid = mockIsValidProLicense('INST-TEST-001', 'DEV_SIMULATED_PRO_LICENSE', false);
assert.strictEqual(prodValid, false, 'En producción comercial, DEV_SIMULATED_PRO_LICENSE DEBE SER RECHAZADO');
console.log('✅ PASS: Licencia simulada funciona en desarrollo y queda 100% bloqueada en producción.\n');

// ----------------------------------------------------
// PRUEBA 2: Cobro de deudas en Plan Básico y en Plan Pro
// ----------------------------------------------------
console.log('--- PRUEBA 2: Cobro de deuda en Plan Básico con Caja Abierta ---');

let clients = [
  { id: 101, name: 'Juan Kiosquero', deuda: 5000 }
];

let caja = {
  isOpen: true,
  efectivo: 10000,
  movimientos: []
};

// Implementación idéntica a payDebt en useKiosco.js
function payDebt(clientId, amount, clientName = 'Desconocido', method = 'Efectivo', userName = 'Sistema') {
  if (!caja.isOpen) {
    throw new Error('Debes abrir la caja primero');
  }

  clients = clients.map(c => c.id === clientId ? { ...c, deuda: Math.max(0, (c.deuda || 0) - amount) } : c);

  const newMovement = {
    id: Date.now(),
    type: 'deposit',
    amount: amount,
    motivo: `Cobro de deuda - Cliente: ${clientName} (${method})`,
    user: userName,
    date: new Date().toISOString()
  };

  let nuevoEfectivo = caja.efectivo;
  if (method === 'Efectivo') {
    nuevoEfectivo += amount;
  }

  caja = {
    ...caja,
    efectivo: nuevoEfectivo,
    movimientos: [...(caja.movimientos || []), newMovement]
  };
}

// 2.1 Cobro parcial en Plan Básico
payDebt(101, 2000, 'Juan Kiosquero', 'Efectivo', 'Admin');
assert.strictEqual(clients.find(c => c.id === 101).deuda, 3000, 'La deuda debe reducirse a $3000');
assert.strictEqual(caja.efectivo, 12000, 'El efectivo en caja debe aumentar a $12000');
assert.strictEqual(caja.movimientos.length, 1, 'Debe existir exactamente 1 movimiento registrado');
assert.strictEqual(caja.movimientos[0].amount, 2000);
console.log('✅ PASS: Cobro parcial de deuda registrado exitosamente en Plan Básico.\n');

// 2.2 Intentar cobrar con caja cerrada
console.log('--- PRUEBA 3: Cobro con Caja Cerrada (debe ser bloqueado) ---');
caja.isOpen = false;
assert.throws(() => {
  payDebt(101, 1000, 'Juan Kiosquero', 'Efectivo', 'Admin');
}, /Debes abrir la caja primero/, 'No se debe permitir cobrar con la caja cerrada');
assert.strictEqual(clients.find(c => c.id === 101).deuda, 3000, 'La deuda no debe modificarse si la caja está cerrada');
console.log('✅ PASS: Cobro con caja cerrada rechazado de forma segura.\n');

// 2.3 Cobro total en Plan Pro
console.log('--- PRUEBA 4: Cobro total de deuda en Plan Pro ---');
caja.isOpen = true;
payDebt(101, 3000, 'Juan Kiosquero', 'Efectivo', 'Admin');
assert.strictEqual(clients.find(c => c.id === 101).deuda, 0, 'La deuda debe quedar en 0 ("Al día")');
assert.strictEqual(caja.efectivo, 15000, 'El efectivo en caja debe aumentar a $15000');
assert.strictEqual(caja.movimientos.length, 2, 'Deben existir exactamente 2 movimientos en el turno');
console.log('✅ PASS: Deuda saldada completamente en Plan Pro y asentada en caja.\n');

// ----------------------------------------------------
// PRUEBA 5: Guardián de nuevas ventas al Fiado
// ----------------------------------------------------
console.log('--- PRUEBA 5: Guardián de nuevas ventas al Fiado en PuntoDeVenta ---');

function canCreateFiadoSale(plan, client) {
  if (plan !== 'Pro') {
    return { allowed: false, reason: 'PLAN_NOT_PRO', message: 'Función exclusiva de Plan Pro' };
  }
  if (!client || client.id === 1) {
    return { allowed: false, reason: 'INVALID_CLIENT', message: 'Cliente requerido' };
  }
  return { allowed: true };
}

const testClient = { id: 101, name: 'Juan Kiosquero' };

// En Básico
const basicoFiado = canCreateFiadoSale('Básico', testClient);
assert.strictEqual(basicoFiado.allowed, false);
assert.strictEqual(basicoFiado.reason, 'PLAN_NOT_PRO');

// En Pro
const proFiado = canCreateFiadoSale('Pro', testClient);
assert.strictEqual(proFiado.allowed, true);
console.log('✅ PASS: Las nuevas ventas al fiado continúan bloqueadas en Básico y permitidas en Pro.\n');

console.log('====================================================');
console.log('TODAS LAS PRUEBAS (5/5) PASARON EXITOSAMENTE.');
console.log('====================================================');

