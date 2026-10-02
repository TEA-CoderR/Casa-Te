import { useState } from 'react';
import { formatEuro, formatShipping, parseEuroInput, quoteShipping, type FulfilmentMethod, type ShippingRateRow, type ShippingRule } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync } from '../lib/data';
import { t } from '../lib/i18n';
import { Field, Loading, Modal, Notice, PageHead } from '../components/ui';

const toRule = (r: ShippingRateRow): ShippingRule => ({ method: r.method, priority: r.priority, minSubtotalCents: r.min_subtotal_cents,
  maxSubtotalCents: r.max_subtotal_cents, minWeightG: r.min_weight_g, maxWeightG: r.max_weight_g, priceCents: r.price_cents, provisional: r.provisional });
const eur = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','));

type Edit = Partial<ShippingRateRow> & { price?: string; minSub?: string; maxSub?: string };

export function ShippingPage() {
  const rates = useAsync(async () => unwrap(await supabase.from('shipping_rates').select('*').order('priority').order('method')) as ShippingRateRow[], []);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState({ subtotal: '30,00', weight: '3000' });

  const active = (rates.data ?? []).filter((r) => r.active).map(toRule);
  const simSub = parseEuroInput(sim.subtotal) ?? 0;
  const simW = Number(sim.weight) || 0;

  const save = async () => {
    if (!edit) return;
    setError('');
    const price = parseEuroInput(edit.price ?? '');
    if (price === null) return setError(t('Prezzo non valido (usa 0 per gratuito).'));
    const row = {
      method: edit.method ?? 'home', priority: Number(edit.priority ?? 100), label: edit.label?.trim() || null,
      min_subtotal_cents: parseEuroInput(edit.minSub || '0') ?? 0, max_subtotal_cents: edit.maxSub ? parseEuroInput(edit.maxSub) : null,
      min_weight_g: Number(edit.min_weight_g ?? 0), max_weight_g: edit.max_weight_g ?? null, price_cents: price,
      provisional: edit.provisional ?? false, active: edit.active ?? true,
    };
    setBusy(true);
    try {
      if (edit.id) unwrap(await supabase.from('shipping_rates').update(row).eq('id', edit.id));
      else unwrap(await supabase.from('shipping_rates').insert(row));
      setEdit(null); await rates.reload();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return <>
    <PageHead title={t('Tariffe di spedizione')} subtitle={t('Regole valutate per priorità crescente: vince la prima che corrisponde. Il ritiro in negozio è sempre gratuito.')}
      actions={<button onClick={() => setEdit({ method: 'home', priority: 100, active: true, min_weight_g: 0 })}>{t('+ Nuova regola')}</button>} />
    <Notice tone="warn">{t('Modifiche con effetto immediato su app e sito. Le regole attuali sono quelle approvate (docs/PROJECT_CONTEXT.md §6); la fascia oltre 10 kg è provvisoria.')}</Notice>
    <div className="card" style={{ marginBottom: 14 }}>
      <strong>{t('Simulatore')}</strong>
      <div className="row" style={{ marginTop: 8 }}>
        <Field label={t('Valore prodotti (€)')}><input value={sim.subtotal} onChange={(e) => setSim({ ...sim, subtotal: e.target.value })} /></Field>
        <Field label={t('Peso (g)')}><input value={sim.weight} onChange={(e) => setSim({ ...sim, weight: e.target.value })} /></Field>
        {(['home', 'pickup', 'store'] as FulfilmentMethod[]).map((m) => {
          const q = quoteShipping(active, simSub, simW, m);
          return <div key={m} className="stat"><div className="label">{m === 'home' ? t('Domicilio') : m === 'pickup' ? t('Punto ritiro') : t('Negozio')}</div>
            <div className="value" style={{ fontSize: 20 }}>{q ? formatShipping(q.priceCents) : t('n.d.')}{q?.provisional ? ' *' : ''}</div></div>;
        })}
      </div>
    </div>
    {error && !edit && <Notice tone="error">{error}</Notice>}
    {!rates.data ? <Loading /> : <div className="table-wrap"><table>
      <thead><tr><th>{t('Priorità')}</th><th>{t('Metodo')}</th><th>{t('Valore prodotti')}</th><th>{t('Peso')}</th><th className="num">{t('Prezzo')}</th><th>{t('Etichetta')}</th><th>{t('Stato')}</th><th></th></tr></thead>
      <tbody>{rates.data.map((r) => <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
        <td>{r.priority}</td><td>{r.method === 'home' ? t('Domicilio') : t('Punto ritiro')}</td>
        <td>{formatEuro(r.min_subtotal_cents)} – {r.max_subtotal_cents === null ? '∞' : formatEuro(r.max_subtotal_cents)}</td>
        <td>{r.min_weight_g} – {r.max_weight_g ?? '∞'} g</td>
        <td className="num"><strong>{formatShipping(r.price_cents)}</strong></td>
        <td>{r.label}{r.provisional && <span className="badge warn" style={{ marginLeft: 6 }}>{t('Provvisoria')}</span>}</td>
        <td>{r.active ? <span className="badge">{t('Attiva')}</span> : <span className="badge muted">{t('Disattiva')}</span>}</td>
        <td className="num"><button className="ghost" onClick={() => setEdit({ ...r, price: eur(r.price_cents), minSub: eur(r.min_subtotal_cents), maxSub: eur(r.max_subtotal_cents) })}>{t('Modifica')}</button></td>
      </tr>)}</tbody></table></div>}
    {edit && <Modal title={edit.id ? t('Modifica regola') : t('Nuova regola')} onClose={() => setEdit(null)}>
      <div className="grid">
        {error && <Notice tone="error">{error}</Notice>}
        <div className="form-grid">
          <Field label={t('Metodo')}><select value={edit.method} onChange={(e) => setEdit({ ...edit, method: e.target.value as 'home' | 'pickup' })}>
            <option value="home">{t('Domicilio')}</option><option value="pickup">{t('Punto di ritiro')}</option></select></Field>
          <Field label={t('Priorità')}><input type="number" value={edit.priority ?? 100} onChange={(e) => setEdit({ ...edit, priority: Number(e.target.value) })} /></Field>
          <Field label={t('Valore da (€, incluso)')}><input value={edit.minSub ?? ''} onChange={(e) => setEdit({ ...edit, minSub: e.target.value })} /></Field>
          <Field label={t('Valore fino a (€, incluso)')} hint={t('Vuoto = nessun limite')}><input value={edit.maxSub ?? ''} onChange={(e) => setEdit({ ...edit, maxSub: e.target.value })} /></Field>
          <Field label={t('Peso da (g, incluso)')}><input type="number" min={0} value={edit.min_weight_g ?? 0} onChange={(e) => setEdit({ ...edit, min_weight_g: Number(e.target.value) })} /></Field>
          <Field label={t('Peso fino a (g, incluso)')} hint={t('Vuoto = nessun limite')}><input type="number" min={0} value={edit.max_weight_g ?? ''} onChange={(e) => setEdit({ ...edit, max_weight_g: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label={t('Prezzo (€)')}><input value={edit.price ?? ''} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
          <Field label={t('Etichetta')}><input value={edit.label ?? ''} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={edit.provisional ?? false} onChange={(e) => setEdit({ ...edit, provisional: e.target.checked })} /> {t('Tariffa provvisoria')}</label>
        <label className="check"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> {t('Attiva')}</label>
        <button disabled={busy} onClick={save}>{t('Salva')}</button>
      </div>
    </Modal>}
  </>;
}
