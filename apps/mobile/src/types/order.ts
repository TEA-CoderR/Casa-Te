import type { FulfilmentMethod } from '@/config/shipping';
import type { StoreName } from '@/config/stores';
import type { Product } from '@/types/product';

export type PaymentMethod = 'card-demo' | 'cash-demo';
export type DeliveryAddress = { name: string; address: string; city: string; cap: string };

export type OrderStatus =
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'shipped'
  | 'delivered';

export type Order = {
  id: string;
  createdAt: string;
  total: number;
  subtotal: number;
  shipping: number;
  totalWeightKg: number;
  itemCount: number;
  fulfilment: FulfilmentMethod;
  status: OrderStatus;
  payment?: PaymentMethod;
  store?: StoreName;
  address?: DeliveryAddress;
  lines?: Array<{ product: Product; quantity: number }>;
};
