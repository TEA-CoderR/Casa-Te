import { useState } from 'react';
import type { StoreRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText, loadStores, useAsync } from '../lib/data';
import { t } from '../lib/i18n';
import { Field, Loading, Modal, Notice, PageHead } from '../components/ui';

export function StoresPage() {
  const stores = useAsync(() => loadStores(true), []);
  const [edit, setEdit] = useState<Partial<StoreRow> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit) return;
    setError('');
    const row = { code: edit.code?.trim().toUpperCase(), name: edit.name?.trim(), city: edit.city?.trim(), address: edit.address?.trim() || null,
      postal_code: edit.postal_code?.trim() || null, province: edit.province?.trim().toUpperCase() || null, phone: edit.phone?.trim() || null,
      email: edit.email?.trim() || null, opening_hours: edit.opening_hours?.trim() || null, pickup_enabled: edit.pickup_enabled ?? true,
      ships_orders: edit.ships_orders ?? true, active: edit.active ?? true, sort: Number(edit.sort ?? 0) };
    if (!row.code || !row.name || !row.city) return setError(t('Codice, nome e città sono obbligatori.'));
    setBusy(true);
    try {
      if (edit.id) unwrap(await supabase.from('stores').update(row).eq('id', edit.id));
      else unwrap(await supabase.from('stores').insert(row));
      setEdit(null); await stores.reload();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return <>
    <PageHead title={t('Negozi')} subtitle={t('Indirizzi e orari vengono mostrati ai clienti per il ritiro')}
      actions={<button onClick={() => setEdit({ active: true, pickup_enabled: true, ships_orders: true })}>{t('+ Nuovo negozio')}</button>} />
    {stores.data?.some((s) => s.active && !s.address) && <Notice tone="warn">{t('Alcuni negozi non hanno ancora indirizzo e orari: completali prima del lancio.')}</Notice>}
    {!stores.data ? <Loading /> : <div className="table-wrap"><table>
      <thead><tr><th>{t('Codice')}</th><th>{t('Negozio')}</th><th>{t('Indirizzo')}</th><th>{t('Telefono')}</th><th>{t('Ritiro')}</th><th>{t('Spedisce')}</th><th>{t('Stato')}</th><th></th></tr></thead>
      <tbody>{stores.data.map((s) => <tr key={s.id}><td>{s.code}</td><td><strong>{s.name}</strong><div className="small muted">{s.opening_hours}</div></td>
        <td>{s.address ? `${s.address}, ${s.postal_code ?? ''} ${s.city}` : <span className="badge warn">{t('Da completare')}</span>}</td><td>{s.phone ?? '—'}</td>
        <td>{s.pickup_enabled ? '✓' : '—'}</td><td>{s.ships_orders ? '✓' : '—'}</td>
        <td>{s.active ? <span className="badge">{t('Attivo')}</span> : <span className="badge muted">{t('Disattivo')}</span>}</td>
        <td className="num"><button className="ghost" onClick={() => setEdit(s)}>{t('Modifica')}</button></td></tr>)}</tbody></table></div>}
    {edit && <Modal title={edit.id ? t('Modifica negozio') : t('Nuovo negozio')} onClose={() => setEdit(null)}>
      <div className="grid">
        {error && <Notice tone="error">{error}</Notice>}
        <div className="form-grid">
          <Field label={t('Codice (es. LU1)')}><input value={edit.code ?? ''} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
          <Field label={t('Nome')}><input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label={t('Indirizzo')}><input value={edit.address ?? ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
          <Field label={t('Città')}><input value={edit.city ?? ''} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
          <Field label={t('CAP')}><input value={edit.postal_code ?? ''} maxLength={5} onChange={(e) => setEdit({ ...edit, postal_code: e.target.value })} /></Field>
          <Field label={t('Provincia')}><input value={edit.province ?? ''} maxLength={2} onChange={(e) => setEdit({ ...edit, province: e.target.value })} /></Field>
          <Field label={t('Telefono')}><input value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label={t('Email')}><input value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
          <Field label={t('Ordine##posizione')}><input type="number" value={edit.sort ?? 0} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></Field>
        </div>
        <Field label={t('Orari (mostrati ai clienti)')}><input value={edit.opening_hours ?? ''} onChange={(e) => setEdit({ ...edit, opening_hours: e.target.value })} placeholder={t('Lun–Sab 9:00–19:30')} /></Field>
        <label className="check"><input type="checkbox" checked={edit.pickup_enabled ?? true} onChange={(e) => setEdit({ ...edit, pickup_enabled: e.target.checked })} /> {t('Ritiro in negozio abilitato')}</label>
        <label className="check"><input type="checkbox" checked={edit.ships_orders ?? true} onChange={(e) => setEdit({ ...edit, ships_orders: e.target.checked })} /> {t('Prepara ordini da spedire (domicilio / punti di ritiro)')}</label>
        <label className="check"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> {t('Attivo')}</label>
        <button disabled={busy} onClick={save}>{t('Salva')}</button>
      </div>
    </Modal>}
  </>;
}
