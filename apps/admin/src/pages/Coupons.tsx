import { useState } from 'react';
import { formatEuro, parseEuroInput, type CouponKind, type CouponRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync } from '../lib/data';
import { Field, Loading, Modal, Notice, PageHead, fmtDate } from '../components/ui';

type Edit = Partial<CouponRow> & { valueInput?: string; minInput?: string; startsInput?: string; endsInput?: string };
const KIND: Record<CouponKind, string> = { percent: 'Percentuale', fixed: 'Importo fisso', free_shipping: 'Spedizione gratuita' };
const toLocal = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

export function CouponsPage() {
  const coupons = useAsync(async () => unwrap(await supabase.from('coupons').select('*').order('created_at', { ascending: false })) as CouponRow[], []);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const describe = (c: CouponRow) => c.kind === 'percent' ? `-${c.value}%` : c.kind === 'fixed' ? `-${formatEuro(c.value)}` : 'Spedizione gratis';

  const save = async () => {
    if (!edit) return;
    setError('');
    const kind = (edit.kind ?? 'percent') as CouponKind;
    let value = 0;
    if (kind === 'percent') value = Number(edit.valueInput);
    if (kind === 'fixed') value = parseEuroInput(edit.valueInput ?? '') ?? 0;
    if (kind === 'percent' && !(value >= 1 && value <= 100)) return setError('Percentuale tra 1 e 100.');
    if (kind === 'fixed' && value <= 0) return setError('Importo non valido.');
    const row = {
      code: (edit.code ?? '').trim().toUpperCase(), description: edit.description?.trim() || null, kind, value,
      min_subtotal_cents: edit.minInput ? parseEuroInput(edit.minInput) ?? 0 : 0,
      starts_at: edit.startsInput ? new Date(edit.startsInput).toISOString() : null,
      ends_at: edit.endsInput ? new Date(edit.endsInput).toISOString() : null,
      max_redemptions: edit.max_redemptions || null, per_customer_limit: edit.per_customer_limit || null, active: edit.active ?? true,
      club_only: edit.club_only ?? false,
    };
    if (!/^[A-Z0-9_-]{3,32}$/.test(row.code)) return setError('Codice: 3–32 caratteri tra lettere, numeri, - e _.');
    setBusy(true);
    try {
      if (edit.id) unwrap(await supabase.from('coupons').update(row).eq('id', edit.id));
      else unwrap(await supabase.from('coupons').insert(row));
      setEdit(null); await coupons.reload();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const open = (c?: CouponRow) => setEdit(c ? { ...c, valueInput: c.kind === 'fixed' ? (c.value / 100).toFixed(2).replace('.', ',') : String(c.value),
    minInput: c.min_subtotal_cents ? (c.min_subtotal_cents / 100).toFixed(2).replace('.', ',') : '', startsInput: toLocal(c.starts_at), endsInput: toLocal(c.ends_at) }
    : { kind: 'percent', active: true, per_customer_limit: 1 });

  return <>
    <PageHead title="Codici sconto" subtitle="Lo sconto si applica ai prodotti; le fasce di spedizione usano l'importo scontato."
      actions={<button onClick={() => open()}>+ Nuovo codice</button>} />
    {error && !edit && <Notice tone="error">{error}</Notice>}
    {!coupons.data ? <Loading /> : <div className="table-wrap"><table>
      <thead><tr><th>Codice</th><th>Sconto</th><th>Minimo</th><th>Validità</th><th className="num">Utilizzi</th><th>Stato</th><th></th></tr></thead>
      <tbody>{coupons.data.map((c) => <tr key={c.id}><td><strong>{c.code}</strong>{c.club_only && <span className="badge" style={{ marginLeft: 6 }}>Solo Club</span>}<div className="small muted">{c.description}</div></td>
        <td>{describe(c)}</td><td>{c.min_subtotal_cents ? formatEuro(c.min_subtotal_cents) : '—'}</td>
        <td className="small">{c.starts_at ? fmtDate(c.starts_at) : 'subito'} → {c.ends_at ? fmtDate(c.ends_at) : 'senza scadenza'}</td>
        <td className="num">{c.redemptions}{c.max_redemptions ? ` / ${c.max_redemptions}` : ''}</td>
        <td>{c.active ? <span className="badge">Attivo</span> : <span className="badge muted">Disattivo</span>}</td>
        <td className="num"><button className="ghost" onClick={() => open(c)}>Modifica</button></td></tr>)}</tbody></table></div>}
    {edit && <Modal title={edit.id ? 'Modifica codice' : 'Nuovo codice sconto'} onClose={() => setEdit(null)}>
      <div className="grid">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Codice"><input value={edit.code ?? ''} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} autoFocus /></Field>
        <Field label="Descrizione" hint={edit.club_only ? 'Visibile ai membri del Club nella pagina delle offerte' : undefined}><input value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
        <Field label="Tipo"><select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as CouponKind })}>
          {(Object.keys(KIND) as CouponKind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select></Field>
        {edit.kind !== 'free_shipping' && <Field label={edit.kind === 'percent' ? 'Percentuale (%)' : 'Importo (€)'}>
          <input value={edit.valueInput ?? ''} onChange={(e) => setEdit({ ...edit, valueInput: e.target.value })} inputMode="decimal" /></Field>}
        <Field label="Spesa minima prodotti (€)"><input value={edit.minInput ?? ''} onChange={(e) => setEdit({ ...edit, minInput: e.target.value })} inputMode="decimal" /></Field>
        <div className="form-grid">
          <Field label="Valido dal"><input type="datetime-local" value={edit.startsInput ?? ''} onChange={(e) => setEdit({ ...edit, startsInput: e.target.value })} /></Field>
          <Field label="Valido fino al"><input type="datetime-local" value={edit.endsInput ?? ''} onChange={(e) => setEdit({ ...edit, endsInput: e.target.value })} /></Field>
          <Field label="Utilizzi massimi totali"><input type="number" min={1} value={edit.max_redemptions ?? ''} onChange={(e) => setEdit({ ...edit, max_redemptions: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="Utilizzi per cliente"><input type="number" min={1} value={edit.per_customer_limit ?? ''} onChange={(e) => setEdit({ ...edit, per_customer_limit: e.target.value ? Number(e.target.value) : null })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={edit.club_only ?? false} onChange={(e) => setEdit({ ...edit, club_only: e.target.checked })} /> Solo per i membri del Casa & Te Club (mostrato nella pagina Club dell'app)</label>
        <label className="check"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Attivo</label>
        <button disabled={busy} onClick={save}>Salva</button>
      </div>
    </Modal>}
  </>;
}
