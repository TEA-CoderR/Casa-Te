import { Fragment, useState, type ReactNode } from 'react';
import { formatEuro, formatWeight, type ImportReport, type ImportRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText } from '../lib/data';
import { readSheet } from 'read-excel-file/browser';
import { chunk, parseImportFile, parseSheetRows, type ParsedImport } from '../lib/importer';
import { Notice, PageHead } from '../components/ui';
import { t } from '../lib/i18n';

const BATCH = 500;

/** Translated sentence with {name} placeholders replaced by inline elements (<strong>, <code>…). */
const rich = (text: string, parts: Record<string, ReactNode>) =>
  text.split(/(\{\w+\})/).map((seg, i) => <Fragment key={i}>{/^\{\w+\}$/.test(seg) && seg.slice(1, -1) in parts ? parts[seg.slice(1, -1)] : seg}</Fragment>);

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
      } catch { setError(t('Impossibile leggere il file Excel. Salvalo come .xlsx oppure come CSV e riprova.')); }
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
        const vars = { i: i + 1, n: batches.length };
        setProgress(dryRun ? t('Verifica {i}/{n}…', vars) : t('Importazione {i}/{n}…', vars));
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
    <PageHead title={t('Importa prodotti')} subtitle={t('Crea o aggiorna prodotti, prezzi, schede e giacenze in blocco da Excel o CSV (chiave: SKU)')}
      actions={<div className="row">
        <a className="btn secondary" href={template} download>{t('Scarica modello Excel')}</a>
        <a className="btn secondary" href={`${import.meta.env.BASE_URL}modello-prodotti-casa-te.csv`} download>{t('Modello CSV')}</a>
        <a className="btn secondary" href={`${import.meta.env.BASE_URL}istruzioni-prodotti-per-ai.txt`} download>{t('Istruzioni (testo)')}</a>
      </div>} />
    <div className="card">
      <p>{rich(t("Compila il foglio {sheet} del modello (le istruzioni sono nel foglio {help}) e caricalo qui così com'è, in formato .xlsx."),
        { sheet: <strong>Prodotti</strong>, help: <strong>Istruzioni</strong> })}{' '}
        {t('Vanno bene anche i CSV con le stesse intestazioni.')}{' '}
        {rich(t('Obbligatori: {columns}.'), { columns: <code>sku, nome, prezzo, peso kg</code> })}{' '}
        {t('Le celle vuote non cancellano i dati già presenti.')}</p>
      <label className="btn">{t('Scegli file Excel o CSV')}<input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
      {fileName && <span className="muted" style={{ marginLeft: 10 }}>{fileName}</span>}
    </div>
    {error && <Notice tone="error">{error}</Notice>}

    {parsed && <>
      <h2>{t('Anteprima')}</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="badge">{t('{n} righe valide', { n: parsed.rows.length })}</span>
        {parsed.errors.length > 0 && <span className="badge bad">{t('{n} righe con errori (saranno ignorate)', { n: parsed.errors.length })}</span>}
      </div>
      {parsed.errors.length > 0 && <div className="table-wrap" style={{ maxHeight: 240, marginBottom: 14 }}><table>
        <thead><tr><th>{t('Riga')}</th><th>{t('SKU')}</th><th>{t('Problema')}</th></tr></thead>
        <tbody>{parsed.errors.map((e) => <tr key={e.line}><td>{e.line}</td><td>{e.sku}</td><td className="danger">{e.message}</td></tr>)}</tbody></table></div>}
      {preview.length > 0 && <div className="table-wrap" style={{ maxHeight: 360 }}><table>
        <thead><tr><th>{t('SKU')}</th><th>{t('Nome')}</th><th>{t('Categoria')}</th><th className="num">{t('Prezzo')}</th><th className="num">{t('Peso')}</th><th>{t('IVA')}</th><th>{t('Scheda')}</th><th>{t('Giacenze')}</th></tr></thead>
        <tbody>{preview.map((r) => <tr key={r.sku}><td>{r.sku}</td><td>{r.name}</td><td>{r.category ? `${r.category}${r.subcategory ? ` › ${r.subcategory}` : ''}` : '—'}</td>
          <td className="num">{formatEuro(r.price_cents)}</td><td className="num">{formatWeight(r.weight_g)}</td><td>{r.vat_rate}%</td>
          <td className="small">{[r.color, r.unit ? `${r.unit_quantity} ${r.unit}` : null, r.variant_label ? t('variante {label}', { label: r.variant_label }) : null,
            r.highlights?.length ? (r.highlights.length === 1 ? t('{n} punto di forza', { n: 1 }) : t('{n} punti di forza', { n: r.highlights.length })) : null, r.image_urls?.length ? t('{n} foto', { n: r.image_urls.length }) : null].filter(Boolean).join(' · ') || '—'}</td>
          <td className="small">{r.stock ? Object.entries(r.stock).map(([k, v]) => `${k}: ${v}`).join(', ') : '—'}</td></tr>)}</tbody></table></div>}
      {parsed.rows.length > 20 && <p className="small muted">{t('… e altre {n} righe.', { n: parsed.rows.length - 20 })}</p>}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="secondary" disabled={busy || !parsed.rows.length} onClick={() => run(true)}>{t('1. Verifica (nessuna modifica)')}</button>
        <button disabled={busy || !parsed.rows.length || !report?.dry_run || report.failed > 0} onClick={() => run(false)}>{t('2. Importa')}</button>
        {progress && <span className="muted">{progress}</span>}
      </div>
      {!report?.dry_run && <p className="small muted">{t("Esegui prima la verifica: l'importazione si abilita quando non ci sono errori.")}</p>}
    </>}

    {report && <>
      <h2>{report.dry_run ? t('Risultato verifica') : t('Importazione completata')}</h2>
      <div className="row"><span className="badge">{t('{n} nuovi', { n: report.created })}</span><span className="badge muted">{t('{n} aggiornati', { n: report.updated })}</span>
        {report.failed > 0 && <span className="badge bad">{t('{n} errori', { n: report.failed })}</span>}</div>
      {report.failed > 0 && <div className="table-wrap" style={{ marginTop: 10 }}><table><thead><tr><th>{t('Riga')}</th><th>{t('SKU')}</th><th>{t('Errore')}</th></tr></thead>
        <tbody>{report.rows.filter((r) => r.result === 'error').map((r) => <tr key={r.row}><td>{r.row + 1}</td><td>{r.sku}</td><td className="danger">{r.error}</td></tr>)}</tbody></table></div>}
    </>}
  </>;
}
