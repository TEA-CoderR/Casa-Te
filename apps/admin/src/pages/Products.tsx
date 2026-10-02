import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatEuro, formatWeight, productImageUrl, type ProductRow } from '@casa-te/shared';
import { SUPABASE_URL, supabase, unwrap } from '../lib/supabase';
import { useAsync, useCategories, useDebounced } from '../lib/data';
import { downloadCsv, toCsv } from '../lib/csv';
import { Empty, Loading, Notice, PageHead, Pager } from '../components/ui';

type Row = ProductRow & { product_images: Array<{ path: string; sort: number }>; inventory: Array<{ quantity: number }> };
const PAGE = 50;

export function ProductsPage() {
  const navigate = useNavigate();
  const categories = useCategories();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim().toLowerCase());
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(0);

  const products = useAsync(async () => {
    let query = supabase.from('products').select('*, product_images(path,sort), inventory(quantity)', { count: 'exact' });
    if (q) query = query.ilike('search_text', `%${q.replace(/[%,()]/g, ' ')}%`);
    if (categoryId) query = query.eq('category_id', categoryId);
    if (status !== 'all') query = query.eq('active', status === 'active');
    const res = await query.order('name').range(page * PAGE, page * PAGE + PAGE - 1);
    return { rows: unwrap(res) as Row[], count: res.count ?? 0 };
  }, [q, categoryId, status, page]);

  const catName = (id: string | null) => categories.data?.find((c) => c.id === id)?.name ?? '—';

  const exportCatalog = async () => {
    const rows = unwrap(await supabase.from('products').select('*, product_images(path,sort)').order('sku').limit(10000)) as Row[];
    downloadCsv('catalogo.csv', toCsv(rows.map((p) => ({
      sku: p.sku, nome: p.name, categoria: catName(p.category_id), prezzo: (p.price_cents / 100).toFixed(2).replace('.', ','),
      'prezzo barrato': p.compare_at_price_cents ? (p.compare_at_price_cents / 100).toFixed(2).replace('.', ',') : '',
      iva: p.vat_rate, 'peso kg': (p.weight_g / 1000).toFixed(3).replace('.', ','), ean: p.barcode ?? '', marca: p.brand ?? '',
      descrizione: p.description ?? '', attivo: p.active ? 'si' : 'no', 'in evidenza': p.featured ? 'si' : 'no',
      immagine: productImageUrl(SUPABASE_URL, [...p.product_images].sort((a, b) => a.sort - b.sort)[0]?.path) ?? '',
    })), ['sku', 'nome', 'categoria', 'prezzo', 'prezzo barrato', 'iva', 'peso kg', 'ean', 'marca', 'descrizione', 'attivo', 'in evidenza', 'immagine']));
  };

  return <>
    <PageHead title="Prodotti" subtitle={products.data ? `${products.data.count} prodotti` : undefined} actions={<>
      <button className="secondary" onClick={exportCatalog}>Esporta CSV</button>
      <Link to="/import" className="btn secondary">Importa da Excel</Link>
      <Link to="/products/new" className="btn">Nuovo prodotto</Link>
    </>} />
    <div className="toolbar">
      <input placeholder="Cerca nome, marca, SKU, EAN" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} style={{ minWidth: 260 }} aria-label="Cerca" />
      <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(0); }} aria-label="Categoria">
        <option value="">Tutte le categorie</option>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }} aria-label="Stato">
        <option value="all">Tutti</option><option value="active">Pubblicati</option><option value="inactive">Non pubblicati</option></select>
    </div>
    {products.error && <Notice tone="error">{products.error}</Notice>}
    {!products.data ? <Loading /> : !products.data.rows.length ? <Empty>Nessun prodotto. Importa il catalogo da CSV o crea un prodotto.</Empty> :
      <div className="table-wrap"><table>
        <thead><tr><th></th><th>Prodotto</th><th>Categoria</th><th className="num">Prezzo</th><th className="num">Peso</th><th className="num">Stock totale</th><th>Stato</th></tr></thead>
        <tbody>{products.data.rows.map((p) => {
          const img = productImageUrl(SUPABASE_URL, [...p.product_images].sort((a, b) => a.sort - b.sort)[0]?.path);
          const stock = p.inventory.reduce((s, i) => s + i.quantity, 0);
          return <tr key={p.id} className="clickable" onClick={() => navigate(`/products/${p.id}`)}>
            <td style={{ width: 56 }}>{img ? <img className="thumb" src={img} alt="" /> : <div className="thumb" />}</td>
            <td><Link to={`/products/${p.id}`} className="row-link" onClick={(e) => e.stopPropagation()}>{p.name}</Link><div className="small muted">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}{p.brand ? ` · ${p.brand}` : ''}</div></td>
            <td>{catName(p.category_id)}</td>
            <td className="num">{formatEuro(p.price_cents)}{p.compare_at_price_cents ? <div className="small muted" style={{ textDecoration: 'line-through' }}>{formatEuro(p.compare_at_price_cents)}</div> : null}</td>
            <td className="num">{formatWeight(p.weight_g)}</td>
            <td className="num"><span className={`badge ${stock === 0 ? 'bad' : stock <= 3 ? 'warn' : 'muted'}`}>{stock}</span></td>
            <td>{p.active ? <span className="badge">Pubblicato</span> : <span className="badge muted">Non pubblicato</span>}{p.featured && <span className="badge flag" style={{ marginLeft: 4 }}>In evidenza</span>}</td>
          </tr>;
        })}</tbody></table></div>}
    {products.data && <Pager page={page} hasMore={(page + 1) * PAGE < products.data.count} onPage={setPage} />}
  </>;
}
