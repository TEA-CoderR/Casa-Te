// Returns and after-sales (resi e assistenza): labels and rules shared by the app and the admin.
import type { Uuid, Timestamp } from './database';

export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'received' | 'refunded' | 'exchanged' | 'cancelled';
export type ReturnReason = 'changed_mind' | 'damaged' | 'wrong_item' | 'missing' | 'other';
export type ReturnResolution = 'refund' | 'exchange';
export type RefundMethod = 'card' | 'voucher';

export type ReturnItemRow = { return_id: Uuid; order_item_id: Uuid; quantity: number };
export type ReturnRequestRow = {
  id: Uuid; return_number: string; order_id: Uuid; user_id: Uuid | null; store_id: Uuid;
  status: ReturnStatus; reason: ReturnReason; note: string | null; resolution: ReturnResolution; refund_method: RefundMethod | null;
  photo_paths: string[]; amount_cents: number; refund_cents: number | null; voucher_code: string | null;
  decision_note: string | null; decided_at: Timestamp | null; received_at: Timestamp | null; completed_at: Timestamp | null;
  created_at: Timestamp; updated_at: Timestamp;
};
export type ReturnWithItems = ReturnRequestRow & { return_items: ReturnItemRow[] };

/** Change of mind: 14 days from collection/delivery (diritto di recesso). Defects: legal guarantee (2 years). */
export const RETURN_WINDOW_DAYS = 14;
export const RETURN_GUARANTEE_DAYS = 730;
/** Statuses that still hold the returned units (rejected and cancelled requests free them). */
export const RETURN_ACTIVE_STATUSES: ReturnStatus[] = ['requested', 'approved', 'received', 'refunded', 'exchanged'];

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: 'In valutazione',
  approved: 'Approvato: porta gli articoli in negozio',
  rejected: 'Non accettato',
  received: 'Articoli ricevuti in negozio',
  refunded: 'Rimborsato',
  exchanged: 'Cambio completato',
  cancelled: 'Annullato',
};

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  changed_mind: 'Ho cambiato idea',
  damaged: 'Difettoso o danneggiato',
  wrong_item: 'Articolo sbagliato',
  missing: 'Articolo mancante',
  other: 'Altro',
};

export const RESOLUTION_LABELS: Record<ReturnResolution, string> = { refund: 'Rimborso', exchange: 'Cambio con lo stesso prodotto' };
export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = { card: 'Sul metodo di pagamento', voucher: 'Buono CASA & TE' };

/** Units of each order line still returnable, given the order's returns (display only; the server checks again). */
export function returnableQuantities(items: Array<{ id: string; quantity: number }>, returns: ReturnWithItems[]): Record<string, number> {
  const held: Record<string, number> = {};
  for (const r of returns) {
    if (!RETURN_ACTIVE_STATUSES.includes(r.status)) continue;
    for (const ri of r.return_items) held[ri.order_item_id] = (held[ri.order_item_id] ?? 0) + ri.quantity;
  }
  return Object.fromEntries(items.map((i) => [i.id, Math.max(0, i.quantity - (held[i.id] ?? 0))]));
}

/** Days since the order was collected or delivered (null while it is not). */
export function daysSinceHandover(order: { status: string; completed_at: string | null; updated_at: string }, now = new Date()): number | null {
  if (order.status !== 'completed' && order.status !== 'shipped') return null;
  const from = new Date(order.completed_at ?? order.updated_at).getTime();
  return (now.getTime() - from) / 86400000;
}
