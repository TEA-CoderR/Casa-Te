import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatEuro, formatWeight, type ActivityLogRow, type OrderStatus, type PaymentStatus } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { useAsync, useDebounced } from '../lib/data';
import { downloadCsv, toCsv } from '../lib/csv';
import { dateLocale, t } from '../lib/i18n';
import { Empty, Loading, Notice, PageHead, Pager } from '../components/ui';
import { Icon } from '../components/Icon';

const PAGE = 50;

/** What each audited table is called in the console, and where its records open. */
const ENTITIES: Record<string, { label: string; link?: (id: string) => string }> = {
  products: { label: 'Prodotto', link: (id) => `/products/${id}` },
  categories: { label: 'Categoria', link: () => '/categories' },
  orders: { label: 'Ordine', link: (id) => `/orders/${id}` },
  inventory: { label: 'Magazzino', link: () => '/inventory' },
  coupons: { label: 'Codice sconto', link: () => '/coupons' },
  stores: { label: 'Negozio', link: () => '/stores' },
  staff_members: { label: 'Personale', link: () => '/staff' },
  shipping_rates: { label: 'Tariffa di spedizione', link: () => '/shipping' },
  pickup_points: { label: 'Punto di ritiro', link: () => '/pickup-points' },
  product_reviews: { label: 'Recensione', link: () => '/reviews' },
  profiles: { label: 'Cliente (Club)', link: () => '/loyalty' },
  app_settings: { label: 'Impostazioni', link: () => '/settings' },
};

const FIELDS: Record<string, string> = {
  name: 'Nome', sku: 'SKU', slug: 'Slug', description: 'Descrizione', brand: 'Marca', barcode: 'Codice a barre',
  price_cents: 'Prezzo', compare_at_price_cents: 'Prezzo barrato', vat_rate: 'IVA', weight_g: 'Peso', category_id: 'Categoria',
  active: 'Attivo', featured: 'In evidenza', max_per_order: 'Massimo per ordine', color: 'Colore', unit: 'Unità', unit_quantity: 'Quantità confezione',
  highlights: 'Punti di forza', variant_group: 'Gruppo varianti', variant_title: 'Nome variante', variant_label: 'Variante',
  quantity: 'Quantità', status: 'Stato', payment_status: 'Pagamento', refunded_cents: 'Rimborsato', carrier: 'Corriere',
  tracking_number: 'Codice di tracciamento', role: 'Ruolo', store_id: 'Negozio', display_name: 'Nome visualizzato', email: 'Email',
  hidden: 'Nascosta', club_member_since: 'Membro del Club', low_stock_threshold: 'Soglia scorte basse', club_enabled: 'Iscrizioni al Club',
  club_tagline: 'Descrizione del Club', code: 'Codice', kind: 'Tipo', value: 'Valore', min_subtotal_cents: 'Spesa minima',
  max_subtotal_cents: 'Spesa massima', starts_at: 'Inizio', ends_at: 'Fine', max_redemptions: 'Utilizzi massimi',
  per_customer_limit: 'Limite per cliente', club_only: 'Solo Club', show_on_home: 'Mostra in home', sort: 'Ordine##posizione', parent_id: 'Categoria superiore',
  city: 'Città', address: 'Indirizzo', postal_code: 'CAP', province: 'Provincia', phone: 'Telefono', opening_hours: 'Orari',
  pickup_enabled: 'Ritiro in negozio', ships_orders: 'Spedisce ordini', method: 'Metodo', priority: 'Priorità',
  min_weight_g: 'Peso minimo', max_weight_g: 'Peso massimo', provisional: 'Provvisoria', label: 'Etichetta', notes: 'Note',
};

const ACTIONS = { insert: 'Creato', update: 'Modificato', delete: 'Eliminato' } as const;

function fmtValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? t('Sì') : t('No');
  if (field.endsWith('_cents') && typeof v === 'number') return formatEuro(v);
  if (field.endsWith('_g') && typeof v === 'number') return formatWeight(v);
  if (field === 'status' && typeof v === 'string' && v in ORDER_STATUS_LABELS) return t(ORDER_STATUS_LABELS[v as OrderStatus]);
  if (field === 'payment_status' && typeof v === 'string' && v in PAYMENT_STATUS_LABELS) return t(PAYMENT_STATUS_LABELS[v as PaymentStatus]);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString(dateLocale(), { dateStyle: 'short', timeStyle: 'short' });
  if (typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)) return t('(modificato)');
  if (typeof v === 'object') return t('(modificato)');
  return String(v);
}

const fieldLabel = (k: string) => (FIELDS[k] ? t(FIELDS[k]) : k);

function Changes({ row }: { row: ActivityLogRow }) {
  if (row.action !== 'update') return <span className="muted">—</span>;
  return <ul className="changes">{row.changes.map((k) => {
    const d = row.details?.[k];
    return <li key={k}><strong>{fieldLabel(k)}</strong>{d ? <>: <span className="muted">{fmtValue(k, d[0])}</span> → {fmtValue(k, d[1])}</> : null}</li>;
  })}</ul>;
}

export function ActivityPage() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = useState(0);

  const build = () => {
    let query = supabase.from('activity_log').select('*', { count: 'exact' });
    if (entity) query = query.eq('entity', entity);
    if (action) query = query.eq('action', action);
    if (from) query = query.gte('created_at', new Date(`${from}T00:00:00`).toISOString());
    if (to) query = query.lt('created_at', new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString());
    if (q) { const s = q.replace(/[%,()]/g, ' '); query = query.or(`label.ilike.%${s}%,actor_name.ilike.%${s}%`); }
    return query.order('created_at', { ascending: false }).order('id', { ascending: false });
  };
  const log = useAsync(async () => {
    const res = await build().range(page * PAGE, page * PAGE + PAGE - 1);
    return { rows: unwrap(res) as ActivityLogRow[], count: res.count ?? 0 };
  }, [entity, action, from, to, q, page]);

  const exportCsv = async () => {
    const rows = unwrap(await build().limit(10000)) as ActivityLogRow[];
    downloadCsv(`registro-attivita-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map((r) => ({
      data: r.created_at, utente: r.actor_name ?? t('Sistema'), azione: t(ACTIONS[r.action]), tipo: t(ENTITIES[r.entity]?.label ?? r.entity),
      elemento: r.label ?? '', modifiche: r.changes.map((k) => {
        const d = r.details?.[k];
        return d ? `${fieldLabel(k)}: ${fmtValue(k, d[0])} → ${fmtValue(k, d[1])}` : fieldLabel(k);
      }).join('; '),
    })), ['data', 'utente', 'azione', 'tipo', 'elemento', 'modifiche']));
  };
  const reset = () => { setEntity(''); setAction(''); setFrom(''); setTo(''); setSearch(''); setPage(0); };
  const filtered = !!(entity || action || from || to || search);

  return <>
    <PageHead title={t('Registro attività')} subtitle={log.data ? t('{n} operazioni registrate', { n: log.data.count }) : t('Chi ha modificato cosa, e quando.')}
      actions={<button className="secondary" onClick={exportCsv}><Icon name="import" size={16} /> {t('Esporta CSV')}</button>} />
    <div className="toolbar">
      <input placeholder={t('Elemento o utente')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} aria-label={t('Cerca')} style={{ minWidth: 220 }} />
      <select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0); }} aria-label={t('Tipo')}>
        <option value="">{t('Tutti i tipi')}</option>
        {Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}
      </select>
      <select value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }} aria-label={t('Azione')}>
        <option value="">{t('Tutte le azioni')}</option>
        {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
      </select>
      <label className="inline-field">{t('Dal')}<input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /></label>
      <label className="inline-field">{t('Al')}<input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(0); }} /></label>
      {filtered && <button className="ghost" onClick={reset}>{t('Azzera filtri')}</button>}
    </div>
    {log.error && <Notice tone="error">{log.error}</Notice>}
    {!log.data ? <Loading /> : !log.data.rows.length ? <Empty>{filtered ? t('Nessuna operazione con questi filtri.') : t('Ancora nessuna operazione registrata.')}</Empty>
      : <div className="table-wrap"><table>
        <thead><tr><th>{t('Data e ora')}</th><th>{t('Utente')}</th><th>{t('Azione')}</th><th>{t('Elemento')}</th><th>{t('Modifiche')}</th></tr></thead>
        <tbody>{log.data.rows.map((r) => {
          const ent = ENTITIES[r.entity];
          const href = ent?.link && r.entity_id && r.action !== 'delete' ? ent.link(r.entity_id) : null;
          return <tr key={r.id}>
            <td className="nowrap">{new Date(r.created_at).toLocaleString(dateLocale(), { dateStyle: 'short', timeStyle: 'medium' })}</td>
            <td>{r.actor_name ?? <span className="muted">{t('Sistema')}</span>}</td>
            <td><span className={`badge act-${r.action}`}>{t(ACTIONS[r.action])}</span></td>
            <td><div className="small muted">{t(ent?.label ?? r.entity)}</div>
              {href ? <Link to={href} className="row-link">{r.label === 'app_settings' ? t('Impostazioni del negozio') : r.label ?? '—'}</Link>
                : <strong>{r.label === 'app_settings' ? t('Impostazioni del negozio') : r.label ?? '—'}</strong>}</td>
            <td><Changes row={r} /></td>
          </tr>;
        })}</tbody></table></div>}
    {log.data && <Pager page={page} hasMore={(page + 1) * PAGE < log.data.count} onPage={setPage} />}
  </>;
}
