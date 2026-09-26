import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDelimiter, parseCsv, parseCsvObjects, toCsv } from '../src/lib/csv';
import { chunk, parseImportFile } from '../src/lib/importer';

test('csv: quotes, escaped quotes, CRLF, BOM, semicolons', () => {
  const text = '﻿sku;nome;descrizione\r\nA1;"Tovaglia ""Elegante""";"riga 1\nriga 2"\r\nA2;Piatto;\r\n\r\n';
  assert.equal(detectDelimiter(text), ';');
  assert.deepEqual(parseCsv(text), [['sku', 'nome', 'descrizione'], ['A1', 'Tovaglia "Elegante"', 'riga 1\nriga 2'], ['A2', 'Piatto', '']]);
  assert.deepEqual(parseCsvObjects('SKU,Nome\nx,y\n'), [{ sku: 'x', nome: 'y' }]);
});

test('csv export escapes separators and neutralises formulas', () => {
  const out = toCsv([{ a: 'x;y', b: '=HYPERLINK("x")', c: -5, d: null }], ['a', 'b', 'c', 'd']);
  assert.equal(out, '﻿a;b;c;d\r\n"x;y";"\'=HYPERLINK(""x"")";-5;');
});

test('import: Italian headers, decimal commas, kg weights, stock columns', () => {
  const csv = [
    'SKU;Nome;Categoria;Prezzo;Prezzo barrato;IVA;Peso kg;EAN;Attivo;In evidenza;stock:AR1;stock:LU1',
    'TOV-01;Tovaglia 140x180;Tessile;14,90;19,90;22%;0,45;8001234567890;sì;no;10;',
    'PIA-01;Piatto piano;Cucina;1.234,50;;22;1,2;;;;3;4',
  ].join('\n');
  const { rows, errors } = parseImportFile(csv);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    sku: 'TOV-01', name: 'Tovaglia 140x180', category: 'Tessile', price_cents: 1490, compare_at_price_cents: 1990, vat_rate: 22,
    weight_g: 450, barcode: '8001234567890', brand: undefined, description: undefined, active: true, featured: false,
    max_per_order: undefined, image_url: undefined, stock: { AR1: 10 },
  });
  assert.equal(rows[1].price_cents, 123450);
  assert.deepEqual(rows[1].stock, { AR1: 3, LU1: 4 });
});

test('import: reports problems per line and skips invalid rows', () => {
  const csv = 'sku,name,price,weight_g,vat_rate,barcode\n,No sku,1,10,22,\nA,Ok,2.5,100,22,\nA,Dup,2,100,22,\nB,Bad,0,0,7,123\n';
  const { rows, errors } = parseImportFile(csv);
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 3);
  assert.match(errors[0].message, /SKU/);
  assert.equal(errors[0].line, 2);
  assert.match(errors[1].message, /duplicato/);
  assert.match(errors[2].message, /prezzo non valido.*peso mancante.*IVA.*EAN/);
});

test('chunk', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
