// Touch-friendly workflow for store staff: new paid orders → pick items → ready → handed over / shipped.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FULFILMENT_LABELS, formatWeight, productImageUrl, type OrderItemRow, type OrderRow } from '@casa-te/shared';
import { SUPABASE_URL, supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync, useStores } from '../lib/data';
import { useAuth } from '../lib/auth';
import { Loading, Notice, PageHead, StatusBadge, Success, fmtDate } from '../components/ui';
import { Icon } from '../components/Icon';
import { t } from '../lib/i18n';

type Item = OrderItemRow & { product: { product_images: Array<{ path: string; sort: number }> } | null };
type Row = OrderRow & { order_items: Item[] };

/** "da 25 min", "da 3 h", "da 2 giorni" plus an urgency level for the badge colour. */
function age(iso: string | null): { text: string; level: '' | 'warn' | 'bad' } {
  if (!iso) return { text: '', level: '' };
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  const days = Math.round(min / 1440);
  const text = min < 60 ? t('da {n} min', { n: min }) : min < 60 * 24 ? t('da {n} h', { n: Math.round(min / 60) })
    : days === 1 ? t('da {n} giorno', { n: days }) : t('da {n} giorni', { n: days });
  return { text, level: min >= 60 * 24 ? 'bad' : min >= 60 * 4 ? 'warn' : '' };
}
const thumb = (i: Item) => productImageUrl(SUPABASE_URL, [...(i.product?.product_images ?? [])].sort((a, b) => a.sort - b.sort)[0]?.path);

export function PickingPage() {
  const { staff, can } = useAuth();
  const stores = useStores();
  const [storeId, setStoreId] = useState<string>(staff?.store_id ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const queue = useAsync(async () => {
    let q = supabase.from('orders').select('*, order_items(*, product:products(product_images(path,sort)))').in('status', ['paid', 'picking', 'ready']).order('paid_at', { ascending: true });
    if (storeId) q = q.eq('store_id', storeId);
    return unwrap(await q.limit(200)) as Row[];
  }, [storeId]);

  // Refresh the queue every 30 seconds so new orders appear without reloading.
  useEffect(() => { const timer = setInterval(() => { void queue.reload(); }, 30_000); return () => clearInterval(timer); }, [queue.reload]);

  const orders = queue.data ?? [];
  const current = orders.find((o) => o.id === selected) ?? null;

  const act = async (fn: () => Promise<unknown>, success = '') => {
    setBusy(true); setError(''); setDone('');
    try { await fn(); await queue.reload(); setDone(success); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  // Store staff cannot refund; they flag the missing item and a manager handles the partial refund.
  const reportMissing = (o: Row, i: Item) => act(async () => unwrap(await supabase.rpc('staff_add_order_note', {
    p_order_id: o.id, p_note: `Prodotto mancante: ${i.quantity - i.picked_quantity} × ${i.name} (${i.sku}). Serve un rimborso parziale.`, p_visible: false,
  })), t("Segnalato: {name}. Un responsabile vedrà la nota nell'ordine {number}.", { name: i.name, number: o.order_number }));
  const setStatus = (o: Row, status: string) => act(async () => unwrap(await supabase.rpc('staff_set_order_status', { p_order_id: o.id, p_status: status })));
  const setPicked = (item: OrderItemRow, qty: number) => act(async () =>
    unwrap(await supabase.from('order_items').update({ picked_quantity: Math.max(0, Math.min(item.quantity, qty)) }).eq('id', item.id)));

  const column = (title: string, list: Row[], hint: string) => <section className="card pick-col" aria-label={title}>
    <h2 style={{ marginTop: 0 }}>{title} <span className="badge muted">{list.length}</span></h2>
    {!list.length ? <p className="small muted" style={{ margin: 0 }}>{hint}</p> : list.map((o) => {
      const a = age(o.paid_at);
      return <button key={o.id} className={`pick-order ${selected === o.id ? 'on' : ''}`} aria-pressed={selected === o.id} onClick={() => setSelected(o.id)}>
        <span style={{ minWidth: 0 }}><strong>{o.order_number}</strong><br />
          <span className="small muted">{o.customer_name} · {t(FULFILMENT_LABELS[o.fulfilment])} · {t('{n} pz', { n: o.order_items.reduce((n, i) => n + i.quantity, 0) })}</span></span>
        {a.text && <span className={`badge ${a.level || 'muted'}`}><Icon name="clock" size={12} /> {a.text}</span>}
      </button>;
    })}
  </section>;
  const toPick = orders.filter((o) => o.status === 'paid');
  const picking = orders.filter((o) => o.status === 'picking');
  const ready = orders.filter((o) => o.status === 'ready');

  return <>
    <PageHead title={t('Preparazione ordini')} subtitle={t('Aggiornamento automatico ogni 30 secondi')} actions={<>
      {can('admin', 'manager') && <select value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label={t('Negozio')}>
        <option value="">{t('Tutti i negozi')}</option>{stores.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      <button className="secondary" onClick={() => queue.reload()}>{t('Aggiorna')}</button>
    </>} />
    {error && <Notice tone="error">{error}</Notice>}
    {done && <Success onDismiss={() => setDone('')}>{done}</Success>}
    {!queue.data ? <Loading /> : !orders.length ? <div className="card all-clear">
      <span className="kpi-icon"><Icon name="check" size={22} /></span>
      <div><h2 style={{ margin: 0 }}>{t('Nessun ordine da preparare')}</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>{t('I nuovi ordini pagati compaiono qui da soli. Puoi lasciare questa pagina aperta.')}</p></div>
    </div> : <div className={`grid picking-grid ${current ? 'has-selection' : ''}`}>
      <div className="grid pick-lists">
        {column(t('Da preparare'), toPick, t('Nessun nuovo ordine.'))}
        {column(t('In preparazione'), picking, t('Nessun ordine in corso.'))}
        {column(t('Pronti'), ready, t('Nessun ordine in attesa di ritiro o spedizione.'))}
      </div>
      <section className="card pick-detail" aria-label={t('Ordine selezionato')}>
        {!current ? <p className="muted" style={{ margin: 0 }}>{t('Scegli un ordine dalla lista: il più vecchio è in cima.')}</p> : <>
          <button className="ghost pick-back" onClick={() => setSelected(null)}><Icon name="back" size={16} /> {t('Tutti gli ordini')}</button>
          <div className="row"><h2 style={{ margin: 0 }}>{current.order_number}</h2><StatusBadge status={current.status} />
            {age(current.paid_at).text && <span className={`badge ${age(current.paid_at).level || 'muted'}`}>{t('pagato {age}', { age: age(current.paid_at).text })}</span>}
            <span className="spacer" /><Link to={`/orders/${current.id}`}>{t('Dettaglio completo')}</Link></div>
          <p className="muted">{current.customer_name} · {current.customer_phone} · {t(FULFILMENT_LABELS[current.fulfilment])} · {formatWeight(current.total_weight_g)} · {fmtDate(current.paid_at)}</p>
          {current.notes && <Notice tone="warn">{t('Note del cliente: {notes}', { notes: current.notes })}</Notice>}
          <div className="pick-list">
            {current.order_items.map((i) => {
              const complete = i.picked_quantity >= i.quantity;
              const img = thumb(i);
              return <div key={i.id} className={`pick-item ${complete ? 'done' : ''}`}>
                <input type="checkbox" checked={complete} disabled={current.status !== 'picking' || busy} aria-label={t('{name}: preparato', { name: i.name })}
                  onChange={(e) => setPicked(i, e.target.checked ? i.quantity : 0)} />
                {img ? <img className="pick-thumb" src={img} alt="" /> : <span className="pick-thumb" aria-hidden="true"><Icon name="bag" size={20} /></span>}
                <div style={{ flex: 1, minWidth: 0 }}><span className="pick-qty">{i.quantity}×</span> {i.name}<div className="small muted">{i.sku}</div></div>
                {current.status === 'picking' && i.quantity > 1 && <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="secondary" disabled={busy || i.picked_quantity <= 0} onClick={() => setPicked(i, i.picked_quantity - 1)} aria-label={t('Un pezzo in meno di {name}', { name: i.name })}>−</button>
                  <span aria-live="polite">{i.picked_quantity}/{i.quantity}</span>
                  <button className="secondary" disabled={busy || complete} onClick={() => setPicked(i, i.picked_quantity + 1)} aria-label={t('Un pezzo in più di {name}', { name: i.name })}>+</button></div>}
                {current.status === 'picking' && !complete && <button className="ghost" disabled={busy} onClick={() => reportMissing(current, i)}>{t('Segnala mancante')}</button>}
              </div>;
            })}
          </div>
          <div className="row">
            {current.status === 'paid' && <button className="big" disabled={busy} onClick={() => setStatus(current, 'picking')}>{t('Inizia preparazione')}</button>}
            {current.status === 'picking' && <button className="big" disabled={busy || current.order_items.some((i) => i.picked_quantity < i.quantity)}
              onClick={() => setStatus(current, 'ready')}>{t('Tutto pronto')}</button>}
            {current.status === 'ready' && current.fulfilment === 'store' && <button className="big" disabled={busy} onClick={() => setStatus(current, 'completed')}>{t('Consegnato al cliente')}</button>}
            {current.status === 'ready' && current.fulfilment !== 'store' && <Link className="btn big" to={`/orders/${current.id}`}>{t('Registra spedizione')}</Link>}
            <button className="secondary" onClick={() => window.print()}>{t('Stampa distinta')}</button>
          </div>
          {current.status === 'picking' && current.order_items.some((i) => i.picked_quantity < i.quantity) &&
            <p className="small muted">{t('Spunta ogni prodotto per completare. Se un prodotto manca, usa "Segnala mancante": un responsabile farà il rimborso parziale.')}</p>}
        </>}
      </section>
    </div>}
  </>;
}
