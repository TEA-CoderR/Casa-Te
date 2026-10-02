import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, Platform } from 'react-native';
import type { FulfilmentMethod, Quote, StoreRow } from '@casa-te/shared';
import { fetchQuote, fetchStores } from './api';
import { useQuery } from './useQuery';
import { cartItemsInput, useCartStore } from '@/store/cart';
import { usePreferences } from '@/store/preferences';

/** Active stores plus the customer's selected store (defaults to the first one). */
export function useStores() {
  const { data: stores = [], loading, error, refetch } = useQuery<StoreRow[]>('stores', fetchStores);
  const storeId = usePreferences((s) => s.storeId);
  const setStoreId = usePreferences((s) => s.setStoreId);
  const selected = stores.find((s) => s.id === storeId) ?? null;
  useEffect(() => {
    if (stores.length && !selected) setStoreId(stores[0].id);
  }, [stores, selected, setStoreId]);
  return { stores, selected: selected ?? stores[0] ?? null, loading, error, refetch };
}

/** Server-side price quote for the current cart, debounced while quantities change. */
export function useCartQuote(options: { fulfilment?: FulfilmentMethod; couponCode?: string } = {}) {
  const items = useCartStore((s) => s.items);
  const { selected } = useStores();
  const input = useMemo(() => cartItemsInput(items), [items]);
  const key = selected && input.length
    ? JSON.stringify([selected.id, input, options.fulfilment ?? null, options.couponCode ?? null]) : null;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!key || !selected) { setQuote(null); setError(null); setLoading(false); return; }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchQuote({ store_id: selected.id, items: input, fulfilment: options.fulfilment, coupon_code: options.couponCode || undefined })
        .then((q) => { if (active) { setQuote(q); setError(null); } })
        .catch((e) => { if (active) setError(e); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { quote, error, loading, store: selected, empty: input.length === 0, refresh: () => setNonce((n) => n + 1) };
}

/** Responsive helpers for the web shop (phones use the native single-column layout). */
export function useLayout() {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= 900;
  const columns = width >= 1100 ? 4 : width >= 720 ? 3 : 2;
  return { width, wide, columns, contentWidth: Math.min(width, 1120) };
}
