// Converts spreadsheet rows (Italian or English headers) into normalised ImportRow payloads for
// public.admin_import_products. Client-side validation gives immediate feedback; the database
// validates again.
import { HIGHLIGHT_ICONS, type HighlightIcon, type ImportRow, type ProductHighlight, type ProductUnit } from '@casa-te/shared';
import { parseCsvObjects } from './csv';

/** Accepted header aliases → canonical field. */
type Field = keyof ImportRow | 'price' | 'compare_at_price' | 'weight_kg' | 'pack';
const ALIASES: Record<string, Field> = {
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
  subcategory: 'subcategory', sottocategoria: 'subcategory', 'sotto categoria': 'subcategory',
  color: 'color', colore: 'color', 'colore / materiale': 'color', materiale: 'color',
  pack: 'pack', confezione: 'pack', formato: 'pack', contenuto: 'pack',
  variant_group: 'variant_group', 'gruppo varianti': 'variant_group', 'gruppo variante': 'variant_group',
  variant_title: 'variant_title', 'titolo varianti': 'variant_title', 'tipo variante': 'variant_title',
  variant_label: 'variant_label', 'nome variante': 'variant_label', variante: 'variant_label',
};

/** Icon names accepted in "punto di forza" cells, Italian first ("goccia: Fragranza italiana"). */
export const ICON_WORDS: Record<string, HighlightIcon> = {
  foglia: 'leaf', casa: 'home', diamante: 'diamond', goccia: 'drop', sole: 'sun', scudo: 'shield', stella: 'star',
  riciclo: 'recycle', mano: 'hand', scatola: 'box', cuore: 'heart', scintilla: 'sparkle',
  ...Object.fromEntries(HIGHLIGHT_ICONS.map((i) => [i, i])),
};

const UNITS: Record<string, ProductUnit> = {
  ml: 'ml', l: 'l', lt: 'l', litro: 'l', litri: 'l', g: 'g', gr: 'g', grammi: 'g', kg: 'kg',
  pz: 'pz', pezzi: 'pz', pezzo: 'pz', m: 'm', metri: 'm', metro: 'm',
};

/** "500 ml", "1,5 l", "6 pz" → { unit, quantity }; null when the cell is empty; 'invalid' otherwise. */
export function parsePack(v: string): { unit: ProductUnit; quantity: number } | null | 'invalid' {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*([a-z]+)\.?$/);
  const unit = m ? UNITS[m[2]] : undefined;
  const quantity = m ? Number(m[1].replace(',', '.')) : NaN;
  return unit && quantity > 0 ? { unit, quantity } : 'invalid';
}

/** "goccia: Fragranza italiana" or just "Fragranza italiana" (star icon). */
export function parseHighlight(v: string): ProductHighlight | 'invalid' | null {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/^([a-zà-ù]+)\s*:\s*(.+)$/i);
  const icon = m ? ICON_WORDS[m[1].toLowerCase()] : undefined;
  const label = (icon ? m![2] : s).trim();
  if (m && !icon) return 'invalid';
  return label.length >= 1 && label.length <= 40 ? { icon: icon ?? 'star', label } : 'invalid';
}

export const TEMPLATE_HEADERS = [
  'sku', 'nome', 'categoria', 'sottocategoria', 'prezzo', 'prezzo barrato', 'iva', 'peso kg', 'marca', 'colore', 'confezione',
  'descrizione', 'punto di forza 1', 'punto di forza 2', 'punto di forza 3', 'punto di forza 4',
  'gruppo varianti', 'titolo varianti', 'nome variante', 'ean', 'attivo', 'in evidenza', 'max per ordine',
  'immagine 1', 'immagine 2', 'immagine 3', 'immagine 4', 'immagine 5',
  'giacenza AR1', 'giacenza LU1', 'giacenza LU2', 'giacenza LU3', 'giacenza LU4',
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
    if (Object.values(rec).every((v) => String(v ?? '').trim() === '')) return; // blank row in the middle of a sheet
    const fields: Record<string, string> = {};
    const stock: Record<string, number> = {};
    const highlights: ProductHighlight[] = [];
    const images: string[] = [];
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
      const highlight = key.match(/^(?:punto di forza|punti di forza|highlight|caratteristica)\s*(\d)$/);
      if (highlight) {
        const h = parseHighlight(value);
        if (h === 'invalid') problems.push(`punto di forza ${highlight[1]} non valido (max 40 caratteri; icona tra: ${Object.keys(ICON_WORDS).slice(0, 12).join(', ')})`);
        else if (h) highlights.push(h);
        continue;
      }
      const image = key.match(/^(?:immagine|foto|image)\s*(\d+)$/);
      if (image) { if (value.trim()) images.push(value.trim()); continue; }
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
    if (fields.image_url) images.unshift(fields.image_url);
    if (images.some((u) => !/^https:\/\/\S+$/.test(u))) problems.push("ogni immagine deve essere un link che inizia con https://");
    if (images.length > 10) problems.push('massimo 10 immagini');
    if (highlights.length > 4) problems.push('massimo 4 punti di forza');
    const pack = parsePack(fields.pack ?? '');
    if (pack === 'invalid') problems.push('confezione non valida (es. 500 ml, 1,5 l, 250 g, 6 pz)');
    if (fields.subcategory && !fields.category) problems.push('indica anche la categoria della sottocategoria');
    if (fields.variant_group && !fields.variant_label) problems.push('indica il nome della variante (es. Tessuto)');
    if ((fields.color ?? '').length > 40 || (fields.variant_title ?? '').length > 40 || (fields.variant_label ?? '').length > 40) problems.push('colore e varianti: massimo 40 caratteri');

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
      stock: Object.keys(stock).length ? stock : undefined,
      subcategory: fields.subcategory || undefined, color: fields.color || undefined,
      ...(pack && pack !== 'invalid' ? { unit: pack.unit, unit_quantity: pack.quantity } : {}),
      highlights: highlights.length ? highlights : undefined,
      variant_group: fields.variant_group || undefined, variant_title: fields.variant_title || undefined, variant_label: fields.variant_label || undefined,
      image_urls: images.length ? images : undefined,
    });
  });
  return { rows, errors };
}

export function parseImportFile(text: string): ParsedImport {
  return normaliseRows(parseCsvObjects(text));
}

type Cell = string | number | boolean | Date | null | undefined;
const cellText = (c: Cell): string => c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10)
  : typeof c === 'number' ? String(Math.round(c * 1e6) / 1e6) : String(c);

/** Excel sheet (array of rows, first row = headers) → the same records as a CSV file. Empty rows are skipped. */
export function parseSheetRows(data: Cell[][]): ParsedImport {
  const [header, ...rest] = data;
  if (!header) return { rows: [], errors: [] };
  const keys = header.map((h) => cellText(h).trim().toLowerCase());
  const records = rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, cellText(r[i])]).filter(([k]) => k)));
  return normaliseRows(records);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
