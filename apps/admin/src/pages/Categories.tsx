import { useState } from 'react';
import type { CategoryRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText, useCategories } from '../lib/data';
import { Field, Loading, Modal, Notice, PageHead } from '../components/ui';

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function CategoriesPage() {
  const categories = useCategories();
  const [edit, setEdit] = useState<Partial<CategoryRow> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit?.name?.trim()) return;
    setBusy(true); setError('');
    const row = { name: edit.name.trim(), slug: edit.slug?.trim() || slugify(edit.name), sort: Number(edit.sort ?? 0), active: edit.active ?? true, parent_id: edit.parent_id || null };
    try {
      if (edit.id) unwrap(await supabase.from('categories').update(row).eq('id', edit.id));
      else unwrap(await supabase.from('categories').insert(row));
      setEdit(null); await categories.reload();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const remove = async (c: CategoryRow) => {
    if (!window.confirm(`Eliminare la categoria "${c.name}"? I prodotti resteranno senza categoria.`)) return;
    try { unwrap(await supabase.from('categories').delete().eq('id', c.id)); await categories.reload(); } catch (e) { setError(errorText(e)); }
  };

  return <>
    <PageHead title="Categorie" actions={<button onClick={() => setEdit({ active: true, sort: (categories.data?.length ?? 0) + 1 })}>+ Nuova categoria</button>} />
    {error && <Notice tone="error">{error}</Notice>}
    {!categories.data ? <Loading /> : <div className="table-wrap"><table>
      <thead><tr><th>Ordine</th><th>Nome</th><th>Slug</th><th>Padre</th><th>Stato</th><th></th></tr></thead>
      <tbody>{categories.data.map((c) => <tr key={c.id}><td>{c.sort}</td><td><strong>{c.name}</strong></td><td className="muted">{c.slug}</td>
        <td>{categories.data?.find((p) => p.id === c.parent_id)?.name ?? '—'}</td>
        <td>{c.active ? <span className="badge">Visibile</span> : <span className="badge muted">Nascosta</span>}</td>
        <td className="num"><button className="ghost" onClick={() => setEdit(c)}>Modifica</button><button className="ghost danger" onClick={() => remove(c)}>Elimina</button></td></tr>)}</tbody>
    </table></div>}
    {edit && <Modal title={edit.id ? 'Modifica categoria' : 'Nuova categoria'} onClose={() => setEdit(null)}>
      <div className="grid">
        <Field label="Nome"><input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
        <Field label="Slug" hint="Lascia vuoto per generarlo"><input value={edit.slug ?? ''} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></Field>
        <Field label="Categoria padre"><select value={edit.parent_id ?? ''} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value || null })}>
          <option value="">— nessuna —</option>{categories.data?.filter((c) => c.id !== edit.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Ordine di visualizzazione"><input type="number" value={edit.sort ?? 0} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></Field>
        <label className="check"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Visibile ai clienti</label>
        <button disabled={busy || !edit.name?.trim()} onClick={save}>Salva</button>
      </div>
    </Modal>}
  </>;
}
