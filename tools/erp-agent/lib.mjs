// Pure logic of the ERP sync agent: ysoft rows → erp-sync batches. No I/O here except `send`, so it is unit-tested
// without MySQL. See docs/ERP_SYNC.md for the endpoint contract and the ysoft mapping.
import crypto from 'node:crypto';

export const VAT_RATES = [0, 4, 5, 10, 22];

/** "12.90" / 12.9 / "12,90" → 1290; empty, zero or invalid → null. */
export function toCents(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Date from MySQL (Date object, "YYYY-MM-DD[ hh:mm:ss]" or "DD/MM/YYYY") → "YYYY-MM-DD"; otherwise null. */
export function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : localIso(value);
  const s = String(value).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Today in Italy as YYYY-MM-DD. */
export function italyToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** promozioni.negozio: empty = every store, otherwise a list such as "1" or "1,3". */
export function promoAppliesTo(negozioField, storeNumber) {
  const s = String(negozioField ?? '').trim();
  if (!s) return true;
  return s.split(/[,;\s]+/).filter(Boolean).map(Number).includes(storeNumber);
}

/**
 * Picks the promotion to send for one article and store: the cheapest one running today, else the next one to start
 * (the shop switches it on by date). Candidates: { price_cents, starts_on, ends_on }. Ended or invalid ones are ignored.
 */
export function choosePromo(candidates, today) {
  const valid = candidates.filter((c) => c.price_cents && (!c.ends_on || c.ends_on >= today)
    && (!c.starts_on || !c.ends_on || c.ends_on >= c.starts_on));
  const running = valid.filter((c) => !c.starts_on || c.starts_on <= today).sort((a, b) => a.price_cents - b.price_cents);
  if (running.length) return running[0];
  return valid.sort((a, b) => (a.starts_on ?? '').localeCompare(b.starts_on ?? '') || a.price_cents - b.price_cents)[0] ?? null;
}

/**
 * Builds products[] and store_items[] for one store from ysoft rows.
 * rows = { products: [{ CodArticolo, CodBarre, Descrizione, PrezzoVedi1, CodIva, marca, PrezzoVediOfferta,
 *                       PrezzoVediOfferta_inizio, PrezzoVediOfferta_fine }],          (web = 1 only)
 *          storePrices: [{ CodArticolo, PrezzoVedi1 }],                                (latest negozio_prezzo row)
 *          promos: [{ CodArticolo, Prezzo_a, Data_a, Data_f, negozio }],               (promozioni + promozioni_list)
 *          stock: [{ CodArticolo, q }] }                                               (giacenza.G<n>)
 */
export function buildBatch(rows, { storeNumber, today, imageUrlTemplate }) {
  const storePrice = new Map(rows.storePrices.map((r) => [String(r.CodArticolo), toCents(r.PrezzoVedi1)]));
  const stock = new Map(rows.stock.map((r) => [String(r.CodArticolo), Math.max(0, Math.trunc(Number(r.q) || 0))]));
  const promos = new Map();
  for (const r of rows.promos) {
    if (!promoAppliesTo(r.negozio, storeNumber)) continue;
    const key = String(r.CodArticolo);
    if (!promos.has(key)) promos.set(key, []);
    promos.get(key).push({ price_cents: toCents(r.Prezzo_a), starts_on: toIsoDate(r.Data_a), ends_on: toIsoDate(r.Data_f) });
  }

  const products = [];
  const storeItems = [];
  const problems = [];
  for (const p of rows.products) {
    const code = String(p.CodArticolo);
    const list = toCents(p.PrezzoVedi1);
    const vat = Number(p.CodIva);
    if (!list) { problems.push({ erp_code: code, reason: 'missing_price' }); continue; }
    if (!VAT_RATES.includes(vat)) { problems.push({ erp_code: code, reason: 'invalid_vat' }); continue; }
    const barcode = String(p.CodBarre ?? '').replace(/\s/g, '');
    const product = {
      erp_code: code,
      name: String(p.Descrizione ?? '').trim(),
      barcode: /^\d{8,14}$/.test(barcode) ? barcode : undefined,
      brand: String(p.marca ?? '').trim() || undefined,
      vat_rate: vat,
      price_cents: list,
      active: true,
    };
    if (imageUrlTemplate && product.barcode) product.image_url = imageUrlTemplate.replaceAll('{barcode}', product.barcode).replaceAll('{code}', code);
    else if (imageUrlTemplate && !imageUrlTemplate.includes('{barcode}')) product.image_url = imageUrlTemplate.replaceAll('{code}', code);
    products.push(product);

    const candidates = [...(promos.get(code) ?? [])];
    const offer = toCents(p.PrezzoVediOfferta);
    if (offer) candidates.push({ price_cents: offer, starts_on: toIsoDate(p.PrezzoVediOfferta_inizio), ends_on: toIsoDate(p.PrezzoVediOfferta_fine) });
    const promo = choosePromo(candidates, today);
    const price = storePrice.get(code) ?? list;
    storeItems.push({
      erp_code: code,
      price_cents: price,
      promo_price_cents: promo && promo.price_cents < price ? promo.price_cents : null,
      promo_starts_on: promo && promo.price_cents < price ? promo.starts_on : null,
      promo_ends_on: promo && promo.price_cents < price ? promo.ends_on : null,
      quantity: stock.get(code) ?? 0,
    });
  }
  return { products, storeItems, problems };
}

export const fingerprint = (obj) => crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 16);

/**
 * Keeps only rows that changed since the last successful send (state = { products: {code: hash}, items: {key: hash} })
 * and deactivates articles that disappeared from the web list.
 */
export function diff(batch, state, storeCode) {
  const products = batch.products.filter((p) => state.products?.[p.erp_code] !== fingerprint(p));
  const present = new Set(batch.products.map((p) => p.erp_code));
  for (const code of Object.keys(state.products ?? {})) {
    if (!present.has(code) && state.products[code] !== 'inactive') products.push({ erp_code: code, active: false });
  }
  const storeItems = batch.storeItems.filter((i) => state.items?.[`${storeCode}:${i.erp_code}`] !== fingerprint(i));
  return { products, storeItems };
}

export const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/** POSTs one signed batch to erp-sync; throws on any non-2xx answer. */
export async function send(endpoint, secret, body, { fetchImpl = fetch, now = Date.now() } = {}) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(now / 1000));
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  const res = await fetchImpl(endpoint, {
    method: 'POST', body: raw,
    headers: { 'Content-Type': 'application/json', 'X-Casate-Timestamp': ts, 'X-Casate-Signature': `v1=${sig}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`erp-sync ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/**
 * One sync for one store: build, diff, send in chunks, and update the state after each successful chunk.
 * Returns a summary. `readRows(storeNumber)` loads the ysoft rows (see buildBatch).
 */
export async function syncStore({ storeCode, storeNumber, readRows, state, endpoint, secret, imageUrlTemplate, fetchImpl, now = new Date(), log = () => {} }) {
  const sentAt = now.toISOString();
  const rows = await readRows(storeNumber);
  const batch = buildBatch(rows, { storeNumber, today: italyToday(now), imageUrlTemplate });
  const changes = diff(batch, state, storeCode);
  const summary = { store_code: storeCode, read: batch.products.length, products_sent: 0, items_sent: 0, skipped: [], problems: batch.problems };
  state.products ??= {};
  state.items ??= {};
  for (const part of chunk(changes.products, 1000)) {
    const r = await send(endpoint, secret, { store_code: storeCode, sent_at: sentAt, products: part }, { fetchImpl });
    const bad = new Set((r.skipped ?? []).map((s) => s.erp_code));
    for (const p of part) if (!bad.has(p.erp_code)) state.products[p.erp_code] = p.active === false ? 'inactive' : fingerprint(p);
    summary.products_sent += part.length;
    summary.skipped.push(...(r.skipped ?? []));
    log(`products ${summary.products_sent}/${changes.products.length}`);
  }
  for (const part of chunk(changes.storeItems, 3000)) {
    const r = await send(endpoint, secret, { store_code: storeCode, sent_at: sentAt, store_items: part }, { fetchImpl });
    const bad = new Set((r.skipped ?? []).map((s) => s.erp_code));
    for (const i of part) if (!bad.has(i.erp_code)) state.items[`${storeCode}:${i.erp_code}`] = fingerprint(i);
    summary.items_sent += part.length;
    summary.skipped.push(...(r.skipped ?? []));
    log(`store items ${summary.items_sent}/${changes.storeItems.length}`);
  }
  return summary;
}
