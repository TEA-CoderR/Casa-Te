// Touch-friendly workflow for store staff: new paid orders → pick items → ready → handed over / shipped.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FULFILMENT_LABELS, formatWeight, type OrderItemRow, type OrderRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync, useStores } from '../lib/data';
import { useAuth } from '../lib/auth';
import { Empty, Loading, Notice, PageHead, StatusBadge, fmtDate } from '../components/ui';

type Row = OrderRow & { order_items: OrderItemRow[] };

export function PickingPage() {
  const { staff, can } = useAuth();
  const stores = useStores();
  const [storeId, setStoreId] = useState<string>(staff?.store_id ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const queue = useAsync(async () => {
    let q = supabase.from('orders').select('*, order_items(*)').in('status', ['paid', 'picking', 'ready']).order('paid_at', { ascending: true });
    if (storeId) q = q.eq('store_id', storeId);
    return unwrap(await q.limit(200)) as Row[];
  }, [storeId]);

  // Refresh the queue every 30 seconds so new orders appear without reloading.
  useEffect(() => { const t = setInterval(() => { void queue.reload(); }, 30_000); return () => clearInterval(t); }, [queue.reload]);

  const orders = queue.data ?? [];
  const current = orders.find((o) => o.id === selected) ?? null;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await queue.reload(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const setStatus = (o: Row, status: string) => act(async () => unwrap(await supabase.rpc('staff_set_order_status', { p_order_id: o.id, p_status: status })));
  const setPicked = (item: OrderItemRow, qty: number) => act(async () =>
    unwrap(await supabase.from('order_items').update({ picked_quantity: Math.max(0, Math.min(item.quantity, qty)) }).eq('id', item.id)));

  const column = (title: string, list: Row[]) => <div className="card">
    <h2 style={{ marginTop: 0 }}>{title} <span className="badge muted">{list.length}</span></h2>
    {!list.length ? <Empty>Nessun ordine.</Empty> : list.map((o) => <button key={o.id} className="secondary"
      style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8, textAlign: 'left', borderColor: selected === o.id ? 'var(--green)' : 'var(--line)', color: 'var(--text)' }}
      onClick={() => setSelected(o.id)}>
      <span><strong>{o.order_number}</strong><br /><span className="small muted">{o.customer_name} · {FULFILMENT_LABELS[o.fulfilment]}</span></span>
      <span className="small muted">{fmtDate(o.paid_at)}</span>
    </button>)}
  </div>;

  return <>
    <PageHead title="Preparazione ordini" subtitle="Aggiornamento automatico ogni 30 secondi" actions={<>
      {can('admin', 'manager') && <select value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Negozio">
        <option value="">Tutti i negozi</option>{stores.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      <button className="secondary" onClick={() => queue.reload()}>Aggiorna</button>
    </>} />
    {error && <Notice tone="error">{error}</Notice>}
    {!queue.data ? <Loading /> : <div className="grid picking-grid">
      <div className="grid">
        {column('Da preparare', orders.filter((o) => o.status === 'paid'))}
        {column('In preparazione', orders.filter((o) => o.status === 'picking'))}
        {column('Pronti', orders.filter((o) => o.status === 'ready'))}
      </div>
      <div className="card">
        {!current ? <Empty>Seleziona un ordine dalla lista.</Empty> : <>
          <div className="row"><h2 style={{ margin: 0 }}>{current.order_number}</h2><StatusBadge status={current.status} /><span className="spacer" />
            <Link to={`/orders/${current.id}`}>Dettaglio completo</Link></div>
          <p className="muted">{current.customer_name} · {current.customer_phone} · {FULFILMENT_LABELS[current.fulfilment]} · {formatWeight(current.total_weight_g)}</p>
          {current.notes && <Notice tone="warn">Note: {current.notes}</Notice>}
          <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', margin: '12px 0' }}>
            {current.order_items.map((i) => {
              const done = i.picked_quantity >= i.quantity;
              return <div key={i.id} className={`pick-item ${done ? 'done' : ''}`}>
                <input type="checkbox" checked={done} disabled={current.status !== 'picking' || busy} aria-label={`Preparato ${i.name}`}
                  onChange={(e) => setPicked(i, e.target.checked ? i.quantity : 0)} />
                <div style={{ flex: 1 }}><strong>{i.quantity} ×</strong> {i.name}<div className="small muted">{i.sku}</div></div>
                {current.status === 'picking' && i.quantity > 1 && <div className="row">
                  <button className="secondary" disabled={busy || i.picked_quantity <= 0} onClick={() => setPicked(i, i.picked_quantity - 1)}>−</button>
                  <span>{i.picked_quantity}/{i.quantity}</span>
                  <button className="secondary" disabled={busy || done} onClick={() => setPicked(i, i.picked_quantity + 1)}>+</button></div>}
              </div>;
            })}
          </div>
          <div className="row">
            {current.status === 'paid' && <button className="big" disabled={busy} onClick={() => setStatus(current, 'picking')}>Inizia preparazione</button>}
            {current.status === 'picking' && <button className="big" disabled={busy || current.order_items.some((i) => i.picked_quantity < i.quantity)}
              onClick={() => setStatus(current, 'ready')}>Tutto pronto</button>}
            {current.status === 'ready' && current.fulfilment === 'store' && <button className="big" disabled={busy} onClick={() => setStatus(current, 'completed')}>Consegnato al cliente</button>}
            {current.status === 'ready' && current.fulfilment !== 'store' && <Link className="btn big" to={`/orders/${current.id}`}>Registra spedizione</Link>}
            <button className="secondary" onClick={() => window.print()}>Stampa</button>
          </div>
          {current.status === 'picking' && current.order_items.some((i) => i.picked_quantity < i.quantity) &&
            <p className="small muted">Spunta tutti i prodotti per completare. Se un prodotto manca, contatta un responsabile per il rimborso parziale.</p>}
        </>}
      </div>
    </div>}
  </>;
}
