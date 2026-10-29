import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  REFUND_METHOD_LABELS, RETURN_REASON_LABELS, RETURN_STATUS_LABELS, formatEuro,
  type ReturnRequestRow, type ReturnStatus,
} from '@casa-te/shared';
import { invoke, supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync, useStores } from '../lib/data';
import { useAuth } from '../lib/auth';
import { t } from '../lib/i18n';
import { Empty, Field, Loading, Modal, Notice, PageHead, Success, fmtDate } from '../components/ui';

type Row = ReturnRequestRow & {
  order: { order_number: string; customer_name: string | null; customer_email: string | null; payment_status: string } | null;
  return_items: Array<{ quantity: number; order_item: { name: string; sku: string; unit_price_cents: number } | null }>;
};
type Filter = 'todo' | 'requested' | 'approved' | 'received' | 'closed' | 'all';

const FILTERS: Array<[Filter, string, ReturnStatus[] | null]> = [
  ['todo', 'Da gestire', ['requested', 'approved', 'received']],
  ['requested', 'Da valutare', ['requested']],
  ['approved', 'Attesi in negozio', ['approved']],
  ['received', 'Da rimborsare o cambiare', ['received']],
  ['closed', 'Chiusi', ['refunded', 'exchanged', 'rejected', 'cancelled']],
  ['all', 'Tutti', null],
];
const BADGE: Record<ReturnStatus, string> = {
  requested: 'warn', approved: 'paid', received: 'picking', refunded: 'ready', exchanged: 'ready', rejected: 'bad', cancelled: 'muted',
};
const SELECT = '*, order:orders(order_number,customer_name,customer_email,payment_status), return_items(quantity, order_item:order_items(name,sku,unit_price_cents))';

/**
 * Returns and after-sales. Managers approve or reject; the store marks the goods received; then managers
 * refund (card through Stripe, or a voucher) or the store hands over the same product.
 */
export function ReturnsPage() {
  const { can } = useAuth();
  const manager = can('admin', 'manager');
  const stores = useStores();
  const [filter, setFilter] = useState<Filter>('todo');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const [done, setDone] = useState('');
  const list = useAsync(async () => {
    let q = supabase.from('return_requests').select(SELECT).order('created_at', { ascending: false }).limit(200);
    const statuses = FILTERS.find((f) => f[0] === filter)?.[2];
    const code = search.trim().toUpperCase();
    if (code) q = q.ilike('return_number', `%${code.replace(/[%_]/g, '')}%`);
    else if (statuses) q = q.in('status', statuses);
    return unwrap(await q) as unknown as Row[];
  }, [filter, search]);
  const storeName = (id: string) => stores.data?.find((s) => s.id === id)?.name.replace(/^CASA & TE\s*/, '') ?? '—';

  return <>
    <PageHead title={t('Resi e assistenza')} subtitle={t('Le richieste dei clienti dalla pagina dell’ordine. Il responsabile approva e rimborsa; il negozio registra la consegna degli articoli.')} />
    <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
      <div className="row" role="radiogroup" aria-label={t('Filtro')} style={{ flexWrap: 'wrap', gap: 6 }}>
        {FILTERS.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={filter === id && !search}
          className={filter === id && !search ? '' : 'secondary'} onClick={() => { setFilter(id); setSearch(''); }}>{t(label)}</button>)}
      </div>
      <span className="spacer" />
      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Codice reso (RESO-…)')}
        aria-label={t('Cerca per codice reso')} style={{ maxWidth: 220 }} />
    </div>
    {done && <Success onDismiss={() => setDone('')}>{done}</Success>}
    {!list.data ? (list.error ? <Notice tone="error">{list.error}</Notice> : <Loading />)
      : !list.data.length ? <Empty>{t('Nessuna richiesta.')}</Empty>
      : <div className="table-wrap"><table>
        <thead><tr><th>{t('Reso')}</th><th>{t('Data')}</th><th>{t('Ordine')}</th><th>{t('Cliente')}</th><th>{t('Negozio')}</th>
          <th>{t('Motivo')}</th><th>{t('Richiesta')}</th><th className="num">{t('Valore')}</th><th>{t('Stato')}</th></tr></thead>
        <tbody>{list.data.map((r) => <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
          <td><strong className="row-link">{r.return_number}</strong></td>
          <td className="small">{fmtDate(r.created_at)}</td>
          <td><Link to={`/orders/${r.order_id}`} onClick={(e) => e.stopPropagation()}>{r.order?.order_number ?? '—'}</Link></td>
          <td>{r.order?.customer_name ?? '—'}</td>
          <td className="small">{storeName(r.store_id)}</td>
          <td className="small">{t(RETURN_REASON_LABELS[r.reason])}{r.photo_paths.length ? ` · 📷 ${r.photo_paths.length}` : ''}</td>
          <td className="small">{r.resolution === 'exchange' ? t('Cambio') : `${t('Rimborso')} · ${t(REFUND_METHOD_LABELS[r.refund_method ?? 'card'])}`}</td>
          <td className="num">{formatEuro(r.amount_cents)}</td>
          <td><span className={`badge ${BADGE[r.status]}`}>{t(RETURN_STATUS_LABELS[r.status].split(':')[0])}</span></td>
        </tr>)}</tbody></table></div>}
    {open && <ReturnModal ret={open} manager={manager} storeName={storeName(open.store_id)} onClose={() => setOpen(null)}
      onDone={async (msg) => { setOpen(null); setDone(msg); await list.reload(); }} />}
  </>;
}

function ReturnModal({ ret, manager, storeName, onClose, onDone }: {
  ret: Row; manager: boolean; storeName: string; onClose: () => void; onDone: (msg: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState((ret.amount_cents / 100).toFixed(2).replace('.', ','));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  useEffect(() => {
    if (!ret.photo_paths.length) return;
    void supabase.storage.from('return-photos').createSignedUrls(ret.photo_paths, 3600)
      .then(({ data }) => setPhotos((data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u)));
  }, [ret.id]);
  const cents = Math.round(Number(amount.replace(',', '.')) * 100);
  const amountOk = Number.isInteger(cents) && cents > 0 && cents <= ret.amount_cents;
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setError('');
    try { await fn(); await onDone(msg); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const rpc = (name: string, args: Record<string, unknown>) => async () => unwrap(await supabase.rpc(name, args));

  return <Modal title={`${ret.return_number} · ${t(RETURN_STATUS_LABELS[ret.status].split(':')[0])}`} onClose={onClose} dirty={!!note}>
    <div className="grid" style={{ gap: 10 }}>
      <p className="small muted" style={{ margin: 0 }}>
        {t('Ordine')} <Link to={`/orders/${ret.order_id}`}>{ret.order?.order_number}</Link> · {ret.order?.customer_name ?? '—'}
        {ret.order?.customer_email ? ` · ${ret.order.customer_email}` : ''} · {storeName} · {fmtDate(ret.created_at)}</p>
      <div><strong>{t(RETURN_REASON_LABELS[ret.reason])}</strong> · {ret.resolution === 'exchange' ? t('Cambio con lo stesso prodotto')
        : `${t('Rimborso')} ${formatEuro(ret.amount_cents)} · ${t(REFUND_METHOD_LABELS[ret.refund_method ?? 'card'])}`}</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>{ret.return_items.map((ri, i) => <li key={i}>
        {ri.quantity} × {ri.order_item?.name ?? '—'} <span className="small muted">{ri.order_item?.sku} · {formatEuro(ri.order_item?.unit_price_cents ?? 0)}</span></li>)}</ul>
      {ret.note && <blockquote style={{ margin: 0, padding: '8px 12px', background: '#f6f4ee', borderRadius: 8 }}>{ret.note}</blockquote>}
      {photos.length > 0 && <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{photos.map((u) =>
        <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt={t('Foto del cliente')} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} /></a>)}</div>}
      {ret.decision_note && <p className="small" style={{ margin: 0 }}>{t('Nota della decisione')}: {ret.decision_note}</p>}
      {ret.voucher_code && <p style={{ margin: 0 }}>{t('Buono emesso')}: <strong>{ret.voucher_code}</strong> ({formatEuro(ret.refund_cents ?? 0)})</p>}
      {ret.status === 'refunded' && ret.refund_method === 'card' && <p style={{ margin: 0 }}>{t('Rimborsato sulla carta')}: {formatEuro(ret.refund_cents ?? 0)}</p>}
      {error && <Notice tone="error">{error}</Notice>}

      {ret.status === 'requested' && (manager ? <>
        <Field label={t('Nota per il cliente')} hint={t('Obbligatoria se rifiuti: il cliente la riceve via email.')}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} /></Field>
        <div className="row" style={{ gap: 8 }}>
          <button disabled={busy} onClick={() => run(rpc('staff_decide_return', { p_id: ret.id, p_approve: true, p_note: note || null }),
            t('{n} approvato: il cliente porterà gli articoli in negozio.', { n: ret.return_number }))}>{t('Approva')}</button>
          <button className="danger-outline" disabled={busy || !note.trim()} onClick={() => run(rpc('staff_decide_return', { p_id: ret.id, p_approve: false, p_note: note }),
            t('{n} rifiutato.', { n: ret.return_number }))}>{t('Rifiuta')}</button>
        </div>
      </> : <Notice tone="warn">{t('In attesa dell’approvazione di un responsabile.')}</Notice>)}

      {ret.status === 'approved' && <>
        <p className="small muted" style={{ margin: 0 }}>{t('Controlla gli articoli quando il cliente li porta in negozio, poi registra la consegna.')}</p>
        <div><button disabled={busy} onClick={() => run(rpc('staff_receive_return', { p_id: ret.id }), t('Articoli del reso {n} ricevuti.', { n: ret.return_number }))}>
          {t('Articoli ricevuti in negozio')}</button></div>
      </>}

      {ret.status === 'received' && ret.resolution === 'exchange' && <div>
        <button disabled={busy} onClick={() => run(rpc('staff_complete_exchange', { p_id: ret.id }), t('Cambio {n} completato.', { n: ret.return_number }))}>
          {t('Prodotto sostitutivo consegnato')}</button></div>}

      {ret.status === 'received' && ret.resolution === 'refund' && (manager ? <>
        <Field label={t('Importo da rimborsare (€)')} hint={t('Al massimo {max}: il valore pagato per gli articoli resi.', { max: formatEuro(ret.amount_cents) })}>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!amountOk} style={{ maxWidth: 160 }} /></Field>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className={ret.refund_method === 'card' ? '' : 'secondary'} disabled={busy || !amountOk || ret.order?.payment_status === 'unpaid'}
            onClick={() => run(() => invoke('admin-refund', { return_id: ret.id, amount_cents: cents }),
              t('Rimborso di {amount} emesso sulla carta.', { amount: formatEuro(cents) }))}>{t('Rimborsa sulla carta')}</button>
          <button className={ret.refund_method === 'voucher' ? '' : 'secondary'} disabled={busy || !amountOk}
            onClick={() => run(rpc('staff_issue_return_voucher', { p_id: ret.id, p_amount_cents: cents }),
              t('Buono di {amount} emesso: il cliente riceve il codice via email.', { amount: formatEuro(cents) }))}>{t('Emetti buono')}</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>{t('Il cliente ha scelto: {m}.', { m: t(REFUND_METHOD_LABELS[ret.refund_method ?? 'card']) })}</p>
      </> : <Notice tone="warn">{t('Il rimborso lo emette un responsabile.')}</Notice>)}
    </div>
  </Modal>;
}
