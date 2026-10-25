import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SELECTION, normalizeSelection, selectionFunnel, selectionSql } from '../selection.mjs';

test('defaults: last-year sales in vendite_list_0..4 or on the shelf of store n, minus stopped', () => {
  const sql = selectionSql(normalizeSelection(), 3);
  for (const t of DEFAULT_SELECTION.salesTables) assert.match(sql, new RegExp(`from ${t} where Data >= curdate\\(\\) - interval 365 day and Qta > 0`));
  assert.match(sql, /select CodArticolo from giacenza where G3 > 0/);
  assert.match(sql, /not in \(select CodArticolo from prodotti_stop\)/);
  assert.doesNotMatch(sql, /IDFornitore/);
});

test('supplier include / exclude and stock requirements', () => {
  assert.match(selectionSql(normalizeSelection({ supplierInclude: [101, 102] }), 3), /p\.IDFornitore in \(101, 102\)/);
  assert.match(selectionSql(normalizeSelection({ supplierExclude: [111] }), 3), /coalesce\(p\.IDFornitore, 0\) not in \(111\)/);
  assert.match(selectionSql(normalizeSelection({ requireStock: 'any' }), 3), /G0 > 0 or G1 > 0 or G2 > 0 or G3 > 0 or G4 > 0 or G5 > 0/);
  const noShelf = selectionSql(normalizeSelection({ alsoInStockAtStore: false, excludeStopped: false }), 2);
  assert.doesNotMatch(noShelf, /G2 > 0|prodotti_stop/);
});

test('config is validated (no SQL injection through names or ids)', () => {
  assert.throws(() => normalizeSelection({ salesTables: ['vendite_list_1; drop table x'] }), /salesTables/);
  assert.throws(() => normalizeSelection({ supplierInclude: ['101) or (1=1'] }), /supplierInclude/);
  assert.throws(() => normalizeSelection({ supplierInclude: [1], supplierExclude: [2] }), /not both/);
  assert.throws(() => normalizeSelection({ soldDays: 0, alsoInStockAtStore: false }), /enable sales/);
  assert.throws(() => selectionSql(normalizeSelection(), 12), /store number/);
});

test('funnel steps end with the selected condition', () => {
  const sel = normalizeSelection({ supplierInclude: [101] });
  const steps = selectionFunnel(sel, 3);
  assert.equal(steps.at(-1)[1], selectionSql(sel, 3));
  assert.ok(steps.length >= 6);
});

test('a code list replaces the sales / shelf rule but keeps the other filters', () => {
  const sql = selectionSql(normalizeSelection({ codes: [12, 7, 12] }), 3);
  assert.match(sql, /p\.CodArticolo in \(12, 7\)/);
  assert.match(sql, /prodotti_stop/);
  assert.doesNotMatch(sql, /vendite_list_|G3 > 0/);
  const sel = normalizeSelection({ codes: [5], soldDays: 0, alsoInStockAtStore: false, requireStock: 'store' });
  assert.match(selectionSql(sel, 3), /G3 > 0/);
  assert.equal(selectionFunnel(sel, 3).at(-1)[1], selectionSql(sel, 3));
  assert.throws(() => normalizeSelection({ codes: ['1) or (1=1'] }), /codes/);
  assert.throws(() => normalizeSelection({ codes: [0] }), /codes/);
});
