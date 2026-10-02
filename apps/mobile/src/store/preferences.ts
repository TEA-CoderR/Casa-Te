import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { FulfilmentMethod } from '@casa-te/shared';

/** The customer's chosen store: drives stock shown in the catalogue and fulfilment of orders. */
export const usePreferences = create<{
  storeId: string | null;
  setStoreId: (storeId: string) => void;
  /** How the customer wants to receive orders; preselected in the cart and at checkout. */
  fulfilment: FulfilmentMethod;
  setFulfilment: (fulfilment: FulfilmentMethod) => void;
}>()(persist((set) => ({
  storeId: null,
  setStoreId: (storeId) => set({ storeId }),
  fulfilment: 'store',
  setFulfilment: (fulfilment) => set({ fulfilment }),
}), { name: 'casa-te-preferences-v2', skipHydration: true, storage: createJSONStorage(() => AsyncStorage) }));
