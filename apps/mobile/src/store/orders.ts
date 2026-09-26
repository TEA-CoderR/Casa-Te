import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Order } from '@/types/order';

type OrdersState = {
  orders: Order[];
  addOrder: (order: Order) => Promise<void>;
};

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      orders: [],
      addOrder: async (order) => {
        const orders = [order, ...get().orders];
        await AsyncStorage.setItem('casa-te-orders', JSON.stringify({ state: { orders }, version: 0 }));
        set({ orders });
      },
    }),
    {
      name: 'casa-te-orders',
      skipHydration: true,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
