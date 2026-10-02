import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ORDER_STATUS_LABELS, formatEuro, productImageUrl, type AdminOverview, type AdminOverviewDay, type OrderStatus } from '@casa-te/shared';
import { SUPABASE_URL, supabase, unwrap } from '../lib/supabase';
import { useAsync, useStores } from '../lib/data';
import { useAuth } from '../lib/auth';
import { addDays, daysBetween, isoDay, overviewRange } from '../lib/overview';
import { Empty, Loading, Notice } from '../components/ui';
import { Icon, type AdminIcon } from '../components/Icon';
import { OPEN_PERIOD_EVENT } from '../components/Layout';
import { dateLocale, t } from '../lib/i18n';

type Metric = 'revenue_cents' | 'orders' | 'customers';
const METRICS: Array<{ id: Metric; label: string }> = [
  { id: 'revenue_cents', label: 'Fatturato' }, { id: 'orders', label: 'Ordini' }, { id: 'customers', label: 'Clienti' },
];
const PRESETS = [7, 30, 90];

/** Order states grouped for the ring. Colours validated as a categorical set (labels and numbers always shown beside them). */
const STATUS_GROUPS: Array<{ label: string; statuses: OrderStatus[]; color: string }> = [
  { label: 'Da pagare', statuses: ['pending_payment'], color: '#C9574C' },
  { label: 'Da preparare', statuses: ['paid', 'picking', 'ready'], color: '#C99416' },
  { label: 'Spediti', statuses: ['shipped'], color: '#2F7A4D' },
  { label: 'Completati', statuses: ['completed'], color: '#3D7CC0' },
  { label: 'Annullati', statuses: ['cancelled'], color: '#A9A39A' },
];

const STATUS_ICON: Record<OrderStatus, AdminIcon> = {
  pending_payment: 'alertCircle', paid: 'creditCard', picking: 'clock', ready: 'package',
  shipped: 'truck', completed: 'checkCircle', cancelled: 'xCircle',
};

type RecentOrder = {
  id: string; order_number: string; customer_name: string | null; total_cents: number; status: OrderStatus; created_at: string;
  order_items: Array<{ quantity: number; image_path: string | null }>;
};

const img = (path: string | null | undefined) => productImageUrl(SUPABASE_URL, path);
const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' }) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(dateLocale(), opts);
const fmtStamp = (iso: string) => {
  const d = new Date(iso);
  return `${isoDay(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtMetric = (m: Metric, v: number) => (m === 'revenue_cents' ? formatEuro(v) : v.toLocaleString(dateLocale()));

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? t('Buongiorno') : h < 18 ? t('Buon pomeriggio') : t('Buonasera');
}

/** Change against a reference value: null when there is nothing to compare with. */
function change(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="delta muted">{label}</span>;
  const up = value >= 0;
  return <span className={`delta ${up ? 'up' : 'down'}`}>
    <Icon name={up ? 'trendUp' : 'trendDown'} size={15} strokeWidth={2} />
    <strong>{up ? '+' : ''}{value}%</strong> <span className="muted">{label}</span>
  </span>;
}

function Spark({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  return <div className="spark" role="img" aria-label={label}>
    {values.map((v, i) => <span key={i} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} className={i === values.length - 1 ? 'last' : ''} />)}
  </div>;
}

function KpiCard({ tone, icon, label, value, delta, before, spark, sparkLabel, note }: {
  tone: 'green' | 'orange' | 'pink' | 'sage'; icon: AdminIcon; label: string; value: string;
  delta?: number | null; before?: string; spark?: number[]; sparkLabel?: string; note?: string;
}) {
  return <div className={`kpi2 ${tone}`}>
    <span className="kpi2-icon"><Icon name={icon} size={24} strokeWidth={1.6} /></span>
    <div className="kpi2-body">
      <div className="kpi2-label">{t(label)}</div>
      <div className="kpi2-value">{value}</div>
      {note !== undefined ? <span className="delta muted">{note}</span> : <Delta value={delta ?? null} label={delta === null || delta === undefined ? t('ieri {value}', { value: before ?? '—' }) : t('rispetto a ieri')} />}
    </div>
    {spark && <Spark values={spark} label={t(sparkLabel ?? '')} />}
  </div>;
}

/** Two-period line chart with crosshair and tooltip. One axis; the previous period is the quieter line. */
function TrendChart({ current, previous, metric }: { current: AdminOverviewDay[]; previous: AdminOverviewDay[]; metric: Metric }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 230, L = 64, R = 14, T = 14, B = 28;
  const cur = current.map((d) => d[metric]);
  const prev = previous.map((d) => d[metric]);
  const rawMax = Math.max(1, ...cur, ...prev);
  // Nice round top for the axis (1, 2, 2.5 or 5 × 10^n), four steps.
  const step = (() => {
    const s = rawMax / 4;
    const p = 10 ** Math.floor(Math.log10(s));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= s) ?? s;
  })();
  const top = step * 4;
  const n = Math.max(cur.length, 1);
  const x = (i: number) => L + (n === 1 ? (width - L - R) / 2 : (i / (n - 1)) * (width - L - R));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = cur.length ? `${path(cur)}L${x(cur.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : '';
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((width - L - R) / 64))));
  const dots = n <= 31;
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * width;
    const i = Math.round(((px - L) / (width - L - R)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  const h = hover !== null && current[hover] ? hover : null;
  const tipLeft = h !== null ? Math.min(width - 170, Math.max(0, x(h) - 80)) : 0;
  const dayBefore = h !== null && h > 0 ? cur[h - 1] : h === 0 ? prev.at(-1) ?? 0 : 0;

  return <div className="trend" ref={wrap}>
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
      aria-label={t('Andamento {metric}: periodo attuale {current}, periodo precedente {previous}', { metric: t(METRICS.find((m) => m.id === metric)?.label ?? '').toLowerCase(), current: fmtMetric(metric, cur.reduce((a, b) => a + b, 0)), previous: fmtMetric(metric, prev.reduce((a, b) => a + b, 0)) })}>
      <defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2F7A4D" stopOpacity="0.16" /><stop offset="1" stopColor="#2F7A4D" stopOpacity="0" />
      </linearGradient></defs>
      {[0, 1, 2, 3, 4].map((k) => <g key={k}>
        <line x1={L} x2={width - R} y1={y(step * k)} y2={y(step * k)} className="grid-line" />
        <text x={L - 10} y={y(step * k) + 4} textAnchor="end" className="axis">{metric === 'revenue_cents' ? formatEuro(step * k).replace(',00', '') : step * k}</text>
      </g>)}
      {current.map((d, i) => (i % labelEvery === 0 || i === n - 1) && (n - 1 - i >= labelEvery / 2 || i === n - 1)
        ? <text key={d.day} x={x(i)} y={H - 8} textAnchor="middle" className="axis">{fmtDay(d.day)}</text> : null)}
      <path d={area} fill="url(#trend-fill)" />
      <path d={path(prev)} className="line prev" />
      <path d={path(cur)} className="line cur" />
      {dots && prev.map((v, i) => <circle key={`p${i}`} cx={x(i)} cy={y(v)} r={3.5} className="dot prev" />)}
      {dots && cur.map((v, i) => <circle key={`c${i}`} cx={x(i)} cy={y(v)} r={4.5} className="dot cur" />)}
      {h !== null && <>
        <line x1={x(h)} x2={x(h)} y1={T} y2={H - B} className="crosshair" />
        <circle cx={x(h)} cy={y(cur[h])} r={6} className="dot cur focus" />
      </>}
    </svg>
    {h !== null && <div className="trend-tip" style={{ left: tipLeft }}>
      <div className="muted small">{fmtDay(current[h].day, { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
      <strong>{fmtMetric(metric, cur[h])}</strong>
      <div className="small"><Delta value={change(cur[h], dayBefore)} label={t('rispetto al giorno prima')} /></div>
      {previous[h] && <div className="small muted">{t('Periodo precedente ({day}): {value}', { day: fmtDay(previous[h].day), value: fmtMetric(metric, prev[h]) })}</div>}
    </div>}
  </div>;
}

function Donut({ groups, total }: { groups: Array<{ label: string; color: string; value: number }>; total: number }) {
  const r = 70, c = 2 * Math.PI * r, gap = total ? 2 : 0;
  let offset = 0;
  return <svg width={190} height={190} viewBox="0 0 190 190" role="img"
    aria-label={`${t('Stato ordini')}: ${groups.map((g) => `${t(g.label)} ${g.value}`).join(', ')}`}>
    <circle cx={95} cy={95} r={r} fill="none" stroke="#EFECE6" strokeWidth={26} />
    {total > 0 && groups.filter((g) => g.value).map((g) => {
      const len = (g.value / total) * c;
      const seg = <circle key={g.label} cx={95} cy={95} r={r} fill="none" stroke={g.color} strokeWidth={26}
        strokeDasharray={`${Math.max(0.5, len - gap)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 95 95)" />;
      offset += len;
      return seg;
    })}
    <text x={95} y={88} textAnchor="middle" className="donut-label">{t('Totale ordini')}</text>
    <text x={95} y={118} textAnchor="middle" className="donut-total">{total}</text>
  </svg>;
}

function StatusPill({ status }: { status: OrderStatus }) {
  return <span className={`status-pill s-${status}`}><Icon name={STATUS_ICON[status]} size={15} />{t(ORDER_STATUS_LABELS[status])}</span>;
}

export function DashboardPage() {
  const { staff, can } = useAuth();
  const manager = can('admin', 'manager');
  const navigate = useNavigate();
  const stores = useStores();
  const [params, setParams] = useSearchParams();
  const { from, to } = overviewRange(params);
  const storeId = manager ? params.get('negozio') ?? '' : '';
  const [metric, setMetric] = useState<Metric>('revenue_cents');
  const [recentStatus, setRecentStatus] = useState<OrderStatus | ''>('');

  const overview = useAsync(async () => unwrap(await supabase.rpc('admin_overview', {
    p_from: from, p_to: to, p_store_id: storeId || null,
  })) as AdminOverview, [from, to, storeId]);
  const recent = useAsync(async () => {
    let q = supabase.from('orders').select('id,order_number,customer_name,total_cents,status,created_at,order_items(quantity,image_path)')
      .order('created_at', { ascending: false }).limit(5);
    if (storeId) q = q.eq('store_id', storeId);
    if (recentStatus) q = q.eq('status', recentStatus);
    return unwrap(await q) as RecentOrder[];
  }, [storeId, recentStatus]);
  const refresh = () => { void overview.reload(); void recent.reload(); };

  const o = overview.data;
  const byDay = useMemo(() => new Map((o?.series ?? []).map((d) => [d.day, d])), [o]);
  const empty = (day: string): AdminOverviewDay => ({ day, revenue_cents: 0, orders: 0, customers: 0, new_customers: null });
  const span = daysBetween(from, to);
  const current = Array.from({ length: span + 1 }, (_, i) => byDay.get(addDays(from, i)) ?? empty(addDays(from, i)));
  const previous = o ? Array.from({ length: span + 1 }, (_, i) => byDay.get(addDays(o.prev_from, i)) ?? empty(addDays(o.prev_from, i))) : [];
  const today = o?.today ?? isoDay(new Date());
  const week = Array.from({ length: 7 }, (_, i) => byDay.get(addDays(today, i - 6)) ?? empty(addDays(today, i - 6)));
  const [yesterday, todayRow] = [week[5], week[6]];
  const signups = todayRow.new_customers !== null;
  const open = o?.open ?? {};
  const toPrepare = (open.paid ?? 0) + (open.picking ?? 0) + (open.ready ?? 0);
  const groups = STATUS_GROUPS.map((g) => ({ ...g, value: g.statuses.reduce((n, s) => n + (o?.status[s] ?? 0), 0) }));
  const statusTotal = groups.reduce((n, g) => n + g.value, 0);
  const sum = (rows: AdminOverviewDay[]) => rows.reduce((n, d) => n + d[metric], 0);
  const preset = span + 1 === 7 || span + 1 === 30 || span + 1 === 90 ? (to === isoDay(new Date()) ? span + 1 : null) : null;
  const setPreset = (days: number) => {
    const next = new URLSearchParams(params);
    const end = isoDay(new Date());
    next.set('dal', addDays(end, -(days - 1))); next.set('al', end);
    setParams(next, { replace: true });
  };
  const storeIdByCode = (code: string) => stores.data?.find((s) => s.code === code)?.id ?? '';
  const firstName = (staff?.display_name ?? '').split(' ')[0];
  const todayLong = new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });

  return <>
    <div className="overview-head">
      <div>
        <h1 className="serif-title">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="muted overview-sub">{t('Oggi è {date} — insieme rendiamo la vita quotidiana ancora più bella.', { date: todayLong })}</p>
      </div>
      <button className="secondary refresh-btn" onClick={refresh} disabled={overview.loading}>
        <Icon name="refresh" size={18} /> {overview.loading ? t('Aggiornamento…') : t('Aggiorna dati')}</button>
    </div>

    {overview.error && <Notice tone="error">{overview.error}</Notice>}
    {!o ? <Loading /> : <>
      <div className="kpi-row">
        <KpiCard tone="green" icon="wallet" label="Vendite di oggi" value={formatEuro(todayRow.revenue_cents)}
          delta={change(todayRow.revenue_cents, yesterday.revenue_cents)} before={formatEuro(yesterday.revenue_cents)} spark={week.map((d) => d.revenue_cents)} sparkLabel="Vendite degli ultimi 7 giorni" />
        <KpiCard tone="orange" icon="document" label="Numero ordini" value={String(todayRow.orders)}
          delta={change(todayRow.orders, yesterday.orders)} before={String(yesterday.orders)} spark={week.map((d) => d.orders)} sparkLabel="Ordini degli ultimi 7 giorni" />
        {signups
          ? <KpiCard tone="pink" icon="customers" label="Nuovi clienti" value={String(todayRow.new_customers ?? 0)}
            delta={change(todayRow.new_customers ?? 0, yesterday.new_customers ?? 0)} before={String(yesterday.new_customers ?? 0)} spark={week.map((d) => d.new_customers ?? 0)} sparkLabel="Nuovi clienti degli ultimi 7 giorni" />
          : <KpiCard tone="pink" icon="customers" label="Clienti di oggi" value={String(todayRow.customers)}
            delta={change(todayRow.customers, yesterday.customers)} before={String(yesterday.customers)} spark={week.map((d) => d.customers)} sparkLabel="Clienti degli ultimi 7 giorni" />}
        <KpiCard tone="sage" icon="package" label="Ordini da evadere" value={String(toPrepare)}
          note={toPrepare ? t('di cui {n} da iniziare', { n: open.paid ?? 0 }) : t('Tutto evaso')} />
      </div>

      <div className="overview-grid">
        <section className="panel trend-panel">
          <div className="panel-head">
            <h2>{t('Andamento vendite')}</h2>
            <div className="presets" role="group" aria-label={t('Periodo')}>
              {PRESETS.map((d) => <button key={d} className={preset === d ? 'on' : ''} aria-pressed={preset === d} onClick={() => setPreset(d)}>{t('{n} giorni', { n: d })}</button>)}
              <button className={preset ? '' : 'on'} aria-pressed={!preset}
                onClick={() => window.dispatchEvent(new Event(OPEN_PERIOD_EVENT))}>
                {t('Personalizzato')} <Icon name="chevronDown" size={14} /></button>
            </div>
          </div>
          <div className="metric-tabs" role="tablist">
            {METRICS.map((m) => <button key={m.id} role="tab" aria-selected={metric === m.id} className={metric === m.id ? 'on' : ''} onClick={() => setMetric(m.id)}>{t(m.label)}</button>)}
          </div>
          <div className="trend-body">
            <TrendChart current={current} previous={previous} metric={metric} />
            <div className="trend-legend">
              <div><span className="key cur" />{t('Periodo attuale')}<strong>{fmtMetric(metric, sum(current))}</strong>
                <small className="muted">{fmtDay(from)} – {fmtDay(to)}</small></div>
              <div><span className="key prev" />{t('Periodo precedente')}<strong className="muted-strong">{fmtMetric(metric, sum(previous))}</strong>
                <small className="muted">{fmtDay(o.prev_from)} – {fmtDay(addDays(from, -1))}</small></div>
              {change(sum(current), sum(previous)) !== null && <Delta value={change(sum(current), sum(previous))} label={t('sul periodo precedente')} />}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>{t('Stato ordini')}</h2></div>
          <div className="donut-wrap">
            <Donut groups={groups} total={statusTotal} />
            <ul className="donut-legend">{groups.map((g) => <li key={g.label}>
              <Link to={`/orders?status=${g.statuses[0]}`}><i style={{ background: g.color }} />{t(g.label)}</Link>
              <strong>{g.value}</strong><span className="muted">{statusTotal ? Math.round((g.value / statusTotal) * 100) : 0}%</span>
            </li>)}</ul>
          </div>
          <Link to="/orders" className="panel-link">{t('Visualizza tutti gli ordini')} <Icon name="arrow" size={16} /></Link>
        </section>

        <section className="panel top-panel">
          <div className="panel-head"><h2>{t('Prodotti più venduti TOP 5')}</h2>
            {manager && <Link to="/products" className="panel-link small-link">{t('Tutti i prodotti')} <Icon name="arrow" size={15} /></Link>}</div>
          {o.top_products.length ? <ol className="top5">{o.top_products.map((p, i) => {
            const src = img(p.image);
            const body = <>
              <span className={`top5-rank r${i + 1}`}>{i + 1}</span>
              <span className="top5-img">{src ? <img src={src} alt="" /> : <Icon name="package" size={22} />}</span>
              <span className="top5-text"><strong>{p.name}</strong><small className="muted">{p.category || p.sku}</small></span>
              <span className="top5-num">{p.price_cents !== null && <strong>{formatEuro(p.price_cents)}</strong>}<small className="muted">{t('Venduti {n}', { n: p.quantity })}</small></span>
            </>;
            return <li key={p.sku}>{manager && p.product_id ? <Link to={`/products/${p.product_id}`}>{body}</Link> : <div>{body}</div>}</li>;
          })}</ol> : <Empty>{t('Nessuna vendita nel periodo.')}</Empty>}
        </section>

        <section className="panel recent-panel">
          <div className="panel-head"><h2>{t('Ordini recenti')}</h2>
            <div className="row">
              <select value={recentStatus} onChange={(e) => setRecentStatus(e.target.value as OrderStatus | '')} aria-label={t('Filtra per stato')} className="compact">
                <option value="">{t('Tutti gli stati')}</option>
                {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => <option key={s} value={s}>{t(ORDER_STATUS_LABELS[s])}</option>)}
              </select>
              <Link to="/orders" className="panel-link small-link">{t('Visualizza tutti gli ordini')} <Icon name="arrow" size={15} /></Link>
            </div>
          </div>
          {recent.data?.length ? <div className="table-scroll"><table className="recent-table">
            <thead><tr><th>{t('N. ordine')}</th><th>{t('Cliente')}</th><th className="num">{t('Quantità')}</th><th className="num">{t('Importo')}</th><th>{t('Stato')}</th><th>{t('Data ordine')}</th><th><span className="sr-only">{t('Azioni')}</span></th></tr></thead>
            <tbody>{recent.data.map((r) => {
              const thumb = img(r.order_items.find((it) => it.image_path)?.image_path);
              return <tr key={r.id} className="clickable" onClick={() => navigate(`/orders/${r.id}`)}>
                <td className="mono">{r.order_number}</td>
                <td><span className="cust">{thumb ? <img src={thumb} alt="" /> : <span className="cust-ph"><Icon name="package" size={16} /></span>}{r.customer_name ?? '—'}</span></td>
                <td className="num">{r.order_items.reduce((n, it) => n + it.quantity, 0)}</td>
                <td className="num"><strong>{formatEuro(r.total_cents)}</strong></td>
                <td><StatusPill status={r.status} /></td>
                <td className="muted">{fmtStamp(r.created_at)}</td>
                <td><Link to={`/orders/${r.id}`} className="view-link" onClick={(e) => e.stopPropagation()}>{t('Visualizza')}</Link></td>
              </tr>;
            })}</tbody></table></div>
            : <Empty>{recent.data ? t('Nessun ordine.') : t('Caricamento…')}</Empty>}
        </section>

        <section className="panel stock-panel">
          <div className="panel-head"><h2>{t('Avviso scorte')}</h2>
            <Link to="/inventory?basse=1" className="panel-link small-link">{t('Visualizza tutto')} <Icon name="arrow" size={15} /></Link></div>
          {o.low_stock.length ? <ul className="stock-alerts">{o.low_stock.map((l) => {
            const src = img(l.image);
            const store = storeIdByCode(l.store_code);
            return <li key={l.store_code + l.sku}>
              <span className="top5-img small">{src ? <img src={src} alt="" /> : <Icon name="package" size={18} />}</span>
              <span className="top5-text"><strong>{l.name}</strong><small className="muted">SKU {l.sku} · {l.store_code}</small></span>
              <span className={`stock-qty ${l.quantity === 0 ? 'out' : ''}`}>{l.quantity === 0 ? t('Esaurito') : t('Scorte: {n}', { n: l.quantity })}</span>
              <Link className="btn secondary restock" to={`/inventory?q=${encodeURIComponent(l.sku)}${store ? `&negozio=${store}` : ''}`}>{t('Rifornisci')}</Link>
            </li>;
          })}</ul> : <div className="all-good"><span className="kpi-icon"><Icon name="checkCircle" /></span>
            <div><strong>{t('Magazzino in ordine')}</strong><div className="small muted">{t('Nessun prodotto con {n} pezzi o meno.', { n: o.low_stock_threshold ?? 3 })}</div></div></div>}
        </section>
      </div>
    </>}
  </>;
}
