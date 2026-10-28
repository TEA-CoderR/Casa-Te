import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, Platform } from 'react-native';
import type { CompanyRow, FulfilmentMethod, Quote, StoreRow } from '@casa-te/shared';
import { fetchAppSettings, fetchCompanies, fetchQuote, fetchStores } from './api';
import { buildLegalDocs, legalContext } from '@/content/legal';
import { useQuery } from './useQuery';
import { cartItemsInput, useCartStore } from '@/store/cart';
import { usePreferences } from '@/store/preferences';
import { useClubMember } from '@/store/club';

/** Active stores plus the customer's selected store (defaults to the first one). */
/** Club on/off and tagline from the back office (assumed on while loading). */
export function useClubSettings() {
  const q = useQuery('app-settings', fetchAppSettings);
  return { enabled: q.data?.club_enabled ?? true, tagline: q.data?.club_tagline ?? 'Vantaggi esclusivi e offerte dedicate ai nostri clienti.' };
}

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

/**
 * Home delivery / pickup points are open when an active store ships orders (admin → Negozi). While closed,
 * the shop shows them as "Prossimamente" and keeps the customer on store pickup.
 */
export function useDelivery() {
  const { stores } = useStores();
  const open = stores.some((s) => s.active && s.ships_orders);
  const fulfilment = usePreferences((s) => s.fulfilment);
  const setFulfilment = usePreferences((s) => s.setFulfilment);
  useEffect(() => {
    if (stores.length && !open && fulfilment !== 'store') setFulfilment('store');
  }, [stores.length, open, fulfilment, setFulfilment]);
  return { open, known: stores.length > 0 };
}

/** Legal companies: the operator, the seller of a store, and the legal pages built from them. */
export function useCompanies() {
  const { stores } = useStores();
  const q = useQuery<CompanyRow[]>('companies', fetchCompanies);
  const companies = q.data ?? [];
  const sellerOf = (storeId: string | null | undefined) => {
    const store = stores.find((s) => s.id === storeId);
    return companies.find((c) => c.id === store?.company_id) ?? companies.find((c) => c.is_operator) ?? null;
  };
  const docs = useMemo(() => buildLegalDocs(legalContext(companies, stores)), [companies, stores]);
  return { companies, sellerOf, docs, loading: q.loading && !q.data };
}

/** Server-side price quote for the current cart, debounced while quantities change. */
export function useCartQuote(options: { fulfilment?: FulfilmentMethod; couponCode?: string } = {}) {
  const items = useCartStore((s) => s.items);
  const { selected } = useStores();
  const input = useMemo(() => cartItemsInput(items), [items]);
  // Joining or leaving the Club changes the member prices in the quote.
  const member = useClubMember();
  const key = selected && input.length
    ? JSON.stringify([selected.id, input, options.fulfilment ?? null, options.couponCode ?? null, member]) : null;
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
