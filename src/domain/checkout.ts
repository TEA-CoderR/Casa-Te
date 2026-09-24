import { getCartSnapshot } from '@/domain/cart';
import { calculateShipping, type FulfilmentMethod } from '@/config/shipping';
import type { StoreName } from '@/config/stores';
import type { DeliveryAddress, Order, PaymentMethod } from '@/types/order';

export type CheckoutDetails = {
  method: FulfilmentMethod;
  payment: PaymentMethod;
  store: StoreName;
  address: DeliveryAddress;
};

export function createDemoOrder(items: Record<string, number>, details: CheckoutDetails): Order {
  const { lines, subtotal, totalWeightKg, itemCount } = getCartSnapshot(items);
  if (!itemCount) throw new Error('Il carrello è vuoto.');
  if (details.method === 'home' && (
    !details.address.name.trim() || !details.address.address.trim() ||
    !details.address.city.trim() || !/^\d{5}$/.test(details.address.cap.trim())
  )) throw new Error('Inserisci nome, indirizzo, città e un CAP di 5 cifre.');
  const shipping = calculateShipping({ subtotal, weightKg: totalWeightKg, method: details.method });
  return {
    id: `CT${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    total: Math.round((subtotal + shipping) * 100) / 100,
    subtotal, shipping, totalWeightKg, itemCount,
    fulfilment: details.method, status: 'confirmed', payment: details.payment,
    store: details.store,
    address: details.method === 'home' ? { ...details.address } : undefined,
    lines: lines.map(({ product, quantity }) => ({ product: { ...product }, quantity })),
  };
}
