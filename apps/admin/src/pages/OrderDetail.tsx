import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  FULFILMENT_LABELS, allowedNextStatuses, formatEuro, formatWeight, orderStatusLabel, parseEuroInput,
  type OrderEventRow, type OrderItemRow, type OrderRow, type OrderStatus, type RefundRow,
} from '@casa-te/shared';
import { invoke, supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync, useStores } from '../lib/data';
import { useAuth } from '../lib/auth';
import { Field, Loading, Modal, Notice, PageHead, PaymentBadge, StatusBadge, Success, fmtDate } from '../components/ui';
import { Icon } from '../components/Icon';

type Detail = OrderRow & { order_items: OrderItemRow[]; order_events: OrderEventRow[]; refunds: RefundRow[] };

const ACTION_LABEL: Record<OrderStatus, string> = {
  pending_payment: '', paid: '', picking: 'Inizia preparazione', ready: 'Segna come pronto', shipped: 'Segna come spedito',
  completed: 'Segna come completato', cancelled: 'Annulla e rimborsa',
};

export function OrderDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const stores = useStores();
  const order = useAsync(async () => unwrap(await supabase.from('orders')
    .select('*, order_items(*), order_events(*), refunds(*)').eq('id', id!)
    .order('created_at', { referencedTable: 'order_events' }).single()) as Detail, [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [modal, setModal] = useState<null | 'ship' | 'refund' | 'cancel' | 'note'>(null);
  const [form, setForm] = useState({ carrier: '', tracking: '', trackingUrl: '', amount: '', reason: '', note: '', visible: false });

  const o = order.data;
  if (order.error) return <Notice tone="error">{order.error}</Notice>;
  if (!o) return <Loading />;
  const store = stores.data?.find((s) => s.id === o.store_id);
  const manager = can('admin', 'manager');
  const next = allowedNextStatuses(o.status, o.fulfilment);
  const remaining = o.total_cents - o.refunded_cents;

  const run = async (fn: () => Promise<unknown>, success = '') => {
    setBusy(true); setError(''); setDone('');
    try { await fn(); setModal(null); await order.reload(); setDone(success); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const refundCents = modal === 'refund' ? parseEuroInput(form.amount) : remaining;
  const refundInvalid = modal === 'refund' && (!refundCents || refundCents <= 0 || refundCents > remaining);
  const lastRefund = [...(o.refunds ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  // Quick picks: one unit of each line (what a "missing item" refund usually is) and the remaining amount.
  const picks = [
    ...o.order_items.filter((i) => i.unit_price_cents <= remaining).slice(0, 4)
      .map((i) => ({ label: `1 × ${i.name}`, cents: i.unit_price_cents })),
    { label: 'Intero importo residuo', cents: remaining },
  ];
  const setStatus = (status: OrderStatus, extra: Record<string, string | null> = {}) => run(async () => unwrap(await supabase.rpc('staff_set_order_status', {
    p_order_id: o.id, p_status: status, p_note: null, p_carrier: null, p_tracking_number: null, p_tracking_url: null, ...extra,
  })));

  return <>
    <PageHead title={`Ordine ${o.order_number}`} subtitle={`${fmtDate(o.created_at)} · ${store?.name ?? ''}`} actions={<>
      <Link to="/orders" className="btn secondary no-print"><Icon name="back" size={16} /> Ordini</Link>
      <button className="secondary no-print" onClick={() => window.print()}>Stampa distinta</button>
    </>} />
    <div className="row" style={{ marginBottom: 16 }}>
      <StatusBadge status={o.status} /><PaymentBadge status={o.payment_status} />
      <span className="badge muted">{FULFILMENT_LABELS[o.fulfilment]}</span>
      {o.shipping_provisional && <span className="badge warn">Tariffa oltre 10 kg (provvisoria)</span>}
      {o.invoice_requested && <span className="badge warn">Fattura richiesta</span>}
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {done && <Success onDismiss={() => setDone('')}>{done}</Success>}
    {o.status === 'cancelled' && o.payment_status === 'paid' && <Notice tone="warn">Pagamento ricevuto su ordine annullato: verificare il rimborso automatico su Stripe.</Notice>}

    <div className="row no-print" style={{ marginBottom: 18 }}>
      {next.filter((s) => s !== 'cancelled').map((s) => <button key={s} disabled={busy}
        onClick={() => s === 'shipped' ? setModal('ship') : setStatus(s)}>
        {s === 'completed' && o.fulfilment === 'store' ? 'Consegnato al cliente (ritirato)' : ACTION_LABEL[s]}</button>)}
      {manager && remaining > 0 && o.payment_status !== 'unpaid' && <button className="secondary" disabled={busy}
        onClick={() => { setForm({ ...form, amount: '', reason: '' }); setModal('refund'); }}>Rimborso parziale</button>}
      <button className="secondary" disabled={busy} onClick={() => { setForm({ ...form, note: '', visible: false }); setModal('note'); }}>Aggiungi nota</button>
      {manager && next.includes('cancelled') && <><span className="spacer" />
        <button className="danger-outline" disabled={busy} onClick={() => { setForm({ ...form, reason: '' }); setModal('cancel'); }}>Annulla ordine…</button></>}
    </div>

    <div className="grid two">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Prodotti</h2>
        <table><thead><tr><th>Prodotto</th><th className="num">Q.tà</th><th className="num">Preparati</th><th className="num">Prezzo</th><th className="num">Totale</th></tr></thead>
          <tbody>{o.order_items.map((i) => <tr key={i.id}><td>{i.name}<div className="small muted">{i.sku} · {formatWeight(i.weight_g)} · IVA {i.vat_rate}%</div></td>
            <td className="num"><strong>{i.quantity}</strong></td><td className="num">{i.picked_quantity}</td>
            <td className="num">{formatEuro(i.unit_price_cents)}</td><td className="num">{formatEuro(i.line_total_cents)}</td></tr>)}</tbody></table>
        <table style={{ marginTop: 12 }}><tbody>
          <tr><td>Prodotti</td><td className="num">{formatEuro(o.subtotal_cents)}</td></tr>
          {o.discount_cents > 0 && <tr><td>Sconto {o.coupon_code}</td><td className="num">-{formatEuro(o.discount_cents)}</td></tr>}
          <tr><td>Spedizione</td><td className="num">{formatEuro(o.shipping_cents)}</td></tr>
          <tr><td><strong>Totale</strong> · {formatWeight(o.total_weight_g)}</td><td className="num"><strong>{formatEuro(o.total_cents)}</strong></td></tr>
          {o.refunded_cents > 0 && <tr><td>Rimborsato</td><td className="num danger">-{formatEuro(o.refunded_cents)}</td></tr>}
        </tbody></table>
      </div>

      <div className="grid" style={{ alignContent: 'start' }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Cliente</h2>
          <div><strong>{o.customer_name}</strong></div>
          <div><a href={`mailto:${o.customer_email}`}>{o.customer_email}</a></div>
          <div><a href={`tel:${o.customer_phone}`}>{o.customer_phone}</a></div>
          {o.notes && <Notice tone="warn">Note del cliente: {o.notes}</Notice>}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{FULFILMENT_LABELS[o.fulfilment]}</h2>
          {o.shipping_address && <address style={{ fontStyle: 'normal', lineHeight: 1.6 }}>
            {o.shipping_address.full_name}<br />{o.shipping_address.line1}{o.shipping_address.line2 ? `, ${o.shipping_address.line2}` : ''}<br />
            {o.shipping_address.postal_code} {o.shipping_address.city} ({o.shipping_address.province})<br />Tel. {o.shipping_address.phone}</address>}
          {o.pickup_point_snapshot && <div>{o.pickup_point_snapshot.name}<br />{o.pickup_point_snapshot.address}, {o.pickup_point_snapshot.postal_code} {o.pickup_point_snapshot.city}
            {o.pickup_point_snapshot.carrier && <div className="muted small">Rete: {o.pickup_point_snapshot.carrier}</div>}</div>}
          {o.fulfilment === 'store' && <div>Ritiro presso <strong>{store?.name}</strong> a nome di {o.customer_name}</div>}
          {o.tracking_number && <p>Spedizione: {o.carrier} · {o.tracking_url ? <a href={o.tracking_url} target="_blank" rel="noreferrer">{o.tracking_number}</a> : o.tracking_number}</p>}
        </div>
        {o.invoice_requested && o.invoice_details && <div className="card">
          <h2 style={{ marginTop: 0 }}>Dati fattura</h2>
          {o.invoice_details.company_name && <div>{o.invoice_details.company_name}</div>}
          {o.invoice_details.vat_number && <div>P.IVA {o.invoice_details.vat_number}</div>}
          {o.invoice_details.tax_code && <div>C.F. {o.invoice_details.tax_code}</div>}
          {o.invoice_details.sdi_code && <div>SDI {o.invoice_details.sdi_code}</div>}
          {o.invoice_details.pec && <div>PEC {o.invoice_details.pec}</div>}
        </div>}
        <div className="card no-print">
          <h2 style={{ marginTop: 0 }}>Cronologia</h2>
          <ul className="timeline">{o.order_events.map((e) => <li key={e.id} className={e.visible_to_customer ? '' : 'internal'}>
            <strong>{e.status ? orderStatusLabel(e.status, o.fulfilment) : e.kind === 'note' ? 'Nota' : e.kind === 'refund' ? 'Rimborso' : 'Evento'}</strong>
            {e.note && <span> — {e.note}</span>}
            <div className="small muted">{fmtDate(e.created_at)}{!e.visible_to_customer && ' · interno'}</div></li>)}</ul>
          {o.stripe_payment_intent_id && <p className="small muted">Pagamento Stripe: <code>{o.stripe_payment_intent_id}</code></p>}
          {lastRefund?.stripe_refund_id && <p className="small muted">Ultimo rimborso: {formatEuro(lastRefund.amount_cents)} · <code>{lastRefund.stripe_refund_id}</code></p>}
        </div>
      </div>
    </div>

    {modal === 'ship' && <Modal title="Spedizione" onClose={() => setModal(null)}>
      <div className="grid">
        <Field label="Corriere"><input value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} placeholder="es. BRT, GLS, Poste" /></Field>
        <Field label="Codice di tracciamento"><input value={form.tracking} onChange={(e) => setForm({ ...form, tracking: e.target.value })} /></Field>
        <Field label="Link tracciamento (https://)"><input value={form.trackingUrl} onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })} /></Field>
        <button disabled={busy} onClick={() => setStatus('shipped', { p_carrier: form.carrier, p_tracking_number: form.tracking, p_tracking_url: form.trackingUrl || null })}>Conferma spedizione</button>
      </div>
    </Modal>}

    {(modal === 'refund' || modal === 'cancel') && <Modal title={modal === 'cancel' ? `Annulla l'ordine ${o.order_number}` : 'Rimborso parziale'}
      onClose={() => setModal(null)} dirty={busy || !!form.reason || (modal === 'refund' && !!form.amount)}>
      <form className="grid" onSubmit={(e) => { e.preventDefault();
        if (refundInvalid) return;
        void run(async () => {
          await invoke('admin-refund', { order_id: o.id, amount_cents: modal === 'refund' ? refundCents : undefined, reason: form.reason || undefined, cancel: modal === 'cancel' });
        }, modal === 'cancel'
          ? `Ordine annullato${remaining > 0 ? ` e ${formatEuro(remaining)} rimborsati` : ''}. I prodotti sono tornati in magazzino.`
          : `Rimborso di ${formatEuro(refundCents ?? 0)} emesso. Il cliente lo vedrà in 5–10 giorni lavorativi.`); }}>
        {modal === 'cancel' ? <p style={{ margin: 0 }}>L'ordine verrà annullato{remaining > 0 ? <>, <strong>{formatEuro(remaining)}</strong> tornano a {o.customer_name ?? 'il cliente'}</> : ''} e i prodotti tornano disponibili in magazzino.</p>
          : <>
            <Field label={`Importo da rimborsare (residuo ${formatEuro(remaining)})`} hint={form.amount && refundInvalid ? `Inserisci un importo tra €0,01 e ${formatEuro(remaining)}.` : undefined}>
              <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" placeholder="0,00"
                aria-invalid={!!form.amount && refundInvalid} required /></Field>
            <div className="row" role="group" aria-label="Importi rapidi">{picks.map((p) =>
              <button type="button" key={p.label} className="chip" onClick={() => setForm({ ...form, amount: (p.cents / 100).toFixed(2).replace('.', ',') })}>
                {p.label} · {formatEuro(p.cents)}</button>)}</div>
          </>}
        <Field label="Motivo (visibile al cliente)"><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="es. prodotto mancante" /></Field>
        <Notice tone="warn"><Icon name="alert" size={16} /> Il rimborso viene inviato subito tramite Stripe e non si può annullare.</Notice>
        <div className="row">
          <button type="button" className="secondary" onClick={() => setModal(null)} disabled={busy}>Torna all'ordine</button>
          <span className="spacer" />
          <button type="submit" className="danger" disabled={busy || refundInvalid}>
            {busy ? 'Invio a Stripe…' : modal === 'cancel'
              ? (remaining > 0 ? `Annulla e rimborsa ${formatEuro(remaining)}` : 'Annulla ordine')
              : refundInvalid ? 'Rimborsa' : `Rimborsa ${formatEuro(refundCents ?? 0)}${o.customer_name ? ` a ${o.customer_name}` : ''}`}</button>
        </div>
      </form>
    </Modal>}

    {modal === 'note' && <Modal title="Aggiungi nota" onClose={() => setModal(null)}>
      <div className="grid">
        <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} aria-label="Nota" />
        <label className="check"><input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} /> Visibile al cliente</label>
        <button disabled={busy || !form.note.trim()} onClick={() => run(async () => unwrap(await supabase.rpc('staff_add_order_note', { p_order_id: o.id, p_note: form.note, p_visible: form.visible })))}>Salva nota</button>
      </div>
    </Modal>}
  </>;
}
