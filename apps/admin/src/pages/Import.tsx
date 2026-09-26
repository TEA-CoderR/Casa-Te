import { useState } from 'react';
import { formatEuro, formatWeight, type ImportReport, type ImportRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText } from '../lib/data';
import { downloadCsv } from '../lib/csv';
import { TEMPLATE_HEADERS, chunk, parseImportFile, type ParsedImport } from '../lib/importer';
import { Notice, PageHead } from '../components/ui';

const BATCH = 500;

export function ImportPage() {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const onFile = async (file: File | undefined) => {
    setReport(null); setError(''); setParsed(null);
    if (!file) return;
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    // Excel "CSV (delimitato dal separatore di elenco)" is often Windows-1252, not UTF-8.
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    setParsed(parseImportFile(text));
  };

  const run = async (dryRun: boolean) => {
    if (!parsed?.rows.length) return;
    setBusy(true); setError(''); setReport(null);
    const total: ImportReport = { dry_run: dryRun, created: 0, updated: 0, failed: 0, rows: [] };
    try {
      const batches = chunk(parsed.rows, BATCH);
      for (const [i, batch] of batches.entries()) {
        setProgress(`${dryRun ? 'Verifica' : 'Importazione'} ${i + 1}/${batches.length}…`);
        const r = unwrap(await supabase.rpc('admin_import_products', { p_rows: batch, p_dry_run: dryRun })) as ImportReport;
        total.created += r.created; total.updated += r.updated; total.failed += r.failed;
        total.rows.push(...r.rows.map((row) => ({ ...row, row: row.row + i * BATCH })));
      }
      setReport(total);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); setProgress(''); }
  };

  const template = () => downloadCsv('modello-import-prodotti.csv', '﻿' + [TEMPLATE_HEADERS.join(';'),
    'TOV-001;Tovaglia cotone 140x180;Tessile casa;14,90;;22;0,45;8001234567890;CASA & TE;Tovaglia in puro cotone;si;no;https://esempio.it/tovaglia.jpg;10;5;5;5;5'].join('\r\n'));

  const preview: ImportRow[] = parsed?.rows.slice(0, 20) ?? [];
  return <>
    <PageHead title="Importa prodotti da CSV" subtitle="Crea o aggiorna prodotti, prezzi e giacenze in blocco (chiave: SKU)"
      actions={<button className="secondary" onClick={template}>Scarica modello</button>} />
    <div className="card">
      <p>Colonne riconosciute: <code>sku, nome, categoria, prezzo, prezzo barrato, iva, peso kg</code> (o <code>peso g</code>), <code>ean, marca, descrizione, attivo, in evidenza, immagine</code>
        e una colonna <code>stock:CODICE</code> per ogni negozio (es. <code>stock:LU1</code>). Separatore <code>;</code> o <code>,</code>. Le celle vuote non cancellano descrizione, marca ed EAN esistenti.</p>
      <label className="btn">Scegli file CSV<input type="file" accept=".csv,text/csv" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
      {fileName && <span className="muted" style={{ marginLeft: 10 }}>{fileName}</span>}
    </div>
    {error && <Notice tone="error">{error}</Notice>}

    {parsed && <>
      <h2>Anteprima</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="badge">{parsed.rows.length} righe valide</span>
        {parsed.errors.length > 0 && <span className="badge bad">{parsed.errors.length} righe con errori (saranno ignorate)</span>}
      </div>
      {parsed.errors.length > 0 && <div className="table-wrap" style={{ maxHeight: 240, marginBottom: 14 }}><table>
        <thead><tr><th>Riga</th><th>SKU</th><th>Problema</th></tr></thead>
        <tbody>{parsed.errors.map((e) => <tr key={e.line}><td>{e.line}</td><td>{e.sku}</td><td className="danger">{e.message}</td></tr>)}</tbody></table></div>}
      {preview.length > 0 && <div className="table-wrap" style={{ maxHeight: 360 }}><table>
        <thead><tr><th>SKU</th><th>Nome</th><th>Categoria</th><th className="num">Prezzo</th><th className="num">Peso</th><th>IVA</th><th>Giacenze</th></tr></thead>
        <tbody>{preview.map((r) => <tr key={r.sku}><td>{r.sku}</td><td>{r.name}</td><td>{r.category ?? '—'}</td>
          <td className="num">{formatEuro(r.price_cents)}</td><td className="num">{formatWeight(r.weight_g)}</td><td>{r.vat_rate}%</td>
          <td className="small">{r.stock ? Object.entries(r.stock).map(([k, v]) => `${k}: ${v}`).join(', ') : '—'}</td></tr>)}</tbody></table></div>}
      {parsed.rows.length > 20 && <p className="small muted">… e altre {parsed.rows.length - 20} righe.</p>}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="secondary" disabled={busy || !parsed.rows.length} onClick={() => run(true)}>1. Verifica (nessuna modifica)</button>
        <button disabled={busy || !parsed.rows.length || !report?.dry_run || report.failed > 0} onClick={() => run(false)}>2. Importa</button>
        {progress && <span className="muted">{progress}</span>}
      </div>
      {!report?.dry_run && <p className="small muted">Esegui prima la verifica: l'importazione si abilita quando non ci sono errori.</p>}
    </>}

    {report && <>
      <h2>{report.dry_run ? 'Risultato verifica' : 'Importazione completata'}</h2>
      <div className="row"><span className="badge">{report.created} nuovi</span><span className="badge muted">{report.updated} aggiornati</span>
        {report.failed > 0 && <span className="badge bad">{report.failed} errori</span>}</div>
      {report.failed > 0 && <div className="table-wrap" style={{ marginTop: 10 }}><table><thead><tr><th>Riga</th><th>SKU</th><th>Errore</th></tr></thead>
        <tbody>{report.rows.filter((r) => r.result === 'error').map((r) => <tr key={r.row}><td>{r.row + 1}</td><td>{r.sku}</td><td className="danger">{r.error}</td></tr>)}</tbody></table></div>}
    </>}
  </>;
}
