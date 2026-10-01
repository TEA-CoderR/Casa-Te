import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FULFILMENT_LABELS, ORDER_STATUS_LABELS, formatEuro, type DashboardStats, type FulfilmentMethod, type OrderStatus } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { useAsync, useStores } from '../lib/data';
import { useAuth } from '../lib/auth';
import { Empty, Loading, Notice } from '../components/ui';
import { Icon, type AdminIcon } from '../components/Icon';

const RANGES = [
  { id: 'today', label: 'Oggi', days: 0 },
  { id: '7d', label: '7 giorni', days: 7 },
  { id: '30d', label: '30 giorni', days: 30 },
  { id: '90d', label: '90 giorni', days: 90 },
];
const FULFILMENT_COLORS: Record<FulfilmentMethod, string> = { home: '#2f6634', pickup: '#8fb46b', store: '#d9ee2f' };
const PIPELINE: Array<{ status: OrderStatus; color: string }> = [
  { status: 'paid', color: '#2f7fd1' }, { status: 'picking', color: '#7b4bc4' },
  { status: 'ready', color: '#5d9a1d' }, { status: 'shipped', color: '#6f786f' },
];

type RecentOrder = { id: string; order_number: string; customer_name: string | null; total_cents: number; status: OrderStatus; fulfilment: FulfilmentMethod; created_at: string };

function rangeStart(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
}
function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h fa`;
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function Kpi({ icon, label, value, hint, tone }: { icon: AdminIcon; label: string; value: string; hint?: string; tone?: 'hero' | 'warn' }) {
  return <div className={`card kpi-card ${tone ?? ''}`}>
    <div className="kpi-top"><span className="kpi-icon"><Icon name={icon} /></span><span className="label">{label}</span></div>
    <div className="value">{value}</div>
    {hint && <div className="hint">{hint}</div>}
  </div>;
}

export function DashboardPage() {
  const { can, staff } = useAuth();
  const navigate = useNavigate();
  const stores = useStores();
  const [range, setRange] = useState(RANGES[1]);
  const [storeId, setStoreId] = useState<string>('');
  const stats = useAsync(async () => unwrap(await supabase.rpc('admin_dashboard', {
    p_from: rangeStart(range.days).toISOString(), p_to: new Date(Date.now() + 60_000).toISOString(), p_store_id: storeId || null,
  })) as DashboardStats, [range.id, storeId]);
  const recent = useAsync(async () => {
    let q = supabase.from('orders').select('id,order_number,customer_name,total_cents,status,fulfilment,created_at')
      .neq('status', 'pending_payment').order('created_at', { ascending: false }).limit(6);
    if (storeId) q = q.eq('store_id', storeId);
    return unwrap(await q) as RecentOrder[];
  }, [storeId]);
  const s = stats.data;
  const open = s?.open_orders ?? {};

  // Zero-filled daily series across the whole range, so the chart reads as a timeline.
  const byDay = new Map((s?.by_day ?? []).map((d) => [d.day.slice(0, 10), d]));
  const days: Array<{ day: string; revenue_cents: number; orders: number }> = [];
  for (let d = rangeStart(range.days); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const key = dayKey(d);
    days.push(byDay.get(key) ?? { day: key, revenue_cents: 0, orders: 0 });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.revenue_cents));
  const fulfilment = Object.entries(s?.by_fulfilment ?? {}) as Array<[FulfilmentMethod, number]>;
  const fulfilmentTotal = fulfilment.reduce((n, [, v]) => n + v, 0);
  const topMax = Math.max(1, ...(s?.top_products ?? []).map((p) => p.revenue_cents));
  const toWork = (open.paid ?? 0) + (open.picking ?? 0);
  const firstName = (staff?.display_name ?? '').split(' ')[0];

  return <>
    <div className="dash-head">
      <div>
        <h1>{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="muted" style={{ margin: 0 }}>
          <span className="date-line">{new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}.</span>{' '}
          {toWork > 0 ? <>{toWork === 1 ? <>C'è <strong>1 ordine</strong></> : <>Ci sono <strong>{toWork} ordini</strong></>} da preparare. <Link to="/picking" className="inline-link">Vai alla preparazione <Icon name="arrow" size={14} /></Link></>
            : 'Nessun ordine in attesa di preparazione.'}
        </p>
      </div>
      <div className="row">
        <div className="segmented" role="tablist" aria-label="Periodo">
          {RANGES.map((r) => <button key={r.id} role="tab" aria-selected={r.id === range.id}
            className={r.id === range.id ? 'on' : ''} onClick={() => setRange(r)}>{r.label}</button>)}
        </div>
        {can('admin', 'manager') && <select value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Negozio">
          <option value="">Tutti i negozi</option>{stores.data?.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}</select>}
      </div>
    </div>

    {stats.error && <Notice tone="error">{stats.error}</Notice>}
    {!s ? <Loading /> : <>
      <div className="grid kpi">
        <Kpi tone="hero" icon="euro" label="Incasso netto" value={formatEuro(s.revenue_cents)} hint="al netto dei rimborsi" />
        <Kpi icon="bag" label="Ordini pagati" value={String(s.orders)} hint={`${fulfilmentTotal} consegne programmate`} />
        <Kpi icon="receipt" label="Scontrino medio" value={formatEuro(s.average_order_cents)} hint="per ordine pagato" />
        <Kpi icon="refund" label="Rimborsi" value={formatEuro(s.refunded_cents)} hint={s.refunded_cents ? 'emessi su Stripe' : 'nessun rimborso'} />
      </div>

      <div className="pipeline">
        {PIPELINE.map(({ status, color }, i) => <Link key={status} to={`/orders?status=${status}`} className="stage">
          <span className="dot" style={{ background: color }} />
          <span className="stage-label">{ORDER_STATUS_LABELS[status]}</span>
          <span className="stage-value">{open[status] ?? 0}</span>
          {i < PIPELINE.length - 1 && <span className="stage-arrow"><Icon name="arrow" size={14} /></span>}
        </Link>)}
      </div>

      <div className="grid dash-main">
        <div className="card">
          <div className="card-head"><h2>Incasso per giorno</h2>
            <span className="muted small">{days.length > 1 ? `${dayLabel(days[0].day)} – ${dayLabel(days.at(-1)!.day)}` : dayLabel(days[0].day)}</span></div>
          <div className="chart">
            <div className="chart-grid">{[1, 0.5, 0].map((f) =>
              <div key={f} className="gridline"><span>{formatEuro(Math.round(maxDay * f))}</span></div>)}</div>
            <div className="bars">{days.map((d) =>
              <div key={d.day} className="bar-col" title={`${dayLabel(d.day)}: ${formatEuro(d.revenue_cents)} · ${d.orders} ordini`}>
                <div className={`bar ${d.revenue_cents ? '' : 'empty'}`} style={{ height: `${Math.max(2, (d.revenue_cents / maxDay) * 100)}%` }} />
              </div>)}</div>
          </div>
          <div className="row small muted" style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <span>{dayLabel(days[0].day)}</span><span>{dayLabel(days.at(-1)!.day)}</span></div>

          <div className="card-head" style={{ marginTop: 22 }}><h2>Modalità di consegna</h2></div>
          {fulfilmentTotal ? <>
            <div className="stack">{fulfilment.map(([k, n]) =>
              <div key={k} style={{ width: `${(n / fulfilmentTotal) * 100}%`, background: FULFILMENT_COLORS[k] }} title={`${FULFILMENT_LABELS[k]}: ${n}`} />)}</div>
            <div className="legend">{fulfilment.map(([k, n]) => <span key={k}><i style={{ background: FULFILMENT_COLORS[k] }} />
              {FULFILMENT_LABELS[k]} <strong>{n}</strong> <span className="muted">({Math.round((n / fulfilmentTotal) * 100)}%)</span></span>)}</div>
          </> : <p className="muted small">Nessun ordine nel periodo.</p>}
        </div>

        <div className="card">
          <div className="card-head"><h2>Prodotti più venduti</h2><Link to="/products" className="small inline-link">Catalogo <Icon name="arrow" size={13} /></Link></div>
          {s.top_products.length ? <ol className="top-list">{s.top_products.map((p, i) => <li key={p.sku}>
            <span className="rank">{i + 1}</span>
            <div className="top-body">
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <span className="top-name">{p.name}</span><strong>{formatEuro(p.revenue_cents)}</strong></div>
              <div className="meter"><div style={{ width: `${(p.revenue_cents / topMax) * 100}%` }} /></div>
              <span className="small muted">{p.quantity} pezzi · {p.sku}</span>
            </div>
          </li>)}</ol> : <Empty>Nessuna vendita nel periodo.</Empty>}
        </div>
      </div>

      <div className="grid dash-main" style={{ marginTop: 16 }}>
        <div className="card flush">
          <div className="card-head pad"><h2>Ultimi ordini</h2><Link to="/orders" className="small inline-link">Tutti gli ordini <Icon name="arrow" size={13} /></Link></div>
          {recent.data?.length ? <table><thead><tr><th>Ordine</th><th>Cliente</th><th>Consegna</th><th>Stato</th><th className="num">Totale</th></tr></thead>
            <tbody>{recent.data.map((o) => <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
              <td><Link to={`/orders/${o.id}`} className="row-link" onClick={(e) => e.stopPropagation()}>{o.order_number}</Link><div className="small muted">{timeAgo(o.created_at)}</div></td>
              <td>{o.customer_name ?? '—'}</td>
              <td className="small">{FULFILMENT_LABELS[o.fulfilment]}</td>
              <td><span className={`badge ${o.status}`}>{ORDER_STATUS_LABELS[o.status]}</span></td>
              <td className="num"><strong>{formatEuro(o.total_cents)}</strong></td>
            </tr>)}</tbody></table> : <Empty>{recent.data ? 'Ancora nessun ordine.' : 'Caricamento…'}</Empty>}
        </div>

        <div className="card">
          <div className="card-head"><h2>Scorte basse</h2><span className="small muted">≤ 3 pezzi</span></div>
          {s.low_stock.length ? <ul className="stock-list">{s.low_stock.map((l) => <li key={l.store_code + l.sku}>
            <span className={`stock-dot ${l.quantity === 0 ? 'bad' : 'warn'}`}><Icon name="alert" size={14} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div className="top-name">{l.name}</div><div className="small muted">{l.store_code} · {l.sku}</div></div>
            <span className={`badge ${l.quantity === 0 ? 'bad' : 'warn'}`}>{l.quantity === 0 ? 'Esaurito' : `${l.quantity} pz`}</span>
          </li>)}</ul>
            : <div className="all-good"><span className="kpi-icon"><Icon name="inventory" /></span>
              <div><strong>Magazzino in ordine</strong><div className="small muted">Nessun prodotto sotto scorta.</div></div></div>}
          <Link to="/inventory" className="btn secondary" style={{ marginTop: 14 }}>Apri magazzino</Link>
        </div>
      </div>
    </>}
  </>;
}
