import { useState } from 'react';
import type { PickupPointRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync } from '../lib/data';
import { t } from '../lib/i18n';
import { Field, Loading, Modal, Notice, PageHead } from '../components/ui';

export function PickupPointsPage() {
  const points = useAsync(async () => unwrap(await supabase.from('pickup_points').select('*').order('city').order('name')) as PickupPointRow[], []);
  const [edit, setEdit] = useState<Partial<PickupPointRow> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit) return;
    setError('');
    const row = { name: edit.name?.trim(), carrier: edit.carrier?.trim() || null, address: edit.address?.trim(), city: edit.city?.trim(),
      postal_code: edit.postal_code?.trim(), province: edit.province?.trim().toUpperCase(), opening_hours: edit.opening_hours?.trim() || null,
      notes: edit.notes?.trim() || null, active: edit.active ?? true };
    if (!row.name || !row.address || !row.city || !/^\d{5}$/.test(row.postal_code ?? '') || !/^[A-Z]{2}$/.test(row.province ?? '')) {
      return setError(t('Compila nome, indirizzo, città, CAP (5 cifre) e provincia (2 lettere).'));
    }
    setBusy(true);
    try {
      if (edit.id) unwrap(await supabase.from('pickup_points').update(row).eq('id', edit.id));
      else unwrap(await supabase.from('pickup_points').insert(row));
      setEdit(null); await points.reload();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return <>
    <PageHead title={t('Punti di ritiro')} subtitle={t('Locker e negozi convenzionati proposti al checkout')}
      actions={<button onClick={() => setEdit({ active: true })}>{t('+ Nuovo punto')}</button>} />
    <Notice tone="warn">{t('Inserisci solo punti reali concordati con il corriere. I punti "DEMO" del database di prova vanno disattivati prima del lancio.')}</Notice>
    {!points.data ? <Loading /> : <div className="table-wrap"><table>
      <thead><tr><th>{t('Nome')}</th><th>{t('Rete')}</th><th>{t('Indirizzo')}</th><th>{t('Orari')}</th><th>{t('Stato')}</th><th></th></tr></thead>
      <tbody>{points.data.map((p) => <tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.carrier ?? '—'}</td>
        <td>{p.address}, {p.postal_code} {p.city} ({p.province})</td><td className="small">{p.opening_hours}</td>
        <td>{p.active ? <span className="badge">{t('Attivo')}</span> : <span className="badge muted">{t('Disattivo')}</span>}</td>
        <td className="num"><button className="ghost" onClick={() => setEdit(p)}>{t('Modifica')}</button></td></tr>)}</tbody></table></div>}
    {edit && <Modal title={edit.id ? t('Modifica punto') : t('Nuovo punto di ritiro')} onClose={() => setEdit(null)}>
      <div className="grid">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label={t('Nome')}><input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label={t('Rete / corriere')}><input value={edit.carrier ?? ''} onChange={(e) => setEdit({ ...edit, carrier: e.target.value })} placeholder={t('es. InPost, BRT Fermopoint')} /></Field>
        <Field label={t('Indirizzo')}><input value={edit.address ?? ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
        <div className="form-grid">
          <Field label={t('Città')}><input value={edit.city ?? ''} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
          <Field label={t('CAP')}><input value={edit.postal_code ?? ''} maxLength={5} onChange={(e) => setEdit({ ...edit, postal_code: e.target.value })} /></Field>
          <Field label={t('Provincia')}><input value={edit.province ?? ''} maxLength={2} onChange={(e) => setEdit({ ...edit, province: e.target.value.toUpperCase() })} /></Field>
        </div>
        <Field label={t('Orari')}><input value={edit.opening_hours ?? ''} onChange={(e) => setEdit({ ...edit, opening_hours: e.target.value })} /></Field>
        <Field label={t('Note interne')}><input value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> {t('Attivo')}</label>
        <button disabled={busy} onClick={save}>{t('Salva')}</button>
      </div>
    </Modal>}
  </>;
}
