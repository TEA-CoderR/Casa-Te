import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoreRow, CategoryRow } from '@casa-te/shared';
import { supabase, unwrap } from './supabase';

export type Async<T> = { data: T | undefined; error: string | null; loading: boolean; reload: () => Promise<void> };

/** Minimal async loader; re-runs when `deps` change. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ticket = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    const t = ++ticket.current;
    setLoading(true);
    try {
      const result = await fnRef.current();
      if (t === ticket.current) { setData(result); setError(null); }
    } catch (e) {
      if (t === ticket.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (t === ticket.current) setLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, deps);
  return { data, error, loading, reload };
}

let storesCache: Promise<StoreRow[]> | null = null;
export function loadStores(force = false): Promise<StoreRow[]> {
  if (!storesCache || force) storesCache = supabase.from('stores').select('*').order('sort').then(unwrap) as Promise<StoreRow[]>;
  return storesCache;
}

export function useStores() { return useAsync(() => loadStores(), []); }

export function useCategories() {
  return useAsync(async () => unwrap(await supabase.from('categories').select('*').order('sort').order('name')) as CategoryRow[], []);
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export const ERROR_TEXT: Record<string, string> = {
  invalid_transition: 'Cambio di stato non consentito.',
  refund_required: "Rimborsa l'ordine prima di annullarlo.",
  forbidden: 'Non hai i permessi per questa operazione.',
  invalid_refund_amount: 'Importo del rimborso non valido.',
  order_not_refundable: 'Ordine non rimborsabile.',
  payment_unavailable: 'Stripe non raggiungibile o non configurato.',
  user_exists: 'Utente già esistente.',
  invalid_email: 'Email non valida.',
  store_required: 'Seleziona il negozio per il personale di negozio.',
};

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = Object.keys(ERROR_TEXT).find((k) => msg.includes(k));
  if (code) return ERROR_TEXT[code];
  if (/duplicate key.*sku/.test(msg)) return 'SKU già esistente.';
  if (/duplicate key.*slug/.test(msg)) return 'Slug già esistente.';
  if (/duplicate key.*code/.test(msg)) return 'Codice già esistente.';
  if (/row-level security|permission denied/.test(msg)) return 'Non hai i permessi per questa operazione.';
  if (/check constraint/.test(msg)) return 'Valori non validi: controlla i campi.';
  return msg;
}
