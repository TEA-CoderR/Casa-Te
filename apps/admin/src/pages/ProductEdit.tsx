import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { parseEuroInput, productImageUrl, type ProductImageRow, type ProductRow } from '@casa-te/shared';
import { SUPABASE_URL, supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync, useCategories, useStores } from '../lib/data';
import { Field, Loading, Notice, PageHead, Success } from '../components/ui';
import { Icon } from '../components/Icon';

type Form = {
  sku: string; name: string; slug: string; description: string; brand: string; category_id: string; price: string; compare: string;
  vat_rate: string; weight_g: string; barcode: string; max_per_order: string; active: boolean; featured: boolean;
};
const blank: Form = { sku: '', name: '', slug: '', description: '', brand: '', category_id: '', price: '', compare: '', vat_rate: '22',
  weight_g: '', barcode: '', max_per_order: '99', active: false, featured: false };

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const euros = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','));

export function ProductEditPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const categories = useCategories();
  const stores = useStores();
  const [form, setForm] = useState<Form>(blank);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  const product = useAsync(async () => isNew ? null : unwrap(await supabase.from('products').select('*').eq('id', id!).single()) as ProductRow, [id]);
  const images = useAsync(async () => isNew ? [] : unwrap(await supabase.from('product_images').select('*').eq('product_id', id!).order('sort')) as ProductImageRow[], [id]);
  const stock = useAsync(async () => isNew ? [] : unwrap(await supabase.from('inventory').select('store_id,quantity').eq('product_id', id!)) as Array<{ store_id: string; quantity: number }>, [id]);
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Form>(blank);

  useEffect(() => {
    const p = product.data;
    if (p) setForm({ sku: p.sku, name: p.name, slug: p.slug, description: p.description ?? '', brand: p.brand ?? '', category_id: p.category_id ?? '',
      price: euros(p.price_cents), compare: euros(p.compare_at_price_cents), vat_rate: String(p.vat_rate), weight_g: String(p.weight_g),
      barcode: p.barcode ?? '', max_per_order: String(p.max_per_order), active: p.active, featured: p.featured });
    if (p) setLoaded({ sku: p.sku, name: p.name, slug: p.slug, description: p.description ?? '', brand: p.brand ?? '', category_id: p.category_id ?? '',
      price: euros(p.price_cents), compare: euros(p.compare_at_price_cents), vat_rate: String(p.vat_rate), weight_g: String(p.weight_g),
      barcode: p.barcode ?? '', max_per_order: String(p.max_per_order), active: p.active, featured: p.featured });
  }, [product.data]);
  // Unsaved changes (product fields or stock) must not vanish on navigation or tab close.
  const dirty = JSON.stringify(form) !== JSON.stringify(loaded) || Object.keys(stockEdits).length > 0;
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
  const leave = () => { if (!dirty || window.confirm('Ci sono modifiche non salvate. Uscire senza salvare?')) navigate('/products'); };

  if (!isNew && !product.data) return product.error ? <Notice tone="error">{product.error}</Notice> : <Loading />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setSaved('');
    const price = parseEuroInput(form.price);
    const compare = form.compare.trim() ? parseEuroInput(form.compare) : null;
    const weight = Number(form.weight_g);
    if (!price) return setError('Prezzo non valido.');
    if (form.compare.trim() && (!compare || compare <= price)) return setError('Il prezzo barrato deve essere maggiore del prezzo.');
    if (!Number.isInteger(weight) || weight <= 0) return setError('Il peso in grammi è obbligatorio (serve per la spedizione).');
    const row = {
      sku: form.sku.trim(), name: form.name.trim(), slug: form.slug.trim() || `${slugify(form.name)}-${slugify(form.sku)}`,
      description: form.description.trim() || null, brand: form.brand.trim() || null, category_id: form.category_id || null,
      price_cents: price, compare_at_price_cents: compare, vat_rate: Number(form.vat_rate), weight_g: weight,
      barcode: form.barcode.trim() || null, max_per_order: Number(form.max_per_order) || 99, active: form.active, featured: form.featured,
    };
    setBusy(true);
    try {
      if (isNew) {
        const created = unwrap(await supabase.from('products').insert(row).select('id').single()) as { id: string };
        navigate(`/products/${created.id}`, { replace: true });
      } else {
        unwrap(await supabase.from('products').update(row).eq('id', id!));
        const stockCount = await writeStock();
        setSaved(stockCount ? `Prodotto e ${stockCount} giacenze salvati.` : 'Prodotto salvato.');
        setLoaded(form);
        await product.reload();
      }
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length || isNew) return;
    setBusy(true); setError('');
    try {
      let sort = (images.data?.length ?? 0);
      for (const file of Array.from(files)) {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Formati accettati: JPG, PNG, WEBP.');
        if (file.size > 5 * 1024 * 1024) throw new Error('Immagine troppo grande (max 5 MB).');
        const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
        const path = `${id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
        if (upErr) throw upErr;
        unwrap(await supabase.from('product_images').insert({ product_id: id, path, alt: form.name, sort: sort++ }));
      }
      await images.reload();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  const removeImage = async (img: ProductImageRow) => {
    if (!window.confirm('Eliminare questa immagine dal prodotto?')) return;
    setBusy(true);
    try {
      unwrap(await supabase.from('product_images').delete().eq('id', img.id));
      if (!/^https?:/.test(img.path)) await supabase.storage.from('product-images').remove([img.path]);
      await images.reload();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  const makeMain = async (img: ProductImageRow) => {
    setBusy(true);
    try {
      const ordered = [img, ...(images.data ?? []).filter((i) => i.id !== img.id)];
      for (const [i, im] of ordered.entries()) unwrap(await supabase.from('product_images').update({ sort: i }).eq('id', im.id));
      await images.reload();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  /** Writes pending per-store quantities; returns how many changed. Used by the single "Salva". */
  async function writeStock(): Promise<number> {
    const entries = Object.entries(stockEdits);
    for (const [storeId, value] of entries) {
      const q = Number(value);
      if (!Number.isInteger(q) || q < 0) throw new Error('Giacenza non valida: usa un numero intero da 0 in su.');
      unwrap(await supabase.rpc('staff_set_stock', { p_store_id: storeId, p_product_id: id, p_quantity: q, p_reason: 'manual' }));
    }
    if (entries.length) { setStockEdits({}); await stock.reload(); }
    return entries.length;
  }

  const pendingStock = Object.keys(stockEdits).length;
  return <>
    <PageHead title={isNew ? 'Nuovo prodotto' : form.name || 'Prodotto'} subtitle={isNew ? 'Dopo la creazione potrai aggiungere immagini e giacenze.' : `SKU ${form.sku}`}
      actions={<button className="secondary" onClick={leave}><Icon name="back" size={16} /> Prodotti</button>} />
    {error && <Notice tone="error">{error}</Notice>}
    {saved && <Success onDismiss={() => setSaved('')}>{saved}</Success>}
    <form onSubmit={save} id="product-form" className="edit-layout">
      <div className="grid" style={{ alignContent: 'start' }}>
        <fieldset className="card">
          <legend>Prodotto</legend>
          <div className="form-grid">
            <Field label="Nome *"><input value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={200} /></Field>
            <Field label="SKU / codice articolo *"><input value={form.sku} onChange={(e) => set('sku', e.target.value)} required pattern="[A-Za-z0-9._\-]{1,40}" /></Field>
            <Field label="Categoria"><select value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">Nessuna</option>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Marca"><input value={form.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
            <Field label="EAN / codice a barre"><input value={form.barcode} onChange={(e) => set('barcode', e.target.value.replace(/\D/g, ''))} maxLength={14} inputMode="numeric" /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Field label="Descrizione"><textarea value={form.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
        </fieldset>
        <fieldset className="card">
          <legend>Prezzo e spedizione</legend>
          <div className="form-grid">
            <Field label="Prezzo € (IVA inclusa) *"><input value={form.price} onChange={(e) => set('price', e.target.value)} inputMode="decimal" required placeholder="0,00" /></Field>
            <Field label="Prezzo barrato €" hint="Prezzo più basso degli ultimi 30 giorni (Omnibus)"><input value={form.compare} onChange={(e) => set('compare', e.target.value)} inputMode="decimal" /></Field>
            <Field label="IVA"><select value={form.vat_rate} onChange={(e) => set('vat_rate', e.target.value)}>{[22, 10, 5, 4, 0].map((v) => <option key={v} value={v}>{v}%</option>)}</select></Field>
            <Field label="Peso in grammi *" hint={form.weight_g ? `${(Number(form.weight_g) / 1000).toFixed(2).replace('.', ',')} kg · serve per calcolare la spedizione` : 'Serve per calcolare la spedizione'}>
              <input value={form.weight_g} onChange={(e) => set('weight_g', e.target.value.replace(/\D/g, ''))} inputMode="numeric" required /></Field>
            <Field label="Max pezzi per ordine"><input type="number" min={1} max={99} value={form.max_per_order} onChange={(e) => set('max_per_order', e.target.value)} /></Field>
            <Field label="Indirizzo pagina (slug)"><input value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="generato dal nome" /></Field>
          </div>
        </fieldset>
      </div>

      <div className="grid" style={{ alignContent: 'start' }}>
        <fieldset className="card">
          <legend>Visibilità</legend>
          <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Pubblicato, visibile ai clienti</label>
          <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} /> In evidenza nella home</label>
        </fieldset>
        {!isNew && <fieldset className="card">
          <legend>Immagini</legend>
          <div className="row">{(images.data ?? []).map((img, i) => <figure key={img.id} className="img-tile">
            <img src={productImageUrl(SUPABASE_URL, img.path) ?? ''} alt={img.alt ?? ''} />
            <figcaption className="row" style={{ justifyContent: 'center', gap: 2 }}>
              {i === 0 ? <span className="badge">Principale</span> : <button type="button" className="ghost" onClick={() => makeMain(img)} disabled={busy}>Rendi principale</button>}
              <button type="button" className="ghost danger" onClick={() => removeImage(img)} disabled={busy} aria-label="Elimina immagine"><Icon name="close" size={16} /></button>
            </figcaption>
          </figure>)}</div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
          <button type="button" className="secondary" style={{ marginTop: 10 }} onClick={() => fileInput.current?.click()} disabled={busy}>Carica immagini</button>
          <p className="small muted">JPG, PNG o WEBP fino a 5 MB. Sfondo chiaro, formato quadrato (1200 × 1200).</p>
        </fieldset>}
        {!isNew && <fieldset className="card">
          <legend>Giacenze per negozio</legend>
          <table><tbody>{stores.data?.map((s) => {
            const current = stock.data?.find((x) => x.store_id === s.id)?.quantity ?? 0;
            return <tr key={s.id}><td>{s.name}</td><td className="num" style={{ width: 120 }}>
              <input type="number" min={0} inputMode="numeric" onWheel={(e) => e.currentTarget.blur()} value={stockEdits[s.id] ?? String(current)} style={{ width: 100 }} aria-label={`Giacenza ${s.name}`}
                className={stockEdits[s.id] !== undefined ? 'edited' : undefined}
                onChange={(e) => setStockEdits({ ...stockEdits, [s.id]: e.target.value })} /></td></tr>;
          })}</tbody></table>
        </fieldset>}
      </div>
    </form>
    <div className="savebar">
      <span className={dirty && !isNew ? '' : 'muted'}>{isNew ? 'Compila i campi con * e crea il prodotto.' : dirty ? <><strong>Modifiche non salvate</strong>{pendingStock ? ` · ${pendingStock} giacenze incluse` : ''}</> : 'Tutto salvato.'}</span>
      <span className="spacer" />
      <button type="submit" form="product-form" disabled={busy}>{busy ? 'Salvataggio…' : isNew ? 'Crea prodotto' : 'Salva'}</button>
    </div>
  </>;
}
