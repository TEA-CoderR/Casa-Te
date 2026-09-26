import type { FulfilmentMethod } from './shipping';

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'picking'
  | 'ready'
  | 'shipped'
  | 'completed'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'paid' | 'partially_refunded' | 'refunded' | 'failed';

export type StaffRole = 'admin' | 'manager' | 'store_staff';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'In attesa di pagamento',
  paid: 'Pagato',
  picking: 'In preparazione',
  ready: 'Pronto',
  shipped: 'Spedito',
  completed: 'Completato',
  cancelled: 'Annullato',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Non pagato',
  paid: 'Pagato',
  partially_refunded: 'Rimborsato parzialmente',
  refunded: 'Rimborsato',
  failed: 'Pagamento non riuscito',
};

/** Customer-facing label for "ready" depends on the fulfilment method. */
export function orderStatusLabel(status: OrderStatus, fulfilment: FulfilmentMethod): string {
  if (status === 'ready') return fulfilment === 'store' ? 'Pronto per il ritiro' : 'Pronto per la spedizione';
  if (status === 'completed') return fulfilment === 'store' ? 'Ritirato' : 'Consegnato';
  return ORDER_STATUS_LABELS[status];
}

/**
 * Staff-driven status transitions. Mirrors `public.staff_set_order_status` in SQL.
 * pending_payment -> paid / cancelled is driven by the payment system only.
 */
export function allowedNextStatuses(status: OrderStatus, fulfilment: FulfilmentMethod): OrderStatus[] {
  switch (status) {
    case 'paid': return ['picking', 'cancelled'];
    case 'picking': return ['ready', 'cancelled'];
    case 'ready': return fulfilment === 'store' ? ['completed', 'cancelled'] : ['shipped', 'cancelled'];
    case 'shipped': return ['completed'];
    default: return [];
  }
}

/** Ordered steps shown in the customer timeline. */
export function orderTimeline(fulfilment: FulfilmentMethod): OrderStatus[] {
  return fulfilment === 'store'
    ? ['paid', 'picking', 'ready', 'completed']
    : ['paid', 'picking', 'ready', 'shipped', 'completed'];
}
