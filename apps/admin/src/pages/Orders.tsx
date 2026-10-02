import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FULFILMENT_LABELS, ORDER_STATUS_LABELS, formatEuro, type FulfilmentMethod, type OrderRow, type OrderStatus } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { useAsync, useDebounced, useStores } from '../lib/data';
import { downloadCsv, toCsv } from '../lib/csv';
import { useAuth } from '../lib/auth';
import { Empty, Loading, Notice, PageHead, Pager, PaymentBadge, StatusBadge, fmtDate } from '../components/ui';
import { t } from '../lib/i18n';

const PAGE = 50;

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const stores = useStores();
  const status = params.get('status') ?? '';
  const storeId = params.get('store') ?? '';
  const fulfilment = params.get('fulfilment') ?? '';
  // Every filter lives in the URL, so refresh, back and shared links keep the same view.
  const from = params.get('dal') ?? '';
  const to = params.get('al') ?? '';
  const page = Math.max(0, Number(params.get('pagina') ?? '1') - 1) || 0;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search.trim());
  const [exporting, setExporting] = useState(false);

  const set = (key: string, value: string, keepPage = false) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (!keepPage) next.delete('pagina');
    setParams(next, { replace: key === 'q' });
  };
  const setPage = (p: number) => set('pagina', p > 0 ? String(p + 1) : '', true);
  useEffect(() => { if ((params.get('q') ?? '') !== q) set('q', q); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <PageHead title={t('Ordini')} subtitle={orders.data ? t('{n} ordini', { n: orders.data.count }) : undefined}
      actions={<button className="secondary" onClick={exportCsv} disabled={exporting}>{exporting ? t('Esportazione…') : t('Esporta CSV')}</button>} />
    <div className="toolbar">
      <input type="search" placeholder={t('Numero, email, nome, telefono')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 260 }} aria-label={t('Cerca ordini')} />
      <select value={status} onChange={(e) => set('status', e.target.value)} aria-label={t('Stato')}>
        <option value="">{t('Tutti (esclusi non pagati)')}</option>
        {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => <option key={s} value={s}>{t(ORDER_STATUS_LABELS[s])}</option>)}
      </select>
      <select value={fulfilment} onChange={(e) => set('fulfilment', e.target.value)} aria-label={t('Consegna')}>
        <option value="">{t('Tutte le consegne')}</option>
        {(Object.keys(FULFILMENT_LABELS) as FulfilmentMethod[]).map((f) => <option key={f} value={f}>{t(FULFILMENT_LABELS[f])}</option>)}
      </select>
      {can('admin', 'manager') && <select value={storeId} onChange={(e) => set('store', e.target.value)} aria-label={t('Negozio')}>
        <option value="">{t('Tutti i negozi')}</option>{stores.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      <label className="inline-field">{t('Dal')} <input type="date" value={from} onChange={(e) => set('dal', e.target.value)} /></label>
      <label className="inline-field">{t('Al')} <input type="date" value={to} onChange={(e) => set('al', e.target.value)} /></label>
      {(status || storeId || fulfilment || from || to || q) && <button className="ghost" onClick={() => { setSearch(''); setParams(new URLSearchParams()); }}>{t('Azzera filtri')}</button>}
    </div>
    {orders.error && <Notice tone="error">{orders.error}</Notice>}
    {!orders.data ? <Loading /> : !orders.data.rows.length ? <Empty>{t('Nessun ordine con questi filtri.')}</Empty> : <div className="table-wrap"><table>
      <thead><tr><th>{t('Ordine')}</th><th>{t('Data')}</th><th>{t('Cliente')}</th><th>{t('Negozio')}</th><th>{t('Consegna')}</th><th>{t('Stato')}</th><th>{t('Pagamento')}</th><th className="num">{t('Totale')}</th></tr></thead>
      <tbody>{orders.data.rows.map((o) => <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
        <td><Link to={`/orders/${o.id}`} className="row-link" onClick={(e) => e.stopPropagation()}>{o.order_number}</Link></td><td>{fmtDate(o.created_at)}</td>
        <td>{o.customer_name}<div className="small muted">{o.customer_email}</div></td>
        <td>{storeName(o.store_id)}</td><td>{t(FULFILMENT_LABELS[o.fulfilment])}</td>
        <td><StatusBadge status={o.status} /></td><td><PaymentBadge status={o.payment_status} /></td>
        <td className="num">{formatEuro(o.total_cents)}</td></tr>)}</tbody></table></div>}
    {orders.data && <Pager page={page} hasMore={(page + 1) * PAGE < orders.data.count} onPage={setPage} />}
  </>;
}
