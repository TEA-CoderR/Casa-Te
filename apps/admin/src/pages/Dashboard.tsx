import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FULFILMENT_LABELS, ORDER_STATUS_LABELS, formatEuro, type DashboardStats, type FulfilmentMethod, type OrderStatus } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { useAsync, useStores } from '../lib/data';
import { useAuth } from '../lib/auth';
import { Empty, Loading, Notice, PageHead } from '../components/ui';

const RANGES = [
  { id: 'today', label: 'Oggi', days: 0 },
  { id: '7d', label: '7 giorni', days: 7 },
  { id: '30d', label: '30 giorni', days: 30 },
  { id: '90d', label: '90 giorni', days: 90 },
];

function rangeStart(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

export function DashboardPage() {
  const { can, staff } = useAuth();
  const stores = useStores();
  const [range, setRange] = useState(RANGES[1]);
  const [storeId, setStoreId] = useState<string>('');
  const stats = useAsync(async () => unwrap(await supabase.rpc('admin_dashboard', {
    p_from: rangeStart(range.days).toISOString(), p_to: new Date(Date.now() + 60_000).toISOString(), p_store_id: storeId || null,
  })) as DashboardStats, [range.id, storeId]);
  const s = stats.data;
  const maxDay = Math.max(1, ...(s?.by_day ?? []).map((d) => d.revenue_cents));
  const open = s?.open_orders ?? {};

  return <>
    <PageHead title="Dashboard" subtitle={staff?.role === 'store_staff' ? 'Dati del tuo negozio' : 'Vendite online'} actions={<>
      <select value={range.id} onChange={(e) => setRange(RANGES.find((r) => r.id === e.target.value)!)} aria-label="Periodo">
        {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      {can('admin', 'manager') && <select value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Negozio">
        <option value="">Tutti i negozi</option>{stores.data?.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}</select>}
    </>} />
    {stats.error && <Notice tone="error">{stats.error}</Notice>}
    {!s ? <Loading /> : <>
      <div className="grid kpi">
        <div className="card stat"><div className="label">Incasso netto</div><div className="value">{formatEuro(s.revenue_cents)}</div></div>
        <div className="card stat"><div className="label">Ordini pagati</div><div className="value">{s.orders}</div></div>
        <div className="card stat"><div className="label">Scontrino medio</div><div className="value">{formatEuro(s.average_order_cents)}</div></div>
        <div className="card stat"><div className="label">Rimborsi</div><div className="value">{formatEuro(s.refunded_cents)}</div></div>
      </div>

      <h2>Da lavorare</h2>
      <div className="grid kpi">
        {(['paid', 'picking', 'ready', 'shipped'] as OrderStatus[]).map((st) =>
          <Link key={st} to={`/orders?status=${st}`} className="card stat" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="label">{ORDER_STATUS_LABELS[st]}</div><div className="value">{open[st] ?? 0}</div></Link>)}
      </div>

      <div className="grid two" style={{ marginTop: 14 }}>
        <div className="card"><h2 style={{ marginTop: 0 }}>Incasso per giorno</h2>
          {s.by_day.length ? <><div className="bars">{s.by_day.map((d) =>
            <div key={d.day} style={{ height: `${(d.revenue_cents / maxDay) * 100}%` }} title={`${d.day}: ${formatEuro(d.revenue_cents)} · ${d.orders} ordini`} />)}</div>
            <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>{s.by_day[0].day}</span><span>{s.by_day.at(-1)!.day}</span></div></>
            : <Empty>Nessuna vendita nel periodo.</Empty>}
          <div className="row small" style={{ marginTop: 12 }}>
            {Object.entries(s.by_fulfilment).map(([k, n]) => <span key={k} className="badge muted">{FULFILMENT_LABELS[k as FulfilmentMethod]}: {n}</span>)}
          </div>
        </div>
        <div className="card"><h2 style={{ marginTop: 0 }}>Prodotti più venduti</h2>
          {s.top_products.length ? <table><thead><tr><th>Prodotto</th><th className="num">Pezzi</th><th className="num">Incasso</th></tr></thead>
            <tbody>{s.top_products.map((p) => <tr key={p.sku}><td>{p.name}<div className="small muted">{p.sku}</div></td>
              <td className="num">{p.quantity}</td><td className="num">{formatEuro(p.revenue_cents)}</td></tr>)}</tbody></table>
            : <Empty>Nessun dato.</Empty>}
        </div>
      </div>

      <h2>Scorte basse (≤ 3 pezzi)</h2>
      {s.low_stock.length ? <div className="table-wrap"><table><thead><tr><th>Negozio</th><th>Prodotto</th><th className="num">Disponibili</th></tr></thead>
        <tbody>{s.low_stock.map((l) => <tr key={l.store_code + l.sku}><td>{l.store_code}</td><td>{l.name} <span className="small muted">{l.sku}</span></td>
          <td className="num"><span className={`badge ${l.quantity === 0 ? 'bad' : 'warn'}`}>{l.quantity}</span></td></tr>)}</tbody></table></div>
        : <Empty>Nessun prodotto sotto scorta.</Empty>}
    </>}
  </>;
}
