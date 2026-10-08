import { useRef, useState } from 'react';
import { flyerFileUrl, type FlyerRow } from '@casa-te/shared';
import { SUPABASE_URL, supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync } from '../lib/data';
import { t } from '../lib/i18n';
import { Empty, Field, Loading, Modal, Notice, PageHead, fmtDate } from '../components/ui';
import { Icon } from '../components/Icon';

type Draft = Partial<FlyerRow> & { page_paths: string[] };
const today = () => new Date().toISOString().slice(0, 10);

/** Where a flyer stands for customers right now. */
function flyerStatus(f: FlyerRow): { label: string; live: boolean } {
  const now = today();
  if (!f.active) return { label: t('Bozza'), live: false };
  if (f.valid_from && f.valid_from > now) return { label: t('Programmato'), live: false };
  if (f.valid_to && f.valid_to < now) return { label: t('Scaduto'), live: false };
  return { label: t('Visibile nel negozio'), live: true };
}

/** Marketing → Volantino: the monthly flyer as a PDF and/or page images (bucket "flyers"). */
export function FlyersPage() {
  const flyers = useAsync(async () =>
    unwrap(await supabase.from('flyers').select('*').order('valid_from', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false })) as FlyerRow[], []);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pdfInput = useRef<HTMLInputElement>(null);
  const pageInput = useRef<HTMLInputElement>(null);
  const folder = useRef('');

  const open = (f?: FlyerRow) => {
    setError('');
    folder.current = f?.id ?? crypto.randomUUID();
    setEdit(f ? { ...f, page_paths: [...f.page_paths] } : { title: '', valid_from: today(), valid_to: null, pdf_path: null, page_paths: [], active: true });
  };

  const upload = async (file: File, name: string) => {
    const path = `${folder.current}/${name}`;
    const { error: upErr } = await supabase.storage.from('flyers').upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: true });
    if (upErr) throw upErr;
    return path;
  };
  const uploadPdf = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !edit) return;
    setError('');
    if (file.type !== 'application/pdf') { setError(t('Il file deve essere un PDF.')); return; }
    if (file.size > 25 * 1024 * 1024) { setError(t('PDF troppo grande (max 25 MB).')); return; }
    setBusy(true);
    try { setEdit({ ...edit, pdf_path: await upload(file, `volantino-${Date.now()}.pdf`) }); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const uploadPages = async (files: FileList | null) => {
    if (!files?.length || !edit) return;
    setError('');
    const list = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }));
    if (list.some((f) => !/^image\/(jpeg|png|webp)$/.test(f.type))) { setError(t('Formati accettati: JPG, PNG, WEBP.')); return; }
    if (list.some((f) => f.size > 8 * 1024 * 1024)) { setError(t('Immagine troppo grande (max 8 MB).')); return; }
    if (edit.page_paths.length + list.length > 40) { setError(t('Al massimo 40 pagine.')); return; }
    setBusy(true);
    try {
      const added: string[] = [];
      for (const f of list) added.push(await upload(f, `pagina-${Date.now()}-${added.length + 1}.${f.type.split('/')[1].replace('jpeg', 'jpg')}`));
      setEdit({ ...edit, page_paths: [...edit.page_paths, ...added] });
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const movePage = (from: number, to: number) => {
    if (!edit || to < 0 || to >= edit.page_paths.length) return;
    const next = [...edit.page_paths];
    const [p] = next.splice(from, 1);
    next.splice(to, 0, p);
    setEdit({ ...edit, page_paths: next });
  };

  const save = async () => {
    if (!edit) return;
    setBusy(true); setError('');
    const row = {
      title: edit.title?.trim() ?? '', valid_from: edit.valid_from || null, valid_to: edit.valid_to || null,
      pdf_path: edit.pdf_path ?? null, page_paths: edit.page_paths, active: edit.active ?? true,
    };
    try {
      if (edit.id) unwrap(await supabase.from('flyers').update(row).eq('id', edit.id));
      else unwrap(await supabase.from('flyers').insert({ ...row, id: folder.current }));
      setEdit(null); await flyers.reload();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const remove = async (f: FlyerRow) => {
    if (!window.confirm(t('Eliminare il volantino "{name}"?', { name: f.title }))) return;
    try {
      unwrap(await supabase.from('flyers').delete().eq('id', f.id));
      const files = [f.pdf_path, ...f.page_paths].filter((p): p is string => !!p && !/^https:/.test(p));
      if (files.length) await supabase.storage.from('flyers').remove(files);
      await flyers.reload();
    } catch (e) { setError(errorText(e)); }
  };

  const invalidDates = !!edit?.valid_from && !!edit?.valid_to && edit.valid_to < edit.valid_from;
  const canSave = !!edit && !busy && !!edit.title?.trim() && (!!edit.pdf_path || edit.page_paths.length > 0) && !invalidDates;

  return <>
    <PageHead title={t('Volantino')}
      subtitle={t('Il volantino del mese nell’app e nel negozio online: carica le pagine come immagini e/o il PDF da scaricare. I clienti vedono solo quelli pubblicati e nel periodo di validità.')}
      actions={<button onClick={() => open()}>{t('+ Nuovo volantino')}</button>} />
    {error && !edit && <Notice tone="error">{error}</Notice>}
    {!flyers.data ? <Loading /> : !flyers.data.length ? <Empty>{t('Nessun volantino. Creane uno con «+ Nuovo volantino».')}</Empty>
      : <div className="table-wrap"><table>
        <thead><tr><th>{t('Titolo')}</th><th>{t('Validità')}</th><th>{t('Contenuto')}</th><th>{t('Stato')}</th><th></th></tr></thead>
        <tbody>{flyers.data.map((f) => {
          const status = flyerStatus(f);
          const cover = flyerFileUrl(SUPABASE_URL, f.page_paths[0]);
          return <tr key={f.id}>
            <td><span className="cat-name">{cover ? <img className="cat-cover" src={cover} alt="" style={{ borderRadius: 4 }} /> : <span className="cat-cover" />}<strong>{f.title}</strong></span></td>
            <td>{f.valid_from ? fmtDate(f.valid_from) : '…'} – {f.valid_to ? fmtDate(f.valid_to) : '…'}</td>
            <td className="muted">{[f.page_paths.length ? t('{n} pagine', { n: f.page_paths.length }) : '', f.pdf_path ? 'PDF' : ''].filter(Boolean).join(' · ')}</td>
            <td><span className={status.live ? 'badge' : 'badge muted'}>{status.label}</span></td>
            <td className="num">
              {f.pdf_path && <a className="ghost" href={flyerFileUrl(SUPABASE_URL, f.pdf_path)!} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{t('Apri PDF')}</a>}
              <button className="ghost" onClick={() => open(f)}>{t('Modifica')}</button>
              <button className="ghost danger" onClick={() => remove(f)}>{t('Elimina')}</button></td>
          </tr>;
        })}</tbody>
      </table></div>}

    {edit && <Modal title={edit.id ? t('Modifica volantino') : t('Nuovo volantino')} onClose={() => setEdit(null)} dirty>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid">
        <Field label={t('Titolo')}><input value={edit.title ?? ''} maxLength={120} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder={t('es. Volantino di ottobre')} /></Field>
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <Field label={t('Valido dal')}><input type="date" value={edit.valid_from ?? ''} onChange={(e) => setEdit({ ...edit, valid_from: e.target.value || null })} /></Field>
          <Field label={t('Valido fino al')} hint={invalidDates ? t('La fine è prima dell’inizio.') : undefined}>
            <input type="date" value={edit.valid_to ?? ''} onChange={(e) => setEdit({ ...edit, valid_to: e.target.value || null })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> {t('Pubblicato (visibile ai clienti nel periodo di validità)')}</label>

        <div className="field">{t('Pagine (immagini, nell’ordine di lettura)')}
          {edit.page_paths.length > 0 && <div className="flyer-pages">{edit.page_paths.map((p, i) => <div key={p} className="flyer-page">
            <img src={flyerFileUrl(SUPABASE_URL, p)!} alt={t('Pagina {n}', { n: i + 1 })} />
            <div className="row" style={{ gap: 2, justifyContent: 'center' }}>
              <button type="button" className="ghost icon-btn" disabled={i === 0} onClick={() => movePage(i, i - 1)} aria-label={t('Sposta su')}><span className="flip"><Icon name="chevronDown" size={14} /></span></button>
              <span className="small muted">{i + 1}</span>
              <button type="button" className="ghost icon-btn" disabled={i === edit.page_paths.length - 1} onClick={() => movePage(i, i + 1)} aria-label={t('Sposta giù')}><Icon name="chevronDown" size={14} /></button>
              <button type="button" className="ghost danger icon-btn" onClick={() => setEdit({ ...edit, page_paths: edit.page_paths.filter((x) => x !== p) })} aria-label={t('Rimuovi')}><Icon name="close" size={14} /></button>
            </div>
          </div>)}</div>}
          <div className="row"><button type="button" className="secondary" disabled={busy} onClick={() => pageInput.current?.click()}>{busy ? t('Caricamento…') : t('Aggiungi pagine')}</button></div>
          <span className="small muted">{t('JPG, PNG o WEBP, in verticale (es. 1200×1700 px). Puoi selezionare più file insieme: vengono ordinati per nome.')}</span>
          <input ref={pageInput} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void uploadPages(e.target.files); e.target.value = ''; }} />
        </div>

        <div className="field">{t('PDF da scaricare (facoltativo)')}
          <div className="row">
            {edit.pdf_path ? <a href={flyerFileUrl(SUPABASE_URL, edit.pdf_path)!} target="_blank" rel="noreferrer">{t('Apri PDF')}</a> : <span className="muted">{t('Nessun PDF')}</span>}
            <button type="button" className="secondary" disabled={busy} onClick={() => pdfInput.current?.click()}>{edit.pdf_path ? t('Sostituisci PDF') : t('Carica PDF')}</button>
            {edit.pdf_path && <button type="button" className="ghost danger" onClick={() => setEdit({ ...edit, pdf_path: null })}>{t('Rimuovi')}</button>}
          </div>
          <input ref={pdfInput} type="file" accept="application/pdf" hidden onChange={(e) => { void uploadPdf(e.target.files); e.target.value = ''; }} />
        </div>

        <button disabled={!canSave} onClick={save}>{busy ? t('Salvataggio…') : t('Salva')}</button>
        {!edit.pdf_path && !edit.page_paths.length && <span className="small muted">{t('Aggiungi almeno le pagine o il PDF.')}</span>}
      </div>
    </Modal>}
  </>;
}
