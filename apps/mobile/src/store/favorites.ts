import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Saved products ("Preferiti"), kept on this device. Only ids: product data is always fetched fresh. */
type FavoritesState = {
  ids: string[];
  toggle: (productId: string) => void;
  remove: (productId: string) => void;
};

export const useFavorites = create<FavoritesState>()(persist((set) => ({
  ids: [],
  toggle: (productId) => set((s) => ({
    ids: s.ids.includes(productId) ? s.ids.filter((id) => id !== productId) : [productId, ...s.ids].slice(0, 200),
  })),
  remove: (productId) => set((s) => ({ ids: s.ids.filter((id) => id !== productId) })),
}), { name: 'casa-te-favorites-v1', skipHydration: true, storage: createJSONStorage(() => AsyncStorage) }));
