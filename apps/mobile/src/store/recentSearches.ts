import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Last searches typed in the shop, kept only on this device (newest first, at most 8). */
type RecentSearchesState = {
  terms: string[];
  remember: (term: string) => void;
  forget: (term: string) => void;
  clear: () => void;
};

const same = (a: string, b: string) => a.toLocaleLowerCase('it') === b.toLocaleLowerCase('it');

export const useRecentSearches = create<RecentSearchesState>()(persist((set) => ({
  terms: [],
  remember: (term) => {
    const t = term.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (t.length < 2) return;
    set((s) => ({ terms: [t, ...s.terms.filter((x) => !same(x, t))].slice(0, 8) }));
  },
  forget: (term) => set((s) => ({ terms: s.terms.filter((x) => x !== term) })),
  clear: () => set({ terms: [] }),
}), { name: 'casa-te-recent-searches-v1', skipHydration: true, storage: createJSONStorage(() => AsyncStorage) }));
