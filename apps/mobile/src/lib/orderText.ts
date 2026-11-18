import { orderStatusLabel, type FulfilmentMethod, type OrderStatus } from '@casa-te/shared';

/**
 * Order status in the customer's words (plan F3). The back office keeps `orderStatusLabel` ("Pagato" is right for
 * staff); a customer who has just paid reads "Ordine ricevuto", as the timeline already says.
 */
export function customerOrderStatus(status: OrderStatus, fulfilment: FulfilmentMethod): string {
  if (status === 'paid') return 'Ordine ricevuto';
  if (status === 'picking') return 'In preparazione';
  if (status === 'ready' && fulfilment === 'store') return 'Pronto per il ritiro';
  return orderStatusLabel(status, fulfilment);
}
