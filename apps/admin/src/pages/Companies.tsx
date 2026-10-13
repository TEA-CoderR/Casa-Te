import { useState } from 'react';
import { companyIdentity, parseEuroInput, type CompanyRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText, loadStores, useAsync } from '../lib/data';
import { t } from '../lib/i18n';
import { Empty, Field, Loading, Modal, Notice, PageHead } from '../components/ui';

type Draft = Partial<CompanyRow> & { capital?: string };
/** "100.000,00" or "100000" → cents (dots are thousands separators when a comma is present). */
const parseCapital = (v: string) => parseEuroInput(v.includes(',') ? v.replace(/\./g, '') : v);
const emailOk = (v?: string | null) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/** Negozi → Aziende: the platform operator and the companies the stores belong to (sellers of their orders). */
export function CompaniesPage() {
  const companies = useAsync(async () =>
    unwrap(await supabase.from('companies').select('*').order('is_operator', { ascending: false }).order('legal_name')) as CompanyRow[], []);
  const stores = useAsync(() => loadStores(true), []);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (c?: CompanyRow) => {
    setError('');
    setEdit(c ? { ...c, capital: c.share_capital_cents == null ? '' : (c.share_capital_cents / 100).toFixed(2).replace('.', ',') }
      : { is_operator: !companies.data?.some((x) => x.is_operator) });
  };

  const save = async () => {
    if (!edit) return;
    setError('');
    const vat = edit.vat_number?.replace(/\s/g, '') ?? '';
    const capital = edit.capital?.trim() ? parseCapital(edit.capital) : null;
    const row = {
      legal_name: edit.legal_name?.trim() ?? '', address: edit.address?.trim() ?? '', postal_code: edit.postal_code?.trim() ?? '',
      city: edit.city?.trim() ?? '', province: edit.province?.trim().toUpperCase() ?? '', vat_number: vat,
      tax_code: edit.tax_code?.trim().toUpperCase() || null, rea: edit.rea?.trim() || null, share_capital_cents: capital,
      pec: edit.pec?.trim() || null, email: edit.email?.trim() || null, privacy_email: edit.privacy_email?.trim() || null,
      phone: edit.phone?.trim() || null, is_operator: edit.is_operator ?? false,
    };
    if (!row.legal_name || !row.address || !row.city) return setError(t('Ragione sociale, indirizzo e città sono obbligatori.'));
    if (!/^\d{5}$/.test(row.postal_code)) return setError(t('CAP non valido (5 cifre).'));
    if (!/^[A-Z]{2}$/.test(row.province)) return setError(t('Provincia non valida (2 lettere, es. LU).'));
    if (!/^\d{11}$/.test(row.vat_number)) return setError(t('Partita IVA non valida (11 cifre).'));
    if (row.tax_code && !/^([0-9]{11}|[A-Z0-9]{16})$/.test(row.tax_code)) return setError(t('Codice fiscale non valido.'));
    if (edit.capital?.trim() && capital == null) return setError(t('Capitale sociale non valido.'));
    if (![row.pec, row.email, row.privacy_email].every(emailOk)) return setError(t('Controlla gli indirizzi email.'));
    setBusy(true);
    try {
      if (edit.id) unwrap(await supabase.from('companies').update(row).eq('id', edit.id));
      else unwrap(await supabase.from('companies').insert(row));
      setEdit(null); await companies.reload();
    } catch (e) {
      const msg = errorText(e);
      setError(/companies_one_operator/.test(msg) ? t('Esiste già un gestore della piattaforma.') : /vat_number/.test(msg) ? t('Questa partita IVA è già registrata.') : msg);
    } finally { setBusy(false); }
  };

  const remove = async (c: CompanyRow) => {
    if (!window.confirm(t('Eliminare l’azienda "{name}"?', { name: c.legal_name }))) return;
    try { unwrap(await supabase.from('companies').delete().eq('id', c.id)); await companies.reload(); }
    catch (e) { setError(/foreign key/i.test(errorText(e)) ? t('Prima scollega i negozi da questa azienda.') : errorText(e)); }
  };

  const storesOf = (id: string) => (stores.data ?? []).filter((s) => s.company_id === id);
  const set = (patch: Draft) => setEdit({ ...edit, ...patch });

  return <>
    <PageHead title={t('Aziende')}
      subtitle={t('Dati legali mostrati nelle condizioni di vendita, nella privacy e negli ordini. Il gestore è chi pubblica l’app; il venditore di un ordine è l’azienda del negozio che lo prepara.')}
      actions={<button onClick={() => open()}>{t('+ Nuova azienda')}</button>} />
    {error && !edit && <Notice tone="error">{error}</Notice>}
    {companies.data && !companies.data.some((c) => c.is_operator) && <Notice tone="warn">{t('Indica quale azienda gestisce la piattaforma (gestore).')}</Notice>}
    {stores.data?.some((s) => s.active && !s.company_id) && <Notice tone="warn">{t('Alcuni negozi attivi non sono collegati a un’azienda: collegali in Negozi.')}</Notice>}
    {!companies.data ? <Loading /> : !companies.data.length ? <Empty>{t('Nessuna azienda. Aggiungi il gestore e le aziende dei negozi.')}</Empty>
      : <div className="table-wrap"><table>
        <thead><tr><th>{t('Azienda')}</th><th>{t('Ruolo')}</th><th>{t('Negozi')}</th><th>{t('Contatti')}</th><th></th></tr></thead>
        <tbody>{companies.data.map((c) => <tr key={c.id}>
          <td><strong>{c.legal_name}</strong><div className="small muted">{companyIdentity(c).slice(c.legal_name.length + 2)}</div></td>
          <td>{c.is_operator ? <span className="badge">{t('Gestore')}</span> : <span className="badge muted">{t('Venditore')}</span>}</td>
          <td>{storesOf(c.id).map((s) => s.name).join(', ') || '—'}</td>
          <td className="small">{[c.email, c.pec && `PEC ${c.pec}`].filter(Boolean).join(' · ') || <span className="badge warn">{t('Da completare')}</span>}</td>
          <td className="num"><button className="ghost" onClick={() => open(c)}>{t('Modifica')}</button>
            <button className="ghost danger" onClick={() => remove(c)}>{t('Elimina')}</button></td>
        </tr>)}</tbody>
      </table></div>}

    {edit && <Modal title={edit.id ? t('Modifica azienda') : t('Nuova azienda')} onClose={() => setEdit(null)} dirty>
      <div className="grid">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label={t('Ragione sociale')}><input value={edit.legal_name ?? ''} maxLength={200} onChange={(e) => set({ legal_name: e.target.value })} placeholder="… S.R.L." /></Field>
        <div className="form-grid">
          <Field label={t('Sede legale (via e numero)')}><input value={edit.address ?? ''} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field label={t('Città')}><input value={edit.city ?? ''} onChange={(e) => set({ city: e.target.value })} /></Field>
          <Field label={t('CAP')}><input value={edit.postal_code ?? ''} maxLength={5} onChange={(e) => set({ postal_code: e.target.value })} /></Field>
          <Field label={t('Provincia')}><input value={edit.province ?? ''} maxLength={2} onChange={(e) => set({ province: e.target.value.toUpperCase() })} /></Field>
          <Field label={t('Partita IVA')}><input value={edit.vat_number ?? ''} maxLength={13} inputMode="numeric" onChange={(e) => set({ vat_number: e.target.value })} /></Field>
          <Field label={t('Codice fiscale')} hint={t('Se uguale alla partita IVA puoi lasciarlo vuoto')}><input value={edit.tax_code ?? ''} maxLength={16} onChange={(e) => set({ tax_code: e.target.value })} /></Field>
          <Field label={t('Numero REA')}><input value={edit.rea ?? ''} onChange={(e) => set({ rea: e.target.value })} placeholder="LU-123456" /></Field>
          <Field label={t('Capitale sociale versato (€)')}><input value={edit.capital ?? ''} inputMode="decimal" onChange={(e) => set({ capital: e.target.value })} /></Field>
          <Field label="PEC"><input value={edit.pec ?? ''} type="email" onChange={(e) => set({ pec: e.target.value })} /></Field>
          <Field label={t('Email assistenza clienti')}><input value={edit.email ?? ''} type="email" onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label={t('Email privacy')} hint={t('Per le richieste sui dati personali; se vuota si usa l’email assistenza')}><input value={edit.privacy_email ?? ''} type="email" onChange={(e) => set({ privacy_email: e.target.value })} /></Field>
          <Field label={t('Telefono')}><input value={edit.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={edit.is_operator ?? false} onChange={(e) => set({ is_operator: e.target.checked })} />
          {' '}{t('Gestore della piattaforma (chi pubblica l’app e il sito)')}</label>
        <span className="small muted">{t('Copia i dati dalla visura camerale. Le modifiche valgono per i nuovi ordini; gli ordini già fatti conservano i dati del venditore di allora.')}</span>
        <button disabled={busy} onClick={save}>{busy ? t('Salvataggio…') : t('Salva')}</button>
      </div>
    </Modal>}
  </>;
}
