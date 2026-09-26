import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** The customer's chosen store: drives stock shown in the catalogue and fulfilment of orders. */
export const usePreferences = create<{
  storeId: string | null;
  setStoreId: (storeId: string) => void;
}>()(persist((set) => ({
  storeId: null,
  setStoreId: (storeId) => set({ storeId }),
}), { name: 'casa-te-preferences-v2', skipHydration: true, storage: createJSONStorage(() => AsyncStorage) }));
