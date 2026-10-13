#!/usr/bin/env node
// CASA & TE ERP sync agent. Runs on the CASA & TE server next to the ysoft MySQL copy of ITO and pushes web
// articles, store prices, promotions and stock to the shop (Supabase Edge Function erp-sync).
//
//   node agent.mjs --analyze   count articles by candidate "on sale" rules (web flag, stock, recent sales), send nothing
//   node agent.mjs --dry-run   read MySQL, write dry-run.json (what would be sent), send nothing
//   node agent.mjs --once      one sync (for Windows Task Scheduler / cron, e.g. every 5 minutes)
//   node agent.mjs --loop      sync every `intervalMinutes`
//   add --full                 resend everything (also done automatically once a day)
//
// Configuration: config.json next to this file (see config.example.json). Secrets come from environment
// variables ERP_MYSQL_PASSWORD and ERP_SYNC_SECRET; they are never written to config.json or the logs.
// The MySQL user only needs SELECT on ysoft.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncStore, buildBatch, italyToday } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
const secret = process.env.ERP_SYNC_SECRET ?? '';
const statePath = path.join(HERE, config.stateFile ?? 'state.json');
const log = (...m) => console.log(new Date().toISOString(), ...m);

// Which articles go online, per store n: in stock there and/or sold there in the last soldInStoreDays days
// (ITO's web flag is not used by CASA & TE). excludeStopped drops articles listed in prodotti_stop.
const selection = { stockInStore: true, soldInStoreDays: 365, excludeStopped: false, ...(config.selection ?? {}) };
if (!Number.isInteger(selection.soldInStoreDays) || selection.soldInStoreDays < 0 || selection.soldInStoreDays > 3650) {
  throw new Error('selection.soldInStoreDays must be an integer between 0 and 3650 (0 = ignore sales)');
}
/** SQL condition on alias p for store n (n is validated 0–9, days is an integer). */
function selectionSql(n) {
  const days = selection.soldInStoreDays;
  const parts = [];
  if (selection.stockInStore) parts.push(`p.CodArticolo in (select CodArticolo from giacenza where G${n} > 0)`);
  if (days > 0) parts.push(`p.CodArticolo in (select CodArticolo from vendite_list_2026 where Negozio = ${n} and Data >= now() - interval ${days} day
      union select CodArticolo from vendite_list_2025 where Negozio = ${n} and Data >= now() - interval ${days} day)`);
  if (!parts.length) throw new Error('selection: enable stockInStore and/or soldInStoreDays');
  const stop = selection.excludeStopped ? ' and p.CodArticolo not in (select CodArticolo from prodotti_stop)' : '';
  return `(${parts.join(' or ')})${stop}`;
}

for (const [code, n] of Object.entries(config.stores ?? {})) {
  if (!/^[A-Z0-9_-]{2,12}$/.test(code) || !Number.isInteger(n) || n < 0 || n > 9) throw new Error(`Invalid store mapping ${code}: ${n}`);
}

async function connect() {
  const mysql = await import('mysql2/promise');
  return mysql.createConnection({
    host: config.mysql.host, port: config.mysql.port ?? 3306, user: config.mysql.user,
    password: process.env.ERP_MYSQL_PASSWORD ?? '', database: config.mysql.database ?? 'ysoft',
    dateStrings: true, charset: config.mysql.charset ?? 'utf8mb4',
  });
}

/** Reads the rows buildBatch needs for store number n (n is validated 0–9, so the column name is safe). */
function rowReader(db) {
  return async (n) => {
    const q = async (sql, params = []) => (await db.query(sql, params))[0];
    return {
      products: await q(`select p.CodArticolo, p.CodBarre, p.Descrizione, p.PrezzoVedi1, p.CodIva, m.Descrizione as marca,
          p.PrezzoVediOfferta, p.PrezzoVediOfferta_inizio, p.PrezzoVediOfferta_fine
        from prodotti p left join prodotti_marca m on m.uid = p.marca where ${selectionSql(n)}`),
      storePrices: await q(`select np.CodArticolo, np.PrezzoVedi1 from negozio_prezzo np
        join (select CodArticolo, max(l) as l from negozio_prezzo where negozio = ? group by CodArticolo) last on last.l = np.l`, [n]),
      promos: await q(`select pl.CodArticolo, pl.Prezzo_a, pr.Data_a, pr.Data_f, pr.negozio
        from promozioni_list pl join promozioni pr on pr.l = pl.promozioni_l
        where coalesce(pl.invalid, 0) = 0 and (pr.Data_f is null or pr.Data_f >= curdate())`),
      stock: await q(`select CodArticolo, G${n} as q from giacenza`),
    };
  };
}

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (args.has('--full') || s.day !== italyToday()) return { day: italyToday(), products: {}, items: {} };
    return s;
  } catch { return { day: italyToday(), products: {}, items: {} }; }
}

/** Counts per candidate rule, to choose which articles are "on sale" (only counts, no article data). */
async function analyze(db) {
  const n = Number(Object.values(config.stores)[0] ?? 3);
  const one = async (label, sql) => {
    try { const [[row]] = await db.query(sql); log(`${label.padEnd(58)} ${row.c}`); }
    catch (e) { log(`${label.padEnd(58)} error: ${e.message}`); }
  };
  const sold = (days, store) => `(select CodArticolo from vendite_list_2026 where Data >= now() - interval ${days} day${store ? ` and Negozio = ${n}` : ''}
    union select CodArticolo from vendite_list_2025 where Data >= now() - interval ${days} day${store ? ` and Negozio = ${n}` : ''})`;
  log(`Store ${n} (giacenza.G${n}); sales from vendite_list_2025 + vendite_list_2026`);
  await one('articoli in prodotti', 'select count(*) c from prodotti');
  await one(`giacenza G${n} > 0 (store)`, `select count(*) c from giacenza where G${n} > 0`);
  await one('giacenza G0 > 0 (warehouse)', 'select count(*) c from giacenza where G0 > 0');
  await one('giacenza > 0 in any store or warehouse', 'select count(*) c from giacenza where G0 > 0 or G1 > 0 or G2 > 0 or G3 > 0 or G4 > 0 or G5 > 0');
  await one(`sold in store ${n}, last 365 days`, `select count(distinct CodArticolo) c from ${sold(365, true)} s where CodArticolo > 0`);
  await one('sold in any store, last 365 days', `select count(distinct CodArticolo) c from ${sold(365, false)} s where CodArticolo > 0`);
  await one(`sold in any store, last 180 days`, `select count(distinct CodArticolo) c from ${sold(180, false)} s where CodArticolo > 0`);
  await one(`G${n} > 0 or sold in store ${n} in 365 days`, `select count(*) c from prodotti p left join giacenza g on g.CodArticolo = p.CodArticolo
    where g.G${n} > 0 or p.CodArticolo in ${sold(365, true)}`);
  await one('in prodotti_stop', 'select count(distinct CodArticolo) c from prodotti_stop');
  const sel = selectionSql(n).replace(/ and p\.CodArticolo not in \(select CodArticolo from prodotti_stop\)$/, '');
  await one(`selection (config) — articles that would go online`, `select count(*) c from prodotti p where ${sel}`);
  await one(`selection and in prodotti_stop`, `select count(*) c from prodotti p where ${sel} and p.CodArticolo in (select CodArticolo from prodotti_stop)`);
  await one(`selection and Blocco <> 0`, `select count(*) c from prodotti p where ${sel} and coalesce(p.Blocco, 0) <> 0`);
  await one(`selection with PrezzoVedi1 <= 0`, `select count(*) c from prodotti p where ${sel} and coalesce(p.PrezzoVedi1, 0) <= 0`);
}

async function runOnce() {
  const db = await connect();
  try {
    if (args.has('--analyze')) { await analyze(db); return; }
    const readRows = rowReader(db);
    if (args.has('--dry-run')) {
      const out = {};
      for (const [code, n] of Object.entries(config.stores)) {
        const b = buildBatch(await readRows(n), { storeNumber: n, today: italyToday(), imageUrlTemplate: config.imageUrlTemplate });
        out[code] = { products: b.products.length, store_items: b.storeItems.length, problems: b.problems,
          sample: { products: b.products.slice(0, 20), store_items: b.storeItems.slice(0, 20) } };
        log(`${code}: ${b.products.length} articles, ${b.problems.length} problems`);
      }
      fs.writeFileSync(path.join(HERE, 'dry-run.json'), JSON.stringify(out, null, 2));
      log('dry-run.json written, nothing sent');
      return;
    }
    if (!secret) throw new Error('ERP_SYNC_SECRET is not set');
    const state = loadState();
    for (const [code, n] of Object.entries(config.stores)) {
      try {
        const s = await syncStore({ storeCode: code, storeNumber: n, readRows, state, endpoint: config.endpoint, secret,
          imageUrlTemplate: config.imageUrlTemplate, log: (m) => log(code, m) });
        log(`${code}: ${s.read} web articles, sent ${s.products_sent} products and ${s.items_sent} store items, ${s.skipped.length} skipped by the shop, ${s.problems.length} not sent`);
        for (const x of [...s.problems, ...s.skipped].slice(0, 20)) log(`  ${x.erp_code}: ${x.reason}${x.detail ? ` (${x.detail})` : ''}`);
      } finally {
        fs.writeFileSync(statePath, JSON.stringify(state));
      }
    }
  } finally {
    await db.end();
  }
}

if (args.has('--loop')) {
  const minutes = Math.max(1, Number(config.intervalMinutes ?? 5));
  for (;;) {
    try { await runOnce(); } catch (e) { log('sync failed:', e.message); }
    await new Promise((ok) => setTimeout(ok, minutes * 60_000));
  }
} else {
  runOnce().catch((e) => { log('sync failed:', e.message); process.exit(1); });
}
