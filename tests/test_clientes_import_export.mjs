// tests/test_clientes_import_export.mjs
import * as xlsx from 'xlsx';
import assert from 'node:assert';

console.log('=== TEST SUITE: IMPORTAR, EXPORTAR Y PROTECCIÓN DE ELIMINACIÓN DE CLIENTES ===\n');

// 1. Simulación de Estado Inicial de Clientes y Ventas
const initialClients = [
  { id: 1, name: "Consumidor Final", cuit: "00-00000000-0", phone: "", deuda: 0, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: 101, name: "Kiosco San Martín", cuit: "30-71234567-8", phone: "11-4455-6677", deuda: 1500, createdAt: "2026-01-15T10:00:00.000Z" },
  { id: 102, name: "María López", cuit: "27-33445566-9", phone: "11-9988-7766", deuda: 0, createdAt: "2026-02-20T12:00:00.000Z" },
  { id: 103, name: "Carlos Solo", cuit: "20-11111111-2", phone: "11-2222-3333", deuda: 0, createdAt: "2026-03-01T10:00:00.000Z" } // Cliente sin ventas ni deuda
];

const initialSales = [
  { id: 501, clientId: 101, client: "Kiosco San Martín", total: 1500, method: "Fiado", date: "2026-03-01T15:00:00.000Z" },
  { id: 502, clientId: 102, client: "María López", total: 800, method: "Efectivo", date: "2026-03-02T10:00:00.000Z" }
];

let clientsState = JSON.parse(JSON.stringify(initialClients));
let salesState = JSON.parse(JSON.stringify(initialSales));

// Función batchImportClients idéntica a useKiosco.js
function batchImportClients(importedClients) {
  let addedCount = 0;
  const existingNames = new Set(
    clientsState.map(c => (c.name || '').trim().toLowerCase()).filter(Boolean)
  );
  const existingCuits = new Set(
    clientsState
      .map(c => (c.cuit || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(c => c && c !== 'consumidorfinal' && c !== '0')
  );

  const toAdd = [];
  const now = Date.now();

  importedClients.forEach((c) => {
    const cleanName = (c.name || '').trim();
    if (!cleanName) return;

    const normName = cleanName.toLowerCase();
    const rawCuit = (c.cuit || '').trim();
    const normCuit = rawCuit.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isCuitValid = normCuit && normCuit !== 'consumidorfinal' && normCuit !== '0';

    const isDuplicate = existingNames.has(normName) || (isCuitValid && existingCuits.has(normCuit));

    if (!isDuplicate) {
      toAdd.push({
        id: now + addedCount,
        name: cleanName,
        cuit: rawCuit || 'Consumidor Final',
        phone: (c.phone || '').trim(),
        deuda: 0,
        createdAt: new Date().toISOString()
      });
      existingNames.add(normName);
      if (isCuitValid) existingCuits.add(normCuit);
      addedCount++;
    }
  });

  clientsState = [...clientsState, ...toAdd];
  return addedCount;
}

// Función deleteClient idéntica a useKiosco.js
function deleteClient(id) {
  if (id === 1) {
    return { success: false, reason: 'SYSTEM_CLIENT', message: 'No se puede eliminar el cliente de sistema Consumidor Final.' };
  }

  const target = clientsState.find(c => c.id === id);
  if (!target) {
    return { success: false, reason: 'NOT_FOUND', message: 'Cliente no encontrado.' };
  }

  if ((target.deuda || 0) > 0) {
    return { 
      success: false, 
      reason: 'HAS_DEBT', 
      message: `No es posible eliminar a "${target.name}" porque tiene una deuda activa de $${(target.deuda || 0).toLocaleString('es-AR')}. Debe regularizar o saldar su cuenta corriente antes de poder eliminarlo.` 
    };
  }

  const hasSales = (salesState || []).some(s => s.clientId === id || (s.client && target.name && s.client.trim().toLowerCase() === target.name.trim().toLowerCase()));
  if (hasSales) {
    return { 
      success: false, 
      reason: 'HAS_SALES', 
      message: `No es posible eliminar a "${target.name}" porque posee ventas históricas registradas. Para proteger la integridad de los comprobantes y estadísticas contables, este cliente no puede ser eliminado.` 
    };
  }

  clientsState = clientsState.filter(c => c.id !== id);
  return { success: true, message: `Cliente "${target.name}" eliminado correctamente.` };
}

// Lógica de mapeo y parseo idéntica a Clientes.jsx
function parseExcelData(data) {
  const headers = Array.from(new Set(data.flatMap(row => Object.keys(row))));
  const autoMap = (possibleNames) => {
    return headers.find(h => possibleNames.some(p => h.toLowerCase().trim().includes(p.toLowerCase()))) || '';
  };

  const colName = autoMap(['nombre', 'cliente', 'razon social', 'razón social', 'contacto', 'name']);
  const colCuit = autoMap(['cuit', 'dni', 'documento', 'identificacion', 'identificación']);
  const colPhone = autoMap(['telefono', 'teléfono', 'celular', 'movil', 'móvil', 'phone', 'whatsapp', 'tel']);

  if (!colName) throw new Error('Columna de Nombre no encontrada');

  const existingNames = new Set(
    clientsState.map(c => (c.name || '').trim().toLowerCase()).filter(Boolean)
  );
  const existingCuits = new Set(
    clientsState
      .map(c => (c.cuit || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(c => c && c !== 'consumidorfinal' && c !== '0')
  );

  const validClients = [];
  let duplicateCount = 0;
  let invalidCount = 0;

  data.forEach(row => {
    const rawName = row[colName] != null ? String(row[colName]).trim() : '';
    if (!rawName) {
      invalidCount++;
      return;
    }

    const normName = rawName.toLowerCase();
    const rawCuit = colCuit && row[colCuit] != null ? String(row[colCuit]).trim() : '';
    const normCuit = rawCuit.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isCuitValid = normCuit && normCuit !== 'consumidorfinal' && normCuit !== '0';
    const rawPhone = colPhone && row[colPhone] != null ? String(row[colPhone]).trim() : '';

    const isDuplicate = existingNames.has(normName) || (isCuitValid && existingCuits.has(normCuit));

    if (isDuplicate) {
      duplicateCount++;
    } else {
      validClients.push({
        name: rawName,
        cuit: rawCuit || 'Consumidor Final',
        phone: rawPhone
      });
      existingNames.add(normName);
      if (isCuitValid) existingCuits.add(normCuit);
    }
  });

  return { validClients, duplicateCount, invalidCount };
}

// ----------------------------------------------------
// PRUEBA 1: Exportación a Excel
// ----------------------------------------------------
console.log('--- PRUEBA 1: Exportación a Excel ---');
const commercialClients = clientsState.filter(c => c.id !== 1);
assert.strictEqual(commercialClients.length, 3, 'Debe haber 3 clientes comerciales excluyendo Consumidor Final');

const exportData = commercialClients.map(c => ({
  'Nombre': c.name || '',
  'CUIT/DNI': c.cuit && c.cuit !== 'Consumidor Final' ? c.cuit : '',
  'Teléfono': c.phone || '',
  'Saldo Deudor': c.deuda || 0,
  'Fecha Registro': c.createdAt
}));

const worksheet = xlsx.utils.json_to_sheet(exportData);
const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(workbook, worksheet, 'Clientes');
const xlsxBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

assert.ok(xlsxBuffer.length > 0, 'El archivo generado no debe estar vacío');
console.log('✅ PASS: Exportación generada correctamente.\n');

// ----------------------------------------------------
// PRUEBA 2: Intentar eliminar Consumidor Final (id === 1)
// ----------------------------------------------------
console.log('--- PRUEBA 2: Bloqueo de eliminación de Consumidor Final (id === 1) ---');
const resDeleteCF = deleteClient(1);
assert.strictEqual(resDeleteCF.success, false, 'Consumidor Final no debe poder eliminarse');
assert.strictEqual(resDeleteCF.reason, 'SYSTEM_CLIENT');
assert.ok(clientsState.some(c => c.id === 1), 'Consumidor Final debe seguir existiendo en clientsState');
console.log('✅ PASS: Eliminación de Consumidor Final bloqueada correctamente.\n');

// ----------------------------------------------------
// PRUEBA 3: Intentar eliminar cliente con deuda activa (deuda > 0)
// ----------------------------------------------------
console.log('--- PRUEBA 3: Bloqueo de eliminación de cliente con deuda activa ---');
const resDeleteDebt = deleteClient(101); // Kiosco San Martín, deuda 1500
assert.strictEqual(resDeleteDebt.success, false, 'Cliente con deuda no debe poder eliminarse');
assert.strictEqual(resDeleteDebt.reason, 'HAS_DEBT');
assert.ok(clientsState.some(c => c.id === 101), 'Kiosco San Martín debe permanecer intacto');
assert.strictEqual(clientsState.find(c => c.id === 101).deuda, 1500, 'La deuda de $1500 debe permanecer intacta');
console.log('✅ PASS: Eliminación de cliente con deuda bloqueada y saldo protegido.\n');

// ----------------------------------------------------
// PRUEBA 4: Intentar eliminar cliente con deuda 0 pero con historial de ventas
// ----------------------------------------------------
console.log('--- PRUEBA 4: Bloqueo de eliminación de cliente sin deuda pero con ventas históricas ---');
const resDeleteSales = deleteClient(102); // María López, deuda 0, tiene venta 502
assert.strictEqual(resDeleteSales.success, false, 'Cliente con ventas históricas no debe poder eliminarse');
assert.strictEqual(resDeleteSales.reason, 'HAS_SALES');
assert.ok(clientsState.some(c => c.id === 102), 'María López debe permanecer en clientsState');
console.log('✅ PASS: Eliminación de cliente con ventas históricas bloqueada.\n');

// ----------------------------------------------------
// PRUEBA 5: Eliminar cliente sin deuda y sin ventas históricas
// ----------------------------------------------------
console.log('--- PRUEBA 5: Eliminación permitida para cliente sin deuda ni ventas ---');
const resDeleteClean = deleteClient(103); // Carlos Solo, deuda 0, sin ventas
assert.strictEqual(resDeleteClean.success, true, 'Cliente limpio debe poder eliminarse');
assert.ok(!clientsState.some(c => c.id === 103), 'Carlos Solo debe haber sido removido');
console.log('✅ PASS: Cliente sin referencias eliminado exitosamente.\n');

// ----------------------------------------------------
// PRUEBA 6: Integridad de importación (nuevos clientes entran con deuda 0 y sin duplicar)
// ----------------------------------------------------
console.log('--- PRUEBA 6: Importar clientes nuevos y verificar deuda 0 e idempotencia ---');
const newClientsFileData = [
  { 'Nombre': 'Distribuidora del Parque', 'CUIT': '30-44556677-8', 'Teléfono': '11-6677-8899' }
];

const parsedNew = parseExcelData(newClientsFileData);
assert.strictEqual(parsedNew.validClients.length, 1);
const addedCount = batchImportClients(parsedNew.validClients);
assert.strictEqual(addedCount, 1);

const importedClient = clientsState.find(c => c.name === 'Distribuidora del Parque');
assert.ok(importedClient);
assert.strictEqual(importedClient.deuda, 0, 'La deuda de un cliente importado DEBE ser 0');

// Reimportar el mismo archivo
const parsedDup = parseExcelData(newClientsFileData);
assert.strictEqual(parsedDup.duplicateCount, 1);
const reAdded = batchImportClients(parsedDup.validClients);
assert.strictEqual(reAdded, 0, 'No debe duplicar');
console.log('✅ PASS: Importación segura y no destructiva verificada.\n');

console.log('====================================================');
console.log('TODAS LAS PRUEBAS (6/6) PASARON EXITOSAMENTE.');
console.log('====================================================');
