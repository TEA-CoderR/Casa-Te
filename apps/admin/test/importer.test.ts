import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDelimiter, parseCsv, parseCsvObjects, toCsv } from '../src/lib/csv';
import { chunk, parseHighlight, parseImportFile, parsePack, parseSheetRows } from '../src/lib/importer';

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
    max_per_order: undefined, stock: { AR1: 10 }, subcategory: undefined, color: undefined, highlights: undefined,
    variant_group: undefined, variant_title: undefined, variant_label: undefined, image_urls: undefined,
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

test('import v2: pack size, highlights with Italian icon names', () => {
  assert.deepEqual(parsePack('500 ml'), { unit: 'ml', quantity: 500 });
  assert.deepEqual(parsePack('1,5 L'), { unit: 'l', quantity: 1.5 });
  assert.deepEqual(parsePack('6 pezzi'), { unit: 'pz', quantity: 6 });
  assert.equal(parsePack(''), null);
  assert.equal(parsePack('una scatola'), 'invalid');
  assert.deepEqual(parseHighlight('goccia: Fragranza italiana'), { icon: 'drop', label: 'Fragranza italiana' });
  assert.deepEqual(parseHighlight('Per ogni ambiente'), { icon: 'star', label: 'Per ogni ambiente' });
  assert.equal(parseHighlight('razzo: Velocissimo'), 'invalid');
  assert.equal(parseHighlight('x'.repeat(41)), 'invalid');
});

test('import v2: Excel rows with every storefront field', () => {
  const { rows, errors } = parseSheetRows([
    ['SKU', 'Nome', 'Categoria', 'Sottocategoria', 'Prezzo', 'Peso kg', 'Colore', 'Confezione', 'Punto di forza 1', 'Punto di forza 2',
      'Gruppo varianti', 'Titolo varianti', 'Nome variante', 'EAN', 'Immagine 1', 'Immagine 2', 'Giacenza AR1', 'Giacenza LU1'],
    ['DIF-TES', 'Diffusore Tessuto', 'Casa', 'Profumatori', 79, 0.9, 'Ambra', '500 ml', 'goccia: Fragranza italiana', 'Per ogni ambiente',
      'diffusore-500', 'fragranza', 'Tessuto', 8001234567890, 'https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg', 5, null],
    [null, null, null],
    ['BAD', 'Senza variante', null, 'Orfana', 10, 1, null, '3 scatole', 'razzo: x', null, 'gruppo', null, null, null, 'http://x', null, null, null],
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0] }, {
    sku: 'DIF-TES', name: 'Diffusore Tessuto', category: 'Casa', subcategory: 'Profumatori', price_cents: 7900, compare_at_price_cents: null,
    vat_rate: 22, weight_g: 900, barcode: '8001234567890', brand: undefined, description: undefined, active: undefined, featured: undefined,
    max_per_order: undefined, stock: { AR1: 5 }, color: 'Ambra', unit: 'ml', unit_quantity: 500,
    highlights: [{ icon: 'drop', label: 'Fragranza italiana' }, { icon: 'star', label: 'Per ogni ambiente' }],
    variant_group: 'diffusore-500', variant_title: 'fragranza', variant_label: 'Tessuto',
    image_urls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 4, 'blank rows keep the spreadsheet line numbers');
  assert.match(errors[0].message, /punto di forza 1.*https.*confezione.*categoria.*nome della variante/);
});
