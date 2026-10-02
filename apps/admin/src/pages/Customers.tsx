import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ProfileRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { useAsync, useDebounced, useStores } from '../lib/data';
import { downloadCsv, toCsv } from '../lib/csv';
import { t } from '../lib/i18n';
import { Empty, Loading, Notice, PageHead, Pager, fmtDate } from '../components/ui';

const PAGE = 50;

export function CustomersPage() {
  const stores = useStores();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search.trim());
  const [marketingOnly, setMarketingOnly] = useState(false);
  const [page, setPage] = useState(0);

  const build = () => {
    let query = supabase.from('profiles').select('*', { count: 'exact' });
    if (q) { const s = q.replace(/[%,()]/g, ' '); query = query.or(`email.ilike.%${s}%,full_name.ilike.%${s}%,phone.ilike.%${s}%`); }
    if (marketingOnly) query = query.eq('marketing_opt_in', true);
    return query.order('created_at', { ascending: false });
  };
  const customers = useAsync(async () => {
    const res = await build().range(page * PAGE, page * PAGE + PAGE - 1);
    return { rows: unwrap(res) as ProfileRow[], count: res.count ?? 0 };
  }, [q, marketingOnly, page]);

  const storeName = (id: string | null) => stores.data?.find((s) => s.id === id)?.name ?? '—';

  const exportMarketing = async () => {
    const rows = unwrap(await supabase.from('profiles').select('*').eq('marketing_opt_in', true).limit(50000)) as ProfileRow[];
    downloadCsv(`consensi-marketing-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map((r) => ({
      email: r.email, nome: r.full_name, telefono: r.phone, negozio: storeName(r.preferred_store_id), registrato: r.created_at, aggiornato: r.updated_at,
    })), ['email', 'nome', 'telefono', 'negozio', 'registrato', 'aggiornato']));
  };

  return <>
    <PageHead title={t('Clienti')} subtitle={customers.data ? t('{n} clienti registrati', { n: customers.data.count }) : undefined}
      actions={<button className="secondary" onClick={exportMarketing}>{t('Esporta consensi marketing')}</button>} />
    <div className="toolbar">
      <input placeholder={t('Email, nome, telefono')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} style={{ minWidth: 260 }} aria-label={t('Cerca')} />
      <label className="check"><input type="checkbox" checked={marketingOnly} onChange={(e) => { setMarketingOnly(e.target.checked); setPage(0); }} /> {t('Solo con consenso marketing')}</label>
    </div>
    {customers.error && <Notice tone="error">{customers.error}</Notice>}
    {!customers.data ? <Loading /> : !customers.data.rows.length ? <Empty>{t('Nessun cliente.')}</Empty> : <div className="table-wrap"><table>
      <thead><tr><th>{t('Cliente')}</th><th>{t('Telefono')}</th><th>{t('Negozio preferito')}</th><th>{t('Marketing')}</th><th>{t('Registrato')}</th><th></th></tr></thead>
      <tbody>{customers.data.rows.map((c) => <tr key={c.id}><td><strong>{c.full_name ?? '—'}</strong><div className="small muted">{c.email}</div></td>
        <td>{c.phone ?? '—'}</td><td>{storeName(c.preferred_store_id)}</td>
        <td>{c.marketing_opt_in ? <span className="badge">{t('Sì')}</span> : <span className="badge muted">{t('No')}</span>}</td>
        <td>{fmtDate(c.created_at)}</td>
        <td className="num">{c.email && <Link to={`/orders?q=${encodeURIComponent(c.email)}`}>{t('Ordini')}</Link>}</td></tr>)}</tbody></table></div>}
    {customers.data && <Pager page={page} hasMore={(page + 1) * PAGE < customers.data.count} onPage={setPage} />}
  </>;
}
