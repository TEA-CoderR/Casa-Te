import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProductReviewRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync } from '../lib/data';
import { t } from '../lib/i18n';
import { Loading, Notice, PageHead, Success, fmtDate } from '../components/ui';

type Row = ProductReviewRow & { hidden: boolean; product: { name: string; sku: string } | null };
type Filter = 'all' | 'visible' | 'hidden';

const stars = (n: number) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

/** Reviews are written by verified buyers only; managers can hide or delete them. */
export function ReviewsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const reviews = useAsync(async () => {
    let q = supabase.from('product_reviews').select('id,product_id,author_name,rating,comment,created_at,hidden,product:products(name,sku)')
      .order('created_at', { ascending: false }).limit(200);
    if (filter === 'visible') q = q.eq('hidden', false);
    if (filter === 'hidden') q = q.eq('hidden', true);
    return unwrap(await q) as unknown as Row[];
  }, [filter]);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const setHidden = async (r: Row, hidden: boolean) => {
    setBusy(r.id); setError(''); setDone('');
    try {
      unwrap(await supabase.from('product_reviews').update({ hidden }).eq('id', r.id));
      setDone(hidden ? t('Recensione di {name} nascosta: non conta più nella media.', { name: r.author_name })
        : t('Recensione di {name} di nuovo visibile.', { name: r.author_name }));
      await reviews.reload();
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };
  const remove = async (r: Row) => {
    if (!window.confirm(t('Eliminare definitivamente la recensione di {name}? Il cliente potrà scriverne una nuova.', { name: r.author_name }))) return;
    setBusy(r.id); setError(''); setDone('');
    try {
      unwrap(await supabase.from('product_reviews').delete().eq('id', r.id));
      setDone(t('Recensione eliminata.'));
      await reviews.reload();
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };

  return <>
    <PageHead title={t('Recensioni')} subtitle={t('Scritte solo da clienti che hanno acquistato il prodotto. Nascondi quelle non appropriate: la media si aggiorna da sola.')} />
    <div className="row" role="radiogroup" aria-label={t('Filtro')} style={{ marginBottom: 12 }}>
      {([['all', 'Tutte'], ['visible', 'Visibili'], ['hidden', 'Nascoste']] as const).map(([id, label]) =>
        <button key={id} type="button" role="radio" aria-checked={filter === id} className={filter === id ? '' : 'secondary'} onClick={() => setFilter(id)}>{t(label)}</button>)}
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {done && <Success onDismiss={() => setDone('')}>{done}</Success>}
    {!reviews.data ? (reviews.error ? <Notice tone="error">{reviews.error}</Notice> : <Loading />)
      : !reviews.data.length ? <p className="muted">{filter === 'hidden' ? t('Nessuna recensione nascosta.') : t('Nessuna recensione.')}</p>
      : <div className="table-wrap"><table>
        <thead><tr><th>{t('Data')}</th><th>{t('Prodotto')}</th><th>{t('Valutazione')}</th><th>{t('Recensione')}</th><th>{t('Stato')}</th><th></th></tr></thead>
        <tbody>{reviews.data.map((r) => <tr key={r.id}>
          <td className="small">{fmtDate(r.created_at)}</td>
          <td>{r.product ? <Link to={`/products/${r.product_id}`}>{r.product.name}</Link> : '—'}<div className="small muted">{r.product?.sku}</div></td>
          <td aria-label={t('{n} su 5', { n: r.rating })} style={{ color: '#B07A1E', whiteSpace: 'nowrap' }}>{stars(r.rating)}</td>
          <td style={{ maxWidth: 420 }}><strong>{r.author_name}</strong><div className="small">{r.comment || <span className="muted">{t('Senza commento')}</span>}</div></td>
          <td>{r.hidden ? <span className="badge muted">{t('Nascosta')}</span> : <span className="badge">{t('Visibile')}</span>}</td>
          <td className="num" style={{ whiteSpace: 'nowrap' }}>
            <button className="ghost" disabled={busy === r.id} onClick={() => setHidden(r, !r.hidden)}>{r.hidden ? t('Mostra') : t('Nascondi')}</button>
            <button className="ghost danger" disabled={busy === r.id} onClick={() => remove(r)}>{t('Elimina')}</button>
          </td>
        </tr>)}</tbody></table></div>}
  </>;
}
