import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FULFILMENT_LABELS, ORDER_STATUS_LABELS, formatEuro, type FulfilmentMethod, type OrderRow, type OrderStatus } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { useAsync, useDebounced, useStores } from '../lib/data';
import { downloadCsv, toCsv } from '../lib/csv';
import { useAuth } from '../lib/auth';
import { Empty, Loading, Notice, PageHead, Pager, PaymentBadge, StatusBadge, fmtDate } from '../components/ui';

const PAGE = 50;

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const stores = useStores();
  const status = params.get('status') ?? '';
  const storeId = params.get('store') ?? '';
  const fulfilment = params.get('fulfilment') ?? '';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search.trim());
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const set = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next); setPage(0); };

  const buildQuery = () => {
    let query = supabase.from('orders').select('*', { count: 'exact' });
    if (status) query = query.eq('status', status);
    else query = query.neq('status', 'pending_payment');
    if (storeId) query = query.eq('store_id', storeId);
    if (fulfilment) query = query.eq('fulfilment', fulfilment);
    if (from) query = query.gte('created_at', new Date(from).toISOString());
    if (to) query = query.lt('created_at', new Date(new Date(to).getTime() + 86_400_000).toISOString());
    if (q) {
      const safe = q.replace(/[%,()]/g, ' ');
      query = query.or(`order_number.ilike.%${safe}%,customer_email.ilike.%${safe}%,customer_name.ilike.%${safe}%,customer_phone.ilike.%${safe}%`);
    }
    return query.order('created_at', { ascending: false });
  };

  const orders = useAsync(async () => {
    const res = await buildQuery().range(page * PAGE, page * PAGE + PAGE - 1);
    return { rows: unwrap(res) as OrderRow[], count: res.count ?? 0 };
  }, [status, storeId, fulfilment, q, page, from, to]);

  const storeName = (id: string) => stores.data?.find((s) => s.id === id)?.code ?? '';

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: OrderRow[] = [];
      for (let p = 0; p < 50; p++) {
        const rows = unwrap(await buildQuery().range(p * 1000, p * 1000 + 999)) as OrderRow[];
        all.push(...rows);
        if (rows.length < 1000) break;
      }
      const eur = (c: number) => (c / 100).toFixed(2).replace('.', ',');
      downloadCsv(`ordini-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(all.map((o) => ({
        numero: o.order_number, data: o.created_at, pagato_il: o.paid_at ?? '', stato: ORDER_STATUS_LABELS[o.status], pagamento: o.payment_status,
        negozio: storeName(o.store_id), consegna: FULFILMENT_LABELS[o.fulfilment], cliente: o.customer_name, email: o.customer_email, telefono: o.customer_phone,
        prodotti: eur(o.subtotal_cents), sconto: eur(o.discount_cents), spedizione: eur(o.shipping_cents), totale: eur(o.total_cents),
        rimborsato: eur(o.refunded_cents), coupon: o.coupon_code ?? '', fattura: o.invoice_requested ? 'si' : 'no',
        codice_fiscale: o.invoice_details?.tax_code ?? '', partita_iva: o.invoice_details?.vat_number ?? '', ragione_sociale: o.invoice_details?.company_name ?? '',
        sdi: o.invoice_details?.sdi_code ?? '', pec: o.invoice_details?.pec ?? '', stripe_payment_intent: o.stripe_payment_intent_id ?? '',
      })), ['numero', 'data', 'pagato_il', 'stato', 'pagamento', 'negozio', 'consegna', 'cliente', 'email', 'telefono', 'prodotti', 'sconto', 'spedizione',
        'totale', 'rimborsato', 'coupon', 'fattura', 'codice_fiscale', 'partita_iva', 'ragione_sociale', 'sdi', 'pec', 'stripe_payment_intent']));
    } finally { setExporting(false); }
  };

  return <>
    <PageHead title="Ordini" subtitle={orders.data ? `${orders.data.count} ordini` : undefined}
      actions={<button className="secondary" onClick={exportCsv} disabled={exporting}>{exporting ? 'Esportazione…' : 'Esporta CSV'}</button>} />
    <div className="toolbar">
      <input placeholder="Numero, email, nome, telefono" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} style={{ minWidth: 260 }} aria-label="Cerca" />
      <select value={status} onChange={(e) => set('status', e.target.value)} aria-label="Stato">
        <option value="">Tutti (esclusi non pagati)</option>
        {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
      </select>
      <select value={fulfilment} onChange={(e) => set('fulfilment', e.target.value)} aria-label="Consegna">
        <option value="">Tutte le consegne</option>
        {(Object.keys(FULFILMENT_LABELS) as FulfilmentMethod[]).map((f) => <option key={f} value={f}>{FULFILMENT_LABELS[f]}</option>)}
      </select>
      {can('admin', 'manager') && <select value={storeId} onChange={(e) => set('store', e.target.value)} aria-label="Negozio">
        <option value="">Tutti i negozi</option>{stores.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} aria-label="Dal" />
      <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} aria-label="Al" />
    </div>
    {orders.error && <Notice tone="error">{orders.error}</Notice>}
    {!orders.data ? <Loading /> : !orders.data.rows.length ? <Empty>Nessun ordine.</Empty> : <div className="table-wrap"><table>
      <thead><tr><th>Ordine</th><th>Data</th><th>Cliente</th><th>Negozio</th><th>Consegna</th><th>Stato</th><th>Pagamento</th><th className="num">Totale</th></tr></thead>
      <tbody>{orders.data.rows.map((o) => <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
        <td><strong>{o.order_number}</strong></td><td>{fmtDate(o.created_at)}</td>
        <td>{o.customer_name}<div className="small muted">{o.customer_email}</div></td>
        <td>{storeName(o.store_id)}</td><td>{FULFILMENT_LABELS[o.fulfilment]}</td>
        <td><StatusBadge status={o.status} /></td><td><PaymentBadge status={o.payment_status} /></td>
        <td className="num">{formatEuro(o.total_cents)}</td></tr>)}</tbody></table></div>}
    {orders.data && <Pager page={page} hasMore={(page + 1) * PAGE < orders.data.count} onPage={setPage} />}
  </>;
}
