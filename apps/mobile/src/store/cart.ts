import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MAX_LINE_QUANTITY, type CartItemInput } from '@casa-te/shared';

/**
 * The cart only stores product ids and quantities. Names, prices, availability and totals are
 * always obtained from the server (quote_cart), so stale local data can never be charged.
 */
type CartState = {
  items: Record<string, number>;
  /** Lines the customer unticked: they stay in the cart but are left out of this order. */
  excluded: Record<string, true>;
  setIncluded: (productId: string, included: boolean) => void;
  /** After an order is paid: drop the lines that were ordered, keep the unticked ones. */
  removeMany: (productIds: string[]) => void;
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const clamp = (q: number) => Math.max(0, Math.min(MAX_LINE_QUANTITY, Math.floor(q)));

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: {},
      excluded: {},
      setIncluded: (productId, included) => set((state) => {
        const next = { ...state.excluded };
        if (included) delete next[productId]; else next[productId] = true;
        return { excluded: next };
      }),
      removeMany: (productIds) => set((state) => {
        const items = { ...state.items };
        const excluded = { ...state.excluded };
        for (const id of productIds) { delete items[id]; delete excluded[id]; }
        return { items, excluded };
      }),
      add: (productId, quantity = 1) => set((state) => {
        if (!Number.isFinite(quantity) || quantity <= 0) return state;
        return { items: { ...state.items, [productId]: clamp((state.items[productId] ?? 0) + quantity) } };
      }),
      setQuantity: (productId, quantity) => set((state) => {
        if (!Number.isFinite(quantity)) return state;
        const next = { ...state.items };
        const q = clamp(quantity);
        if (q <= 0) delete next[productId]; else next[productId] = q;
        return { items: next };
      }),
      remove: (productId) => set((state) => {
        const next = { ...state.items };
        delete next[productId];
        const excluded = { ...state.excluded };
        delete excluded[productId];
        return { items: next, excluded };
      }),
      clear: () => set({ items: {}, excluded: {} }),
    }),
    {
      name: 'casa-te-cart-v2',
      skipHydration: true,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export const cartItemCount = (items: Record<string, number>) => Object.values(items).reduce((s, q) => s + q, 0);

export const cartItemsInput = (items: Record<string, number>, excluded: Record<string, true> = {}): CartItemInput[] =>
  Object.entries(items).filter(([id, q]) => q > 0 && !excluded[id]).map(([product_id, quantity]) => ({ product_id, quantity }));
