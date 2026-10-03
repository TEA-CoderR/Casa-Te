import { useRef, useState } from 'react';
import { productImageUrl, type CategoryRow } from '@casa-te/shared';
import { SUPABASE_URL, supabase, unwrap } from '../lib/supabase';
import { errorText, useCategories } from '../lib/data';
import { Field, Loading, Modal, Notice, PageHead } from '../components/ui';
import { t } from '../lib/i18n';

/** Top-level categories, each followed by its subcategories. */
const ordered = (list: CategoryRow[]) => list.filter((c) => !c.parent_id)
  .flatMap((p) => [p, ...list.filter((c) => c.parent_id === p.id)])
  .concat(list.filter((c) => c.parent_id && !list.some((p) => p.id === c.parent_id)));

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function CategoriesPage() {
  const categories = useCategories();
  const [edit, setEdit] = useState<Partial<CategoryRow> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const homeCount = (categories.data ?? []).filter((c) => c.show_on_home && c.id !== edit?.id).length + (edit?.show_on_home && !edit.parent_id ? 1 : 0);

  const save = async () => {
    if (!edit?.name?.trim()) return;
    setBusy(true); setError('');
    const row = { name: edit.name.trim(), slug: edit.slug?.trim() || slugify(edit.name), sort: Number(edit.sort ?? 0), active: edit.active ?? true, parent_id: edit.parent_id || null,
      show_on_home: !edit.parent_id && (edit.show_on_home ?? false), image_path: edit.parent_id ? null : edit.image_path ?? null };
    try {
      if (edit.id) unwrap(await supabase.from('categories').update(row).eq('id', edit.id));
      else unwrap(await supabase.from('categories').insert(row));
      setEdit(null); await categories.reload();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  // Cover photo for the home circle: uploaded next to the product photos (folder categories/).
  const uploadCover = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !edit) return;
    setError('');
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError(t('Formati accettati: JPG, PNG, WEBP.')); return; }
    if (file.size > 5 * 1024 * 1024) { setError(t('Immagine troppo grande (max 5 MB).')); return; }
    setBusy(true);
    const path = `categories/${crypto.randomUUID()}.${file.type.split('/')[1].replace('jpeg', 'jpg')}`;
    const { error: upErr } = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
    setBusy(false);
    if (upErr) { setError(errorText(upErr)); return; }
    setEdit({ ...edit, image_path: path });
  };
  const cover = (c: Partial<CategoryRow>) => productImageUrl(SUPABASE_URL, c.image_path ?? null);

  const remove = async (c: CategoryRow) => {
    if (!window.confirm(t('Eliminare la categoria "{name}"? I prodotti resteranno senza categoria.', { name: c.name }))) return;
    try { unwrap(await supabase.from('categories').delete().eq('id', c.id)); await categories.reload(); } catch (e) { setError(errorText(e)); }
  };

  return <>
    <PageHead title={t('Categorie')} subtitle={t('Con la spunta «Mostra in home» scegli le 8 categorie principali mostrate nella home del negozio.')} actions={<button onClick={() => setEdit({ active: true, sort: (categories.data?.length ?? 0) + 1 })}>{t('+ Nuova categoria')}</button>} />
    {error && <Notice tone="error">{error}</Notice>}
    {!categories.data ? <Loading /> : <div className="table-wrap"><table>
      <thead><tr><th>{t('Ordine##posizione')}</th><th>{t('Nome')}</th><th>{t('Slug')}</th><th>{t('Padre')}</th><th>{t('Home')}</th><th>{t('Stato')}</th><th></th></tr></thead>
      <tbody>{ordered(categories.data).map((c) => <tr key={c.id}><td>{c.sort}</td><td>{c.parent_id ? <span style={{ paddingLeft: 22 }}>↳ {c.name}</span> : <span className="cat-name">{cover(c) ? <img className="cat-cover" src={cover(c)!} alt="" /> : <span className="cat-cover" />}<strong>{c.name}</strong></span>}</td><td className="muted">{c.slug}</td>
        <td>{categories.data?.find((p) => p.id === c.parent_id)?.name ?? '—'}</td>
        <td>{c.show_on_home ? <span className="badge">{t('In home')}</span> : ''}</td>
        <td>{c.active ? <span className="badge">{t('Visibile')}</span> : <span className="badge muted">{t('Nascosta')}</span>}</td>
        <td className="num"><button className="ghost" onClick={() => setEdit(c)}>{t('Modifica')}</button><button className="ghost danger" onClick={() => remove(c)}>{t('Elimina')}</button></td></tr>)}</tbody>
    </table></div>}
    {edit && <Modal title={edit.id ? t('Modifica categoria') : t('Nuova categoria')} onClose={() => setEdit(null)}>
      <div className="grid">
        <Field label={t('Nome')}><input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
        <Field label={t('Slug')} hint={t('Lascia vuoto per generarlo')}><input value={edit.slug ?? ''} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></Field>
        <Field label={t('Categoria padre')}><select value={edit.parent_id ?? ''} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value || null })}>
          <option value="">{t('— nessuna (categoria principale) —')}</option>{categories.data?.filter((c) => c.id !== edit.id && !c.parent_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label={t('Ordine di visualizzazione')}><input type="number" value={edit.sort ?? 0} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></Field>
        <label className="check"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> {t('Visibile ai clienti')}</label>
        {!edit.parent_id && <label className="check"><input type="checkbox" checked={edit.show_on_home ?? false} onChange={(e) => setEdit({ ...edit, show_on_home: e.target.checked })} />
          {t('Mostra in home ({n}/8 scelte; l\'ordine segue il campo "Ordine")', { n: homeCount })}</label>}
        {!edit.parent_id && <div className="field">{t('Foto di copertina (cerchio in home)')}
          <div className="row">
            {cover(edit) ? <img className="cat-cover big" src={cover(edit)!} alt="" /> : <span className="cat-cover big" />}
            <button type="button" className="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>{cover(edit) ? t('Cambia foto') : t('Carica foto')}</button>
            {!!edit.image_path && <button type="button" className="ghost danger" onClick={() => setEdit({ ...edit, image_path: null })}>{t('Rimuovi')}</button>}
          </div>
          <span className="small muted">{t('Quadrata, almeno 400×400 px. Senza foto il cerchio mostra l’icona del reparto.')}</span>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void uploadCover(e.target.files); e.target.value = ''; }} />
        </div>}
        <button disabled={busy || !edit.name?.trim()} onClick={save}>{t('Salva')}</button>
      </div>
    </Modal>}
  </>;
}
