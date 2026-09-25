export type PilotFulfilment = 'home' | 'store';

export type CatalogItem = {
  sku: string;
  name: string;
  priceCents: number;
  weightGrams: number;
  available: boolean;
};

export type CartLine = { sku: string; quantity: number };

export type QuoteRequest = {
  lines: CartLine[];
  storeId: string;
  fulfilment: PilotFulfilment;
  postalCode?: string;
};

export type Quote = Omit<QuoteRequest, 'lines'> & {
  id: string;
  expiresAt: string;
  lines: Array<CartLine & { name: string; unitPriceCents: number; unitWeightGrams: number }>;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  weightGrams: number;
};

export type ReservedOrder = {
  id: string;
  quote: Quote;
  status: 'reserved_demo';
  createdAt: string;
};

/** A real ERP/PIM/POS adapter replaces the fixture. reserve must check and decrement atomically. */
export interface CommerceAdapter {
  listProducts(): Promise<CatalogItem[]>;
  available(storeId: string, sku: string): Promise<number>;
  reserve(storeId: string, lines: CartLine[]): Promise<boolean>;
}
