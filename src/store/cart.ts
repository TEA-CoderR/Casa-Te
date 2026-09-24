import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { products } from '@/data/products';
import { validQuantity } from '@/domain/cart';
export { getCartSnapshot } from '@/domain/cart';

type CartState = {
  items: Record<string, number>;
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: {},
      add: (productId, quantity = 1) =>
        set((state) => !validQuantity(quantity) || !products.some((p) => p.id === productId && p.available) ? state : ({
          items: {
            ...state.items,
            [productId]: (state.items[productId] ?? 0) + quantity,
          },
        })),
      setQuantity: (productId, quantity) =>
        set((state) => {
          if (!Number.isSafeInteger(quantity) || !products.some((p) => p.id === productId && p.available)) return state;
          const next = { ...state.items };
          if (quantity <= 0) delete next[productId];
          else next[productId] = quantity;
          return { items: next };
        }),
      remove: (productId) =>
        set((state) => {
          const next = { ...state.items };
          delete next[productId];
          return { items: next };
        }),
      clear: () => set({ items: {} }),
    }),
    {
      name: 'casa-te-cart',
      skipHydration: true,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);


