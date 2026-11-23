import { getCampaignStatus, extractB2BMetadata } from '../src/utils/b2bUtils.js';

function assert(condition, message) {
  if (!condition) {
    console.error('❌ FAIL:', message);
    process.exit(1);
  } else {
    console.log('✅ PASS:', message);
  }
}

console.log('--- TEST 1: Campaña Vigente ---');
const c1 = {
  id: '1',
  status: 'active',
  start_date: '2026-10-01',
  end_date: '2026-10-31'
};
assert(getCampaignStatus(c1) === 'active', 'Campaña vigente debe retornar active');

console.log('--- TEST 2: Campaña Futura (Scheduled) ---');
const c2 = {
  id: '2',
  status: 'active',
  start_date: '2026-11-01',
  end_date: '2026-11-30'
};
assert(getCampaignStatus(c2) === 'scheduled', 'Campaña con inicio futuro debe retornar scheduled');

console.log('--- TEST 3: Campaña Vencida (Finished) ---');
const c3 = {
  id: '3',
  status: 'active',
  start_date: '2026-09-01',
  end_date: '2026-09-30'
};
assert(getCampaignStatus(c3) === 'finished', 'Campaña con fecha pasada debe retornar finished');

console.log('--- TEST 4: Campaña Pausada ---');
const c4 = {
  id: '4',
  status: 'paused',
  start_date: '2026-10-01',
  end_date: '2026-10-31'
};
assert(getCampaignStatus(c4) === 'paused', 'Campaña con status paused debe retornar paused');

console.log('--- TEST 5: Campaña Permanente (Sin fecha de fin) ---');
const c5 = {
  id: '5',
  status: 'active',
  start_date: '2026-10-01',
  end_date: null
};
assert(getCampaignStatus(c5) === 'active', 'Campaña sin end_date debe retornar active');

console.log('--- TEST 6: Precedencia meta.endDate sobre c.end_date de 2027 ---');
const c6_raw = {
  id: '6',
  status: 'active',
  start_date: '2026-09-07 20:35:41+00',
  end_date: '2027-09-07 20:35:41+00',
  description: '<!--B2B_META:{"startDate":"2026-09-07","endDate":"2026-10-07"}-->'
};
const { meta: meta6 } = extractB2BMetadata(c6_raw.description);
const start6 = (meta6 && meta6.startDate) ? meta6.startDate : (c6_raw.start_date || c6_raw.startDate || null);
const end6 = (meta6 && meta6.endDate) ? meta6.endDate : (c6_raw.end_date || c6_raw.endDate || null);

const status6 = getCampaignStatus({
  ...c6_raw,
  startDate: start6,
  endDate: end6
});
assert(status6 === 'finished', 'Campaña con meta.endDate vencida (2026-10-07) debe retornar finished pese a que c.end_date sea 2027');

console.log('--- TEST 7: Campaña sin meta.endDate que usa c.end_date futuro ---');
const c7_raw = {
  id: '7',
  status: 'active',
  start_date: '2026-08-25',
  end_date: '2027-08-25',
  description: 'Sin metadatos especiales'
};
const { meta: meta7 } = extractB2BMetadata(c7_raw.description);
const start7 = (meta7 && meta7.startDate) ? meta7.startDate : (c7_raw.start_date || c7_raw.startDate || null);
const end7 = (meta7 && meta7.endDate) ? meta7.endDate : (c7_raw.end_date || c7_raw.endDate || null);

const status7 = getCampaignStatus({
  ...c7_raw,
  startDate: start7,
  endDate: end7
});
assert(status7 === 'active', 'Campaña sin meta.endDate y con c.end_date 2027 debe retornar active');

console.log('\n🎉 TODOS LOS CASOS DE VIGENCIA PASARON EXITOSAMENTE!');
