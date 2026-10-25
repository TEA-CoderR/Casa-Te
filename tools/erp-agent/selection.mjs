// Which ITO articles go online for a store. Pure (no I/O) so the SQL is unit-tested.
//
// An article is selected for store n when
//   (it was sold (Qta > 0) in the last `soldDays` days in any of `salesTables`
//    or, if `alsoInStockAtStore`, it is in stock in store n)
//   and its supplier passes `supplierInclude` / `supplierExclude`
//   and, if `excludeStopped`, it is not in prodotti_stop (stopped articles)
//   and the `requireStock` condition holds: "none", "any" (stock in a store or the warehouse) or "store" (store n).
// Defaults reproduce CASA & TE's own export query (sales of the last year in vendite_list_0..4), minus stopped
// articles, plus what store n has on the shelf.
// `codes` (a list of article codes, e.g. loaded from `codesFile` by agent.mjs) replaces the sales / shelf rule: only
// those articles are selected (the supplier, stopped and stock rules still apply). Used to put online only the
// articles that have photos.

export const DEFAULT_SELECTION = {
  soldDays: 365,
  salesTables: ['vendite_list_0', 'vendite_list_1', 'vendite_list_2', 'vendite_list_3', 'vendite_list_4'],
  supplierInclude: [],
  supplierExclude: [],
  excludeStopped: true,
  alsoInStockAtStore: true,
  requireStock: 'none',
  codes: [],
};

const STOCK_COLUMNS = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'];

/** Merges and validates a selection (throws with a readable message on bad config). */
export function normalizeSelection(...parts) {
  const s = Object.assign({}, DEFAULT_SELECTION, ...parts.filter(Boolean));
  if (!Number.isInteger(s.soldDays) || s.soldDays < 0 || s.soldDays > 3650) throw new Error('selection.soldDays: integer 0–3650 (0 = ignore sales)');
  if (!Array.isArray(s.salesTables) || s.salesTables.some((t) => !/^vendite_list_[A-Za-z0-9_]{1,20}$/.test(t))) {
    throw new Error('selection.salesTables: names like "vendite_list_3"');
  }
  for (const key of ['supplierInclude', 'supplierExclude']) {
    if (!Array.isArray(s[key]) || s[key].some((id) => !Number.isInteger(id) || id < 0)) throw new Error(`selection.${key}: list of supplier numbers`);
  }
  if (!Array.isArray(s.codes) || s.codes.some((c) => !Number.isSafeInteger(c) || c <= 0)) throw new Error('selection.codes: list of article codes (positive integers)');
  if (s.supplierInclude.length && s.supplierExclude.length) throw new Error('selection: use supplierInclude or supplierExclude, not both');
  if (!['none', 'any', 'store'].includes(s.requireStock)) throw new Error('selection.requireStock: "none", "any" or "store"');
  if (!s.codes.length && !(s.soldDays > 0 && s.salesTables.length) && !s.alsoInStockAtStore) throw new Error('selection: enable sales (soldDays + salesTables) and/or alsoInStockAtStore');
  return s;
}

/** SQL fragments on alias p for store n (0–9). Every value is validated, so plain interpolation is safe. */
export function selectionParts(sel, n) {
  if (!Number.isInteger(n) || n < 0 || n > 9) throw new Error(`invalid store number ${n}`);
  const sold = sel.soldDays > 0 && sel.salesTables.length
    ? `p.CodArticolo in (${sel.salesTables.map((t) => `select CodArticolo from ${t} where Data >= curdate() - interval ${sel.soldDays} day and Qta > 0 and CodArticolo > 0`).join(' union ')})`
    : null;
  const shelf = sel.alsoInStockAtStore ? `p.CodArticolo in (select CodArticolo from giacenza where G${n} > 0)` : null;
  const suppliers = sel.supplierInclude.length ? `p.IDFornitore in (${sel.supplierInclude.join(', ')})`
    : sel.supplierExclude.length ? `coalesce(p.IDFornitore, 0) not in (${sel.supplierExclude.join(', ')})` : null;
  const stopped = sel.excludeStopped ? 'p.CodArticolo not in (select CodArticolo from prodotti_stop)' : null;
  const stock = sel.requireStock === 'any'
    ? `p.CodArticolo in (select CodArticolo from giacenza where ${STOCK_COLUMNS.map((c) => `${c} > 0`).join(' or ')})`
    : sel.requireStock === 'store' ? `p.CodArticolo in (select CodArticolo from giacenza where G${n} > 0)` : null;
  const listed = sel.codes?.length ? `p.CodArticolo in (${[...new Set(sel.codes)].join(', ')})` : null;
  return { sold, shelf, suppliers, stopped, stock, listed };
}

const and = (...c) => c.filter(Boolean).map((x) => `(${x})`).join(' and ') || 'true';
const or = (...c) => { const l = c.filter(Boolean); return l.length ? `(${l.join(' or ')})` : null; };

/** Full condition for store n. */
export function selectionSql(sel, n) {
  const p = selectionParts(sel, n);
  return and(p.listed ?? or(p.sold, p.shelf), p.suppliers, p.stopped, p.stock);
}

/** Step-by-step conditions for --analyze: how each rule changes the count. */
export function selectionFunnel(sel, n) {
  const p = selectionParts(sel, n);
  const anyStock = selectionParts({ ...sel, requireStock: 'any' }, n).stock;
  const storeStock = selectionParts({ ...sel, requireStock: 'store' }, n).stock;
  const steps = [];
  if (p.listed) {
    steps.push([`in the code list (${new Set(sel.codes).size} codes)`, and(p.listed)]);
    if (p.suppliers) steps.push(['… and supplier filter', and(p.listed, p.suppliers)]);
    if (p.stopped) steps.push(['… and not stopped (prodotti_stop)', and(p.listed, p.suppliers, p.stopped)]);
    const base = and(p.listed, p.suppliers, p.stopped);
    steps.push(['   of which in stock in any store or warehouse', and(base, anyStock)]);
    steps.push([`   of which in stock in store ${n}`, and(base, storeStock)]);
    steps.push([`SELECTED (requireStock = ${sel.requireStock})`, selectionSql(sel, n)]);
    return steps;
  }
  if (p.sold) steps.push([`sold in ${sel.salesTables.join('+')} in the last ${sel.soldDays} days`, and(p.sold)]);
  if (p.suppliers) steps.push(['… and supplier filter', and(p.sold, p.suppliers)]);
  if (p.stopped) steps.push(['… and not stopped (prodotti_stop)', and(p.sold, p.suppliers, p.stopped)]);
  if (p.shelf) steps.push([`… or in stock in store ${n} (same filters)`, and(or(p.sold, p.shelf), p.suppliers, p.stopped)]);
  const base = and(or(p.sold, p.shelf), p.suppliers, p.stopped);
  steps.push(['   of which in stock in any store or warehouse', and(base, anyStock)]);
  steps.push([`   of which in stock in store ${n}`, and(base, storeStock)]);
  steps.push([`SELECTED (requireStock = ${sel.requireStock})`, selectionSql(sel, n)]);
  return steps;
}
