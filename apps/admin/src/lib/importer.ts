// Converts spreadsheet rows (Italian or English headers) into normalised ImportRow payloads for
// public.admin_import_products. Client-side validation gives immediate feedback; the database
// validates again.
import type { ImportRow } from '@casa-te/shared';
import { parseCsvObjects } from './csv';

/** Accepted header aliases → canonical field. */
const ALIASES: Record<string, keyof ImportRow | 'price' | 'compare_at_price' | 'weight_kg'> = {
  sku: 'sku', codice: 'sku', 'codice articolo': 'sku', articolo: 'sku',
  name: 'name', nome: 'name', descrizione_breve: 'name', prodotto: 'name',
  category: 'category', categoria: 'category', reparto: 'category',
  price: 'price', prezzo: 'price', 'prezzo vendita': 'price', 'prezzo (€)': 'price',
  compare_at_price: 'compare_at_price', 'prezzo barrato': 'compare_at_price', 'prezzo pieno': 'compare_at_price',
  vat_rate: 'vat_rate', iva: 'vat_rate', 'aliquota iva': 'vat_rate',
  weight_g: 'weight_g', 'peso g': 'weight_g', 'peso (g)': 'weight_g', grammi: 'weight_g',
  weight_kg: 'weight_kg', peso: 'weight_kg', 'peso kg': 'weight_kg', 'peso (kg)': 'weight_kg',
  barcode: 'barcode', ean: 'barcode', 'codice a barre': 'barcode',
  brand: 'brand', marca: 'brand',
  description: 'description', descrizione: 'description',
  active: 'active', attivo: 'active', pubblicato: 'active',
  featured: 'featured', evidenza: 'featured', 'in evidenza': 'featured',
  max_per_order: 'max_per_order', 'max per ordine': 'max_per_order',
  image_url: 'image_url', immagine: 'image_url', foto: 'image_url', 'url immagine': 'image_url',
};

export const TEMPLATE_HEADERS = [
  'sku', 'nome', 'categoria', 'prezzo', 'prezzo barrato', 'iva', 'peso kg', 'ean', 'marca', 'descrizione',
  'attivo', 'in evidenza', 'immagine', 'stock:AR1', 'stock:LU1', 'stock:LU2', 'stock:LU3', 'stock:LU4',
];

export type ParsedImport = { rows: ImportRow[]; errors: Array<{ line: number; sku: string; message: string }> };

function parseNumber(v: string): number | null {
  const s = v.replace(/\s|€/g, '');
  if (!s) return null;
  // "1.234,56" (it) or "1,234.56" (en) or "12,5" or "12.5"
  const normalized = /,\d{1,3}$/.test(s) && !/\.\d{1,3}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseBool(v: string): boolean | undefined {
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  if (['1', 'si', 'sì', 'yes', 'true', 'x', 'y'].includes(s)) return true;
  if (['0', 'no', 'false', 'n'].includes(s)) return false;
  return undefined;
}

export function normaliseRows(records: Array<Record<string, string>>): ParsedImport {
  const rows: ImportRow[] = [];
  const errors: ParsedImport['errors'] = [];
  const seen = new Set<string>();
  records.forEach((rec, i) => {
    const line = i + 2; // header is line 1
    const fields: Record<string, string> = {};
    const stock: Record<string, number> = {};
    const problems: string[] = [];
    for (const [rawKey, value] of Object.entries(rec)) {
      const key = rawKey.trim().toLowerCase();
      const stockMatch = key.match(/^(?:stock|giacenza|scorta)[:\s_-]+([a-z0-9_-]+)$/i);
      if (stockMatch) {
        if (value.trim() === '') continue;
        const q = Number(value.trim());
        if (!Number.isInteger(q) || q < 0) problems.push(`giacenza ${stockMatch[1].toUpperCase()} non valida`);
        else stock[stockMatch[1].toUpperCase()] = q;
        continue;
      }
      const canonical = ALIASES[key];
      if (canonical) fields[canonical] = value.trim();
    }
    const sku = fields.sku ?? '';
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(sku)) problems.push('SKU mancante o non valido (lettere, numeri, . _ -)');
    if (sku && seen.has(sku)) problems.push('SKU duplicato nel file');
    if (!fields.name) problems.push('nome mancante');
    const price = parseNumber(fields.price ?? '');
    if (price === null || price <= 0) problems.push('prezzo non valido');
    const compare = parseNumber(fields.compare_at_price ?? '');
    if (compare !== null && price !== null && compare <= price) problems.push('prezzo barrato deve essere maggiore del prezzo');
    let weightG: number | null = null;
    if (fields.weight_g) weightG = parseNumber(fields.weight_g);
    else if (fields.weight_kg) { const kg = parseNumber(fields.weight_kg); weightG = kg === null ? null : Math.round(kg * 1000); }
    if (weightG === null || weightG <= 0) problems.push('peso mancante (necessario per il calcolo della spedizione)');
    const vat = fields.vat_rate ? parseNumber(fields.vat_rate.replace('%', '')) : 22;
    if (vat === null || ![0, 4, 5, 10, 22].includes(vat)) problems.push('aliquota IVA non valida (0, 4, 5, 10, 22)');
    if (fields.barcode && !/^\d{8,14}$/.test(fields.barcode)) problems.push('EAN non valido');
    if (fields.image_url && !/^https:\/\//.test(fields.image_url)) problems.push("l'URL immagine deve iniziare con https://");

    if (problems.length) { errors.push({ line, sku, message: problems.join('; ') }); return; }
    seen.add(sku);
    rows.push({
      sku, name: fields.name, category: fields.category || undefined,
      price_cents: Math.round(price! * 100),
      compare_at_price_cents: compare === null ? null : Math.round(compare * 100),
      vat_rate: vat!, weight_g: Math.round(weightG!),
      barcode: fields.barcode || undefined, brand: fields.brand || undefined, description: fields.description || undefined,
      active: parseBool(fields.active ?? ''), featured: parseBool(fields.featured ?? ''),
      max_per_order: fields.max_per_order ? Number(fields.max_per_order) : undefined,
      image_url: fields.image_url || undefined,
      stock: Object.keys(stock).length ? stock : undefined,
    });
  });
  return { rows, errors };
}

export function parseImportFile(text: string): ParsedImport {
  return normaliseRows(parseCsvObjects(text));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
