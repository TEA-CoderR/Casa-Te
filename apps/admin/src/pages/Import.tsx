import { useState } from 'react';
import { formatEuro, formatWeight, type ImportReport, type ImportRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText } from '../lib/data';
import { readSheet } from 'read-excel-file/browser';
import { chunk, parseImportFile, parseSheetRows, type ParsedImport } from '../lib/importer';
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
    if (/\.xlsx$/i.test(file.name)) {
      // The template keeps the products on the "Prodotti" sheet; any other workbook: first sheet.
      try {
        let data;
        try { data = await readSheet(file, 'Prodotti'); } catch { data = await readSheet(file); }
        setParsed(parseSheetRows(data as Parameters<typeof parseSheetRows>[0]));
      } catch { setError('Impossibile leggere il file Excel. Salvalo come .xlsx oppure come CSV e riprova.'); }
      return;
    }
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

  const template = `${import.meta.env.BASE_URL}modello-prodotti-casa-te.xlsx`;

  const preview: ImportRow[] = parsed?.rows.slice(0, 20) ?? [];
  return <>
    <PageHead title="Importa prodotti" subtitle="Crea o aggiorna prodotti, prezzi, schede e giacenze in blocco da Excel o CSV (chiave: SKU)"
      actions={<div className="row">
        <a className="btn secondary" href={template} download>Scarica modello Excel</a>
        <a className="btn secondary" href={`${import.meta.env.BASE_URL}modello-prodotti-casa-te.csv`} download>Modello CSV</a>
        <a className="btn secondary" href={`${import.meta.env.BASE_URL}istruzioni-prodotti-per-ai.txt`} download>Istruzioni (testo)</a>
      </div>} />
    <div className="card">
      <p>Compila il foglio <strong>Prodotti</strong> del modello (le istruzioni sono nel foglio <strong>Istruzioni</strong>) e caricalo qui così com'è, in formato .xlsx.
        Vanno bene anche i CSV con le stesse intestazioni. Obbligatori: <code>sku, nome, prezzo, peso kg</code>. Le celle vuote non cancellano i dati già presenti.</p>
      <label className="btn">Scegli file Excel o CSV<input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
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
        <thead><tr><th>SKU</th><th>Nome</th><th>Categoria</th><th className="num">Prezzo</th><th className="num">Peso</th><th>IVA</th><th>Scheda</th><th>Giacenze</th></tr></thead>
        <tbody>{preview.map((r) => <tr key={r.sku}><td>{r.sku}</td><td>{r.name}</td><td>{r.category ? `${r.category}${r.subcategory ? ` › ${r.subcategory}` : ''}` : '—'}</td>
          <td className="num">{formatEuro(r.price_cents)}</td><td className="num">{formatWeight(r.weight_g)}</td><td>{r.vat_rate}%</td>
          <td className="small">{[r.color, r.unit ? `${r.unit_quantity} ${r.unit}` : null, r.variant_label ? `variante ${r.variant_label}` : null,
            r.highlights?.length ? `${r.highlights.length} ${r.highlights.length === 1 ? 'punto' : 'punti'} di forza` : null, r.image_urls?.length ? `${r.image_urls.length} foto` : null].filter(Boolean).join(' · ') || '—'}</td>
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
