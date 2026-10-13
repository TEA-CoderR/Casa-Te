// ERP (ITO) sync through the real erp-sync Edge Function: signed batch → product, store price, promo and stock;
// the shop quote charges the promo; an unsigned or tampered batch is refused; till registration in the admin.
import crypto from 'node:crypto';
import { env, launch, shot, sql, step, watch } from './lib.mjs';

const post = (body, { secret = env.ERP_SYNC_SECRET, ts = Math.floor(Date.now() / 1000) } = {}) => {
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  return fetch(`${env.API_URL}/functions/v1/erp-sync`, {
    method: 'POST', body: raw,
    headers: { 'Content-Type': 'application/json', 'X-Casate-Timestamp': String(ts), 'X-Casate-Signature': `v1=${sig}` },
  });
};
const today = new Date().toISOString().slice(0, 10);

step('ERP sync: signed batch creates the product with store price, promo and stock');
let res = await post({ store_code: 'LU1', sent_at: new Date().toISOString(),
  products: [{ erp_code: '777001', name: 'Secchio pieghevole e2e', barcode: '8000000777001', vat_rate: 22, price_cents: 1290, weight_g: 450 }],
  store_items: [{ erp_code: '777001', price_cents: 1190, promo_price_cents: 990, promo_starts_on: today, promo_ends_on: today, quantity: 7 }] });
const result = await res.json();
if (res.status !== 200 || result.created !== 1 || result.store_items !== 1) throw new Error(`erp-sync failed: ${res.status} ${JSON.stringify(result)}`);
console.log(`  ${JSON.stringify(result)}`);
const inv = await sql(`select i.quantity || '/' || i.erp_quantity || '/' || i.price_cents || '/' || i.promo_price_cents from inventory i
  join products p on p.id = i.product_id join stores s on s.id = i.store_id where p.erp_code = '777001' and s.code = 'LU1'`);
if (inv.trim() !== '7/7/1190/990') throw new Error(`unexpected inventory ${inv}`);

step('ERP sync: tampered or old batches are refused');
res = await post({ store_code: 'LU1' }, { secret: 'wrong' });
if (res.status !== 401) throw new Error(`tampered batch accepted: ${res.status}`);
res = await post({ store_code: 'LU1' }, { ts: Math.floor(Date.now() / 1000) - 3600 });
if (res.status !== 401) throw new Error(`old batch accepted: ${res.status}`);
console.log('  401 for a wrong signature and for a replayed (old) batch');

step('Shop: the store promo is the price charged');
const quote = await (await fetch(`${env.API_URL}/rest/v1/rpc/quote_cart`, {
  method: 'POST', headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${env.ANON_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p: { store_id: (await sql(`select id from stores where code = 'LU1'`)).trim(), fulfilment: 'store',
    items: [{ product_id: (await sql(`select id from products where erp_code = '777001'`)).trim(), quantity: 2 }] } }),
})).json();
if (quote.lines?.[0]?.unit_price_cents !== 990 || quote.total_cents !== 1980) throw new Error(`unexpected quote ${JSON.stringify(quote)}`);
console.log('  2 × €9,90 (promo) = €19,80');

step('Admin: an online order is marked as rung up at the till');
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'it-IT' })).newPage(); watch(page, 'admin');
await page.goto(env.ADMIN_URL, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill('admin@casate.test');
await page.getByLabel('Password', { exact: true }).fill('Admin-Local-Pass-1');
await page.getByRole('button', { name: 'Accedi', exact: true }).click();
await page.getByText('Panoramica').first().waitFor();
await page.goto(`${env.ADMIN_URL}/orders?cassa=da`, { waitUntil: 'networkidle' });
await page.locator('a.row-link').first().click();
await page.getByRole('button', { name: 'Segna come registrato in cassa' }).click();
await page.getByText(/Registrato in cassa il/).waitFor();
await shot(page, 'cassa');
console.log(`  orders registered at the till: ${(await sql('select count(*) from orders where pos_registered_at is not null')).trim()}`);
await browser.close();
