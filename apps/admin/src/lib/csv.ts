// RFC 4180 CSV parsing/serialisation. Auto-detects "," or ";" (Italian Excel exports use ";").

export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = { ',': 0, ';': 0, '\t': 0 } as Record<',' | ';' | '\t', number>;
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch as ',' | ';' | '\t']++;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as ',' | ';' | '\t';
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === sep) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Parses a CSV with a header row into objects keyed by normalised (lower-case, trimmed) header. */
export function parseCsvObjects(input: string): Array<Record<string, string>> {
  const [header, ...rows] = parseCsv(input);
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

function escapeCell(value: unknown, sep: string): string {
  const s = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell).
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s;
  return /["\n\r]/.test(safe) || safe.includes(sep) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[], sep = ';'): string {
  const lines = [columns.join(sep), ...rows.map((r) => columns.map((c) => escapeCell(r[c], sep)).join(sep))];
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
