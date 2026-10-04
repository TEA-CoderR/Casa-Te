import { useEffect, useState, type DragEvent } from 'react';
import { formatEuro, productImageUrl, type ProductRow } from '@casa-te/shared';
import { SUPABASE_URL, supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync } from '../lib/data';
import { t } from '../lib/i18n';
import { Empty, Loading, Notice, PageHead } from '../components/ui';
import { Icon } from '../components/Icon';

type Kind = 'featured' | 'offer';
type Row = Pick<ProductRow, 'id' | 'sku' | 'name' | 'price_cents' | 'compare_at_price_cents' | 'featured_rank' | 'offer_rank'> & {
  product_images: Array<{ path: string; sort: number }>;
};

/** How many products each home row shows on the widest screens (the rest are on the "see all" page). */
const ON_HOME = 5;
const discount = (p: Row) => p.compare_at_price_cents && p.compare_at_price_cents > p.price_cents
  ? Math.floor(((p.compare_at_price_cents - p.price_cents) * 100) / p.compare_at_price_cents) : 0;

/** The shop's default order: positioned products first, then name (In evidenza) or biggest discount (In offerta). */
function defaultOrder(kind: Kind, rows: Row[]): Row[] {
  const rank = (p: Row) => (kind === 'featured' ? p.featured_rank : p.offer_rank) ?? Number.MAX_SAFE_INTEGER;
  return [...rows].sort((a, b) => rank(a) - rank(b)
    || (kind === 'offer' ? discount(b) - discount(a) : 0) || a.name.localeCompare(b.name, 'it'));
}

export function ShowcasePage() {
  const [kind, setKind] = useState<Kind>('featured');
  const data = useAsync(async () => {
    const select = 'id,sku,name,price_cents,compare_at_price_cents,featured_rank,offer_rank,product_images(path,sort)';
    const [featured, offers] = await Promise.all([
      supabase.from('products').select(select).eq('active', true).eq('featured', true).limit(500),
      supabase.from('products').select(select).eq('active', true).not('compare_at_price_cents', 'is', null).limit(500),
    ]);
    return {
      featured: defaultOrder('featured', unwrap(featured) as unknown as Row[]),
      offer: defaultOrder('offer', (unwrap(offers) as unknown as Row[]).filter((p) => discount(p) > 0)),
    };
  }, []);
  const [list, setList] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);

  useEffect(() => { if (data.data) { setList(data.data[kind]); setDirty(false); } }, [data.data, kind]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setList(next); setDirty(true); setSaved(false);
  };
  const save = async (ids: string[]) => {
    setBusy(true); setError(''); setSaved(false);
    try {
      unwrap(await supabase.rpc('admin_set_showcase_order', { p_kind: kind, p_product_ids: ids }));
      await data.reload(); setSaved(true);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const switchTo = (next: Kind) => {
    if (next === kind) return;
    if (dirty && !window.confirm(t('Ci sono modifiche non salvate. Uscire senza salvare?'))) return;
    setKind(next); setSaved(false); setError('');
  };
  const onDrop = (e: DragEvent, index: number) => { e.preventDefault(); if (dragged !== null) move(dragged, index); setDragged(null); };
  const ranked = list.some((p) => (kind === 'featured' ? p.featured_rank : p.offer_rank) !== null);

  return <>
    <PageHead title={t('Vetrina home')}
      subtitle={t("Scegli l'ordine dei prodotti nelle righe «In evidenza» e «In offerta» della home del negozio online.")} />
    <div className="seg" role="tablist" style={{ marginBottom: 16 }}>
      <button role="tab" aria-selected={kind === 'featured'} className={kind === 'featured' ? 'on' : ''} onClick={() => switchTo('featured')}>
        {t('In evidenza')}{data.data ? ` (${data.data.featured.length})` : ''}</button>
      <button role="tab" aria-selected={kind === 'offer'} className={kind === 'offer' ? 'on' : ''} onClick={() => switchTo('offer')}>
        {t('In offerta')}{data.data ? ` (${data.data.offer.length})` : ''}</button>
    </div>
    <p className="small muted" style={{ marginTop: 0 }}>
      {kind === 'featured'
        ? t('Prodotti con la stella in Gestione prodotti. Trascina le righe o usa le frecce, poi salva.')
        : t('Prodotti con un prezzo barrato più alto del prezzo. Trascina le righe o usa le frecce, poi salva.')}
      {' '}{t('I primi {n} sono quelli visibili in home.', { n: ON_HOME })}
    </p>
    {error && <Notice tone="error">{error}</Notice>}
    {saved && <p className="small" style={{ color: 'var(--green, #1F4A33)' }}>{t('Ordine salvato.')}</p>}
    {!data.data ? <Loading /> : !list.length ? <Empty>{kind === 'featured'
      ? t('Nessun prodotto in evidenza: aggiungi la stella ai prodotti in Gestione prodotti.')
      : t('Nessun prodotto in offerta: imposta un prezzo barrato nella scheda del prodotto.')}</Empty>
      : <div className="table-wrap"><table className="showcase">
        <thead><tr><th style={{ width: 56 }}>#</th><th>{t('Prodotto')}</th><th className="num">{t('Prezzo')}</th><th style={{ width: 120 }}></th></tr></thead>
        <tbody>{list.map((p, i) => {
          const img = productImageUrl(SUPABASE_URL, [...p.product_images].sort((a, b) => a.sort - b.sort)[0]?.path);
          return <tr key={p.id} draggable onDragStart={() => setDragged(i)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, i)}
            onDragEnd={() => setDragged(null)} className={[dragged === i ? 'dragging' : '', i === ON_HOME - 1 ? 'home-cut' : ''].join(' ')}>
            <td><span className="drag-handle" aria-hidden><Icon name="menu" size={15} /></span><strong>{i + 1}</strong></td>
            <td><div className="cat-name">{img ? <img className="cat-cover" src={img} alt="" /> : <span className="cat-cover" />}
              <span>{p.name}<div className="small muted">{p.sku}{i < ON_HOME ? ` · ${t('in home')}` : ''}</div></span></div></td>
            <td className="num">{formatEuro(p.price_cents)}{kind === 'offer' && <div className="small" style={{ color: '#D62828' }}>-{discount(p)}%</div>}</td>
            <td className="row-actions">
              <button className="ghost icon-btn" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={t('Sposta su')}>
                <span className="flip"><Icon name="chevronDown" size={16} /></span></button>
              <button className="ghost icon-btn" disabled={i === list.length - 1} onClick={() => move(i, i + 1)} aria-label={t('Sposta giù')}>
                <Icon name="chevronDown" size={16} /></button>
              <button className="ghost small" disabled={i === 0} onClick={() => move(i, 0)}>{t('In cima')}</button>
            </td>
          </tr>;
        })}</tbody>
      </table></div>}
    {!!list.length && <div className="toolbar" style={{ marginTop: 16 }}>
      <button disabled={!dirty || busy} onClick={() => save(list.map((p) => p.id))}>{busy ? t('Salvataggio…') : t('Salva ordine')}</button>
      {dirty && <button className="secondary" disabled={busy} onClick={() => { setList(data.data![kind]); setDirty(false); }}>{t('Annulla modifiche')}</button>}
      {ranked && !dirty && <button className="secondary" disabled={busy} onClick={() => save([])}>
        {kind === 'featured' ? t('Torna all’ordine alfabetico') : t('Torna all’ordine per sconto')}</button>}
    </div>}
  </>;
}
