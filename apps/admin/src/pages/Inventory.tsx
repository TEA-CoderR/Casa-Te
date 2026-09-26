import { useState } from 'react';
import type { InventoryMovementRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync, useDebounced, useStores } from '../lib/data';
import { useAuth } from '../lib/auth';
import { Empty, Loading, Modal, Notice, PageHead, Pager, fmtDate } from '../components/ui';

type Row = { id: string; sku: string; name: string; barcode: string | null; inventory: Array<{ store_id: string; quantity: number }> };
const PAGE = 50;
const REASON: Record<InventoryMovementRow['reason'], string> = {
  order_reserve: 'Ordine online', order_release: 'Ordine annullato', manual: 'Modifica manuale', import: 'Import CSV', stocktake: 'Inventario',
};

export function InventoryPage() {
  const { staff, can } = useAuth();
  const stores = useStores();
  const [storeId, setStoreId] = useState(staff?.store_id ?? '');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim().toLowerCase());
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Row | null>(null);
  const activeStore = storeId || stores.data?.[0]?.id || '';

  const rows = useAsync(async () => {
    if (!activeStore) return { rows: [] as Row[], count: 0 };
    let query = supabase.from('products').select('id,sku,name,barcode,inventory(store_id,quantity)', { count: 'exact' }).eq('inventory.store_id', activeStore);
    if (q) query = query.ilike('search_text', `%${q.replace(/[%,()]/g, ' ')}%`);
    const res = await query.order('name').range(page * PAGE, page * PAGE + PAGE - 1);
    return { rows: unwrap(res) as Row[], count: res.count ?? 0 };
  }, [activeStore, q, page]);

  const movements = useAsync(async () => history ? unwrap(await supabase.from('inventory_movements').select('*')
    .eq('product_id', history.id).eq('store_id', activeStore).order('created_at', { ascending: false }).limit(100)) as InventoryMovementRow[] : [], [history?.id, activeStore]);

  const qty = (r: Row) => r.inventory[0]?.quantity ?? 0;
  const visible = (rows.data?.rows ?? []).filter((r) => !lowOnly || qty(r) <= 3);

  const save = async () => {
    setBusy(true); setError(''); setSaved('');
    try {
      for (const [productId, value] of Object.entries(edits)) {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0) throw new Error('Quantità non valida.');
        unwrap(await supabase.rpc('staff_set_stock', { p_store_id: activeStore, p_product_id: productId, p_quantity: n, p_reason: 'stocktake' }));
      }
      setSaved(`${Object.keys(edits).length} giacenze aggiornate.`); setEdits({}); await rows.reload();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return <>
    <PageHead title="Magazzino" subtitle="Giacenze vendibili online per negozio. Gli ordini online le scalano automaticamente." actions={<>
      <select value={activeStore} onChange={(e) => { setStoreId(e.target.value); setEdits({}); setPage(0); }} disabled={!can('admin', 'manager')} aria-label="Negozio">
        {stores.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <button disabled={busy || !Object.keys(edits).length} onClick={save}>Salva {Object.keys(edits).length || ''} modifiche</button>
    </>} />
    <div className="toolbar">
      <input placeholder="Cerca nome, SKU, EAN (anche con lettore barcode)" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} style={{ minWidth: 320 }} aria-label="Cerca" />
      <label className="check"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Solo scorte basse (≤ 3)</label>
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {saved && <Notice>{saved}</Notice>}
    {!rows.data ? <Loading /> : !visible.length ? <Empty>Nessun prodotto.</Empty> : <div className="table-wrap"><table>
      <thead><tr><th>Prodotto</th><th>SKU / EAN</th><th className="num">Disponibili</th><th></th></tr></thead>
      <tbody>{visible.map((r) => <tr key={r.id}><td>{r.name}</td><td className="small muted">{r.sku}{r.barcode ? ` · ${r.barcode}` : ''}</td>
        <td className="num"><input type="number" min={0} style={{ width: 100, borderColor: edits[r.id] !== undefined ? 'var(--green)' : undefined }}
          value={edits[r.id] ?? String(qty(r))} aria-label={`Giacenza ${r.name}`}
          onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })} /></td>
        <td className="num"><button className="ghost" onClick={() => setHistory(r)}>Movimenti</button></td></tr>)}</tbody></table></div>}
    {rows.data && <Pager page={page} hasMore={(page + 1) * PAGE < rows.data.count} onPage={setPage} />}
    {history && <Modal title={`Movimenti · ${history.name}`} onClose={() => setHistory(null)}>
      {!movements.data ? <Loading /> : !movements.data.length ? <Empty>Nessun movimento.</Empty> : <table><thead><tr><th>Data</th><th>Causale</th><th className="num">Variazione</th></tr></thead>
        <tbody>{movements.data.map((m) => <tr key={m.id}><td>{fmtDate(m.created_at)}</td><td>{REASON[m.reason]}</td>
          <td className="num" style={{ color: m.delta < 0 ? 'var(--danger)' : 'var(--green)' }}>{m.delta > 0 ? '+' : ''}{m.delta}</td></tr>)}</tbody></table>}
    </Modal>}
  </>;
}
