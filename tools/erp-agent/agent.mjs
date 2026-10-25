#!/usr/bin/env node
// CASA & TE ERP sync agent. Runs on the CASA & TE server next to the ysoft MySQL copy of ITO and pushes web
// articles, store prices, promotions and stock to the shop (Supabase Edge Function erp-sync).
//
//   node agent.mjs --analyze   count articles step by step for the configured selection, send nothing
//   node agent.mjs --convert-suppliers   turn selection.json supplierInclude into supplierExclude (all other suppliers
//                                        of the fornitore table, plus 0), so new suppliers are included automatically
//   node agent.mjs --export-catalog   for the article codes in catalogo-codici.json, write catalogo-export.json with
//                                     ITO name, VAT, brand, category codes, store price, promotions, stock, barcodes
//                                     (input for a one-off admin import; no purchase prices)
//   node agent.mjs --dry-run   read MySQL, write dry-run.json (what would be sent), send nothing
//   node agent.mjs --once      one sync (run by hand, or by Windows Task Scheduler / cron, e.g. every 5 minutes)
//   node agent.mjs --loop      sync every `intervalMinutes`
//   add --full                 resend everything (also done automatically once a day)
//
// Configuration: config.json next to this file (see config.example.json). Secrets come from environment
// variables ERP_MYSQL_PASSWORD and ERP_SYNC_SECRET; they are never written to config.json or the logs.
// The MySQL user only needs SELECT on ysoft.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncStore, buildBatch, italyToday, fingerprint } from './lib.mjs';
import { normalizeSelection, selectionFunnel, selectionSql } from './selection.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
const secret = process.env.ERP_SYNC_SECRET ?? '';
const statePath = path.join(HERE, config.stateFile ?? 'state.json');
const log = (...m) => console.log(new Date().toISOString(), ...m);

// Which articles go online: selection.mjs (defaults) < config.json "selection" < selection.json (optional file,
// e.g. the supplier list).
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(path.join(HERE, file), 'utf8')); } catch { return null; } };
// `codesFile` (in config.json or selection.json): JSON list of article codes, plain numbers or { code } objects
// (catalogo-codici.json has that shape); only those articles go online.
const selectionParts = [config.selection, readJson('selection.json')];
const codesFile = selectionParts.reduce((f, part) => part?.codesFile ?? f, null);
if (codesFile) {
  const list = readJson(codesFile);
  if (!Array.isArray(list) || !list.length) throw new Error(`selection.codesFile: ${codesFile} missing or empty`);
  selectionParts.push({ codes: [...new Set(list.map((x) => Number(typeof x === 'object' && x ? x.code : x)))] });
}
const selection = normalizeSelection(...selectionParts.map((part) => { if (!part) return part; const { codesFile: _, ...rest } = part; return rest; }));

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
function rowReader(db, cache = {}) {
  return async (n) => {
    const q = async (sql, params = []) => (await db.query(sql, params))[0];
    // The selection scans the sales tables (MyISAM: reads lock them against the tills), so it runs once a day.
    const key = `${italyToday()}:${n}:${fingerprint(selection)}`;
    cache.selections ??= {};
    if (cache.selections[n]?.key !== key) {
      const t0 = Date.now();
      const codes = (await q(`select p.CodArticolo from prodotti p where ${selectionSql(selection, n)}`)).map((r) => r.CodArticolo);
      cache.selections[n] = { key, codes };
      log(`selection for store ${n}: ${codes.length} articles (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
    const { codes } = cache.selections[n];
    const products = [];
    for (let i = 0; i < codes.length; i += 5000) {
      products.push(...await q(`select p.CodArticolo, p.CodBarre, p.Descrizione, p.PrezzoVedi1, p.CodIva, m.Descrizione as marca,
          p.PrezzoVediOfferta, p.PrezzoVediOfferta_inizio, p.PrezzoVediOfferta_fine
        from prodotti p left join prodotti_marca m on m.uid = p.marca where p.CodArticolo in (?)`, [codes.slice(i, i + 5000)]));
    }
    return {
      products,
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
    // Once a day (or with --full) everything is resent; `known` (articles online) is kept so removals still apply.
    if (args.has('--full') || s.day !== italyToday()) return { day: italyToday(), products: {}, items: {}, known: s.known ?? {} };
    return s;
  } catch { return { day: italyToday(), products: {}, items: {}, known: {} }; }
}

/** Step-by-step counts for the configured selection (counts only, no article data). */
async function analyze(db) {
  for (const [code, n] of Object.entries(config.stores)) {
    log(`${code} = ITO store ${n}; selection: ${JSON.stringify({ ...selection, codes: `${selection.codes.length} codes`, supplierInclude: `${selection.supplierInclude.length} suppliers`, supplierExclude: `${selection.supplierExclude.length} suppliers` })}`);
    for (const [label, where] of selectionFunnel(selection, n)) {
      try { const [[row]] = await db.query(`select count(*) c from prodotti p where ${where}`); log(`  ${label.padEnd(64)} ${row.c}`); }
      catch (e) { log(`  ${label.padEnd(64)} error: ${e.message}`); }
    }
  }
}

/** Rewrites selection.json from an include list to the equivalent exclude list (keeps a backup and a CSV to review). */
async function convertSuppliers(db) {
  const file = path.join(HERE, 'selection.json');
  const current = readJson('selection.json') ?? {};
  const include = new Set(current.supplierInclude ?? []);
  if (!include.size) throw new Error('selection.json has no supplierInclude to convert');
  const [rows] = await db.query('select IDFornitore, Nome from fornitore order by IDFornitore');
  const excluded = rows.filter((r) => !include.has(Number(r.IDFornitore)));
  const missing = [...include].filter((id) => !rows.some((r) => Number(r.IDFornitore) === id));
  fs.writeFileSync(path.join(HERE, 'selection.include-backup.json'), JSON.stringify(current, null, 2));
  const { supplierInclude, ...rest } = current;
  const supplierExclude = [0, ...excluded.map((r) => Number(r.IDFornitore)).filter((id) => id !== 0)];
  fs.writeFileSync(file, JSON.stringify({ ...rest, supplierExclude }, null, 2));
  const csv = ['IDFornitore;Nome', ...excluded.map((r) => `${r.IDFornitore};${String(r.Nome ?? '').replace(/[\r\n;]+/g, ' ').trim()}`)].join('\r\n');
  fs.writeFileSync(path.join(HERE, 'fornitori-esclusi.csv'), '\ufeff' + csv);
  log(`${rows.length} suppliers in fornitore; kept ${include.size - missing.length}, excluded ${excluded.length} (+ articles without supplier)`);
  if (missing.length) log(`not in fornitore (ignored): ${missing.join(', ')}`);
  log('selection.json now uses supplierExclude; review fornitori-esclusi.csv; backup in selection.include-backup.json');
}

/** One-off export for an admin import of a given list of articles (catalogo-codici.json: [{ code, barcodes }]). */
async function exportCatalog(db) {
  const input = readJson('catalogo-codici.json');
  if (!Array.isArray(input) || !input.length) throw new Error('catalogo-codici.json missing or empty');
  const codes = input.map((x) => Number(x.code)).filter((c) => Number.isInteger(c) && c > 0);
  const [code, n] = Object.entries(config.stores)[0];
  const q = async (sql, params = []) => (await db.query(sql, params))[0];
  const byChunks = async (sql) => { const out = []; for (let i = 0; i < codes.length; i += 2000) out.push(...await q(sql, [codes.slice(i, i + 2000)])); return out; };
  const products = await byChunks(`select p.CodArticolo, p.CodBarre, p.Descrizione, p.Descrizione2, p.PrezzoVedi1, p.CodIva, p.Categoria, p.Sottocategoria,
      m.Descrizione as marca, p.UdmDim, p.UdmDimV, p.Blocco, p.PrezzoVediOfferta, p.PrezzoVediOfferta_inizio, p.PrezzoVediOfferta_fine
    from prodotti p left join prodotti_marca m on m.uid = p.marca where p.CodArticolo in (?)`);
  const barcodes = await byChunks('select CodArticolo, CodBarre from codbarre where CodArticolo in (?)');
  const stock = await byChunks(`select CodArticolo, G${n} as q from giacenza where CodArticolo in (?)`);
  const storePrices = await byChunks(`select np.CodArticolo, np.PrezzoVedi1 from negozio_prezzo np
    join (select CodArticolo, max(l) as l from negozio_prezzo where negozio = ${n} and CodArticolo in (?) group by CodArticolo) last on last.l = np.l`);
  const promos = await byChunks(`select pl.CodArticolo, pl.Prezzo_a, pr.Data_a, pr.Data_f, pr.negozio
    from promozioni_list pl join promozioni pr on pr.l = pl.promozioni_l
    where coalesce(pl.invalid, 0) = 0 and (pr.Data_f is null or pr.Data_f >= curdate()) and pl.CodArticolo in (?)`);
  const stopped = (await byChunks('select distinct CodArticolo from prodotti_stop where CodArticolo in (?)')).map((r) => r.CodArticolo);
  const categories = await q('select l, Descrizione, Categorie, SottoCategorie, Distinzione from categorie');
  const out = { exported_at: new Date().toISOString(), store_code: code, store_number: n, requested: codes.length,
    products, barcodes, stock, storePrices, promos, stopped, categories };
  fs.writeFileSync(path.join(HERE, 'catalogo-export.json'), JSON.stringify(out));
  log(`catalogo-export.json: ${products.length}/${codes.length} articles found, ${stock.filter((s) => s.q > 0).length} in stock in store ${n}, ${stopped.length} stopped, ${promos.length} promotion rows`);
}

async function runOnce() {
  const db = await connect();
  try {
    if (args.has('--analyze')) { await analyze(db); return; }
    if (args.has('--export-catalog')) { await exportCatalog(db); return; }
    if (args.has('--convert-suppliers')) { await convertSuppliers(db); return; }
    if (args.has('--dry-run')) {
      const readRows = rowReader(db, {});
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
    const readRows = rowReader(db, state); // the daily selection is kept in state.json between runs
    for (const [code, n] of Object.entries(config.stores)) {
      try {
        const s = await syncStore({ storeCode: code, storeNumber: n, readRows, state, endpoint: config.endpoint, secret,
          imageUrlTemplate: config.imageUrlTemplate, log: (m) => log(code, m) });
        log(`${code}: ${s.read} articles, sent ${s.products_sent} products and ${s.items_sent} store items, ${s.skipped.length} skipped by the shop, ${s.problems.length} not sent`);
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
