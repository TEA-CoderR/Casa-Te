import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StoreName } from '@/config/stores';

export const usePreferences = create<{
  store: StoreName;
  setStore: (store: StoreName) => void;
}>()(persist((set) => ({
  store: 'Arezzo',
  setStore: (store) => set({ store }),
}), { name: 'casa-te-preferences', skipHydration: true, storage: createJSONStorage(() => AsyncStorage) }));
