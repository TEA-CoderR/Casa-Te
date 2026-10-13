import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildBatch, choosePromo, diff, fingerprint, italyToday, promoAppliesTo, send, syncStore, toCents, toIsoDate } from '../lib.mjs';

const rows = () => ({
  products: [
    { CodArticolo: 10001, CodBarre: '8435269954351', Descrizione: ' SALDATOIO ', PrezzoVedi1: '5.90', CodIva: 22, marca: 'VILEDA',
      PrezzoVediOfferta: '', PrezzoVediOfferta_inizio: '', PrezzoVediOfferta_fine: '' },
    { CodArticolo: 10002, CodBarre: 'X1', Descrizione: 'SERRATURA', PrezzoVedi1: '4.90', CodIva: 22, marca: null,
      PrezzoVediOfferta: '3.90', PrezzoVediOfferta_inizio: '01/10/2026', PrezzoVediOfferta_fine: '31/10/2026' },
    { CodArticolo: 10003, CodBarre: '', Descrizione: 'SENZA PREZZO', PrezzoVedi1: '0.00', CodIva: 22 },
    { CodArticolo: 10004, CodBarre: '', Descrizione: 'IVA STRANA', PrezzoVedi1: '1.00', CodIva: 9 },
  ],
  storePrices: [{ CodArticolo: 10001, PrezzoVedi1: '5.50' }],
  promos: [
    { CodArticolo: 10001, Prezzo_a: '4.99', Data_a: '2026-10-01', Data_f: '2026-10-20', negozio: '3' },
    { CodArticolo: 10001, Prezzo_a: '3.00', Data_a: '2026-10-01', Data_f: '2026-10-20', negozio: '1' },
    { CodArticolo: 10002, Prezzo_a: '3.50', Data_a: '2026-11-01', Data_f: '2026-11-30', negozio: '' },
  ],
  stock: [{ CodArticolo: 10001, q: 7 }, { CodArticolo: 10002, q: -2 }],
});

test('helpers', () => {
  assert.equal(toCents('12.90'), 1290); assert.equal(toCents('12,9'), 1290); assert.equal(toCents('0.00'), null); assert.equal(toCents(''), null);
  assert.equal(toIsoDate('2026-10-05 12:00:00'), '2026-10-05'); assert.equal(toIsoDate('5/9/2026'), '2026-09-05'); assert.equal(toIsoDate('x'), null);
  assert.equal(promoAppliesTo('', 3), true); assert.equal(promoAppliesTo('1,3', 3), true); assert.equal(promoAppliesTo('1', 3), false);
  assert.equal(italyToday(new Date('2026-10-13T22:30:00Z')), '2026-10-14');
});

test('choosePromo: cheapest running, else next to start; ended ignored', () => {
  const today = '2026-10-13';
  assert.equal(choosePromo([{ price_cents: 500, starts_on: '2026-10-01', ends_on: '2026-10-31' }, { price_cents: 400, starts_on: '2026-10-10', ends_on: null }], today).price_cents, 400);
  assert.equal(choosePromo([{ price_cents: 300, starts_on: '2026-09-01', ends_on: '2026-09-30' }, { price_cents: 450, starts_on: '2026-11-01', ends_on: '2026-11-30' }], today).price_cents, 450);
  assert.equal(choosePromo([{ price_cents: 300, starts_on: '2026-09-01', ends_on: '2026-09-30' }], today), null);
});

test('buildBatch: web articles, store price, promo for this store, stock ≥ 0, problems reported', () => {
  const b = buildBatch(rows(), { storeNumber: 3, today: '2026-10-13', imageUrlTemplate: 'https://img.example.com/{barcode}.jpg' });
  assert.deepEqual(b.problems, [{ erp_code: '10003', reason: 'missing_price' }, { erp_code: '10004', reason: 'invalid_vat' }]);
  assert.deepEqual(b.products[0], { erp_code: '10001', name: 'SALDATOIO', barcode: '8435269954351', brand: 'VILEDA', vat_rate: 22,
    price_cents: 590, active: true, image_url: 'https://img.example.com/8435269954351.jpg' });
  assert.equal(b.products[1].barcode, undefined);
  assert.equal(b.products[1].image_url, undefined, 'no barcode, no photo URL');
  assert.deepEqual(b.storeItems[0], { erp_code: '10001', price_cents: 550, promo_price_cents: 499, promo_starts_on: '2026-10-01', promo_ends_on: '2026-10-20', quantity: 7 });
  // 10002: product offer (running) beats the November promo; negative stock → 0
  assert.deepEqual(b.storeItems[1], { erp_code: '10002', price_cents: 490, promo_price_cents: 390, promo_starts_on: '2026-10-01', promo_ends_on: '2026-10-31', quantity: 0 });
});

test('diff: only changes; removed web articles are deactivated', () => {
  const b = buildBatch(rows(), { storeNumber: 3, today: '2026-10-13' });
  const state = { products: { '10001': fingerprint(b.products[0]), '99999': 'x' }, items: { 'LU3:10001': fingerprint(b.storeItems[0]) } };
  const d = diff(b, state, 'LU3');
  assert.deepEqual(d.products.map((p) => p.erp_code), ['10002', '99999']);
  assert.deepEqual(d.products[1], { erp_code: '99999', active: false });
  assert.deepEqual(d.storeItems.map((i) => i.erp_code), ['10002']);
});

test('send signs the body; syncStore updates state only for accepted rows', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    const ts = init.headers['X-Casate-Timestamp'];
    const expected = crypto.createHmac('sha256', 's3cret').update(`${ts}.${init.body}`).digest('hex');
    assert.equal(init.headers['X-Casate-Signature'], `v1=${expected}`);
    const body = JSON.parse(init.body);
    seen.push(body);
    const skipped = (body.products ?? []).filter((p) => p.erp_code === '10002').map((p) => ({ erp_code: p.erp_code, reason: 'sku_taken' }));
    return new Response(JSON.stringify({ skipped }), { status: 200 });
  };
  const state = {};
  const s = await syncStore({ storeCode: 'LU3', storeNumber: 3, readRows: async () => rows(), state, endpoint: 'https://x/erp-sync',
    secret: 's3cret', fetchImpl, now: new Date('2026-10-13T08:00:00Z') });
  assert.equal(s.products_sent, 2);
  assert.equal(s.items_sent, 2);
  assert.ok(state.products['10001'] && !state.products['10002'], 'skipped product retried next time');
  assert.equal(seen[0].store_code, 'LU3');
  assert.equal(seen[0].sent_at, '2026-10-13T08:00:00.000Z');
  // second run: nothing changed except the retried product
  seen.length = 0;
  await syncStore({ storeCode: 'LU3', storeNumber: 3, readRows: async () => rows(), state, endpoint: 'https://x/erp-sync', secret: 's3cret', fetchImpl });
  assert.deepEqual(seen.map((b) => (b.products ?? b.store_items).map((x) => x.erp_code)), [['10002']]);
  await assert.rejects(send('https://x', 's', {}, { fetchImpl: async () => new Response('no', { status: 401 }) }), /erp-sync 401/);
});
