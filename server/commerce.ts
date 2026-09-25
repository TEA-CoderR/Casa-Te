import { randomUUID } from 'node:crypto';
import { calculateShipping } from '../src/config/shipping';
import { stores } from '../src/config/stores';
import type { CartLine, CommerceAdapter, Quote, QuoteRequest, ReservedOrder } from '../src/commerce/types';

export class CommerceError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}

const fail = (code: string, status: number, message: string): never => { throw new CommerceError(code, status, message); };

/** The interface used by clients and tests; adapters hide fixture or future enterprise-system details. */
export function createCommerceModule(adapter: CommerceAdapter, now: () => number = Date.now) {
  const quotes = new Map<string, Quote>();
  const orders = new Map<string, ReservedOrder>();
  const requests = new Map<string, { quoteId: string; orderId: string }>();
  const orderByQuote = new Map<string, string>();
  const inFlight = new Map<string, { key: string; result: Promise<ReservedOrder> }>();
  const inFlightByKey = new Map<string, { quoteId: string; result: Promise<ReservedOrder> }>();

  function listProducts() { return adapter.listProducts(); }

  async function availability(storeId: string) {
    if (!stores.includes(storeId as typeof stores[number])) fail('STORE_UNKNOWN', 400, 'Unknown store');
    return Promise.all((await listProducts()).map(async (product) =>
      ({ sku: product.sku, quantity: await adapter.available(storeId, product.sku) })));
  }

  async function quote(input: QuoteRequest): Promise<Quote> {
    if (!input || !stores.includes(input.storeId as typeof stores[number]) ||
      !['home', 'store'].includes(input.fulfilment) || !Array.isArray(input.lines) ||
      input.lines.length < 1 || input.lines.length > 50 ||
      (input.fulfilment === 'home' && (typeof input.postalCode !== 'string' || !/^\d{5}$/.test(input.postalCode)))) {
      return fail('INVALID_QUOTE', 400, 'Invalid quote request');
    }
    const catalog = new Map((await adapter.listProducts()).map((product) => [product.sku, product]));
    const seen = new Set<string>();
    const lines = await Promise.all(input.lines.map(async (line) => {
      if (!line || typeof line.sku !== 'string' || seen.has(line.sku) ||
        !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
        return fail('INVALID_QUOTE', 400, 'Invalid cart line');
      }
      seen.add(line.sku);
      const product = catalog.get(line.sku);
      if (!product || !product.available) return fail('PRODUCT_UNAVAILABLE', 409, 'Product unavailable');
      if (await adapter.available(input.storeId, line.sku) < line.quantity) return fail('OUT_OF_STOCK', 409, 'Insufficient stock');
      return { sku: line.sku, quantity: line.quantity, name: product.name,
        unitPriceCents: product.priceCents, unitWeightGrams: product.weightGrams };
    }));
    const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
    const weightGrams = lines.reduce((sum, line) => sum + line.unitWeightGrams * line.quantity, 0);
    if (!Number.isSafeInteger(subtotalCents) || weightGrams > 10000) {
      return fail('UNSUPPORTED_CART', 409, 'This demo cannot quote orders over 10 kg');
    }
    const shippingCents = Math.round(calculateShipping({ subtotal: subtotalCents / 100,
      weightKg: weightGrams / 1000, method: input.fulfilment }) * 100);
    const result: Quote = { id: randomUUID(), expiresAt: new Date(now() + 5 * 60_000).toISOString(),
      storeId: input.storeId, fulfilment: input.fulfilment,
      postalCode: input.fulfilment === 'home' ? input.postalCode : undefined,
      lines, subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents, weightGrams };
    quotes.set(result.id, result);
    return result;
  }

  function placeOrder(quoteId: string, idempotencyKey: string): Promise<ReservedOrder> {
    if (typeof quoteId !== 'string' || typeof idempotencyKey !== 'string' ||
      idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      return Promise.reject(new CommerceError('INVALID_ORDER', 400, 'Invalid order request'));
    }
    const previous = requests.get(idempotencyKey);
    if (previous) {
      if (previous.quoteId !== quoteId) return Promise.reject(new CommerceError('IDEMPOTENCY_CONFLICT', 409, 'Key reused for another quote'));
      return Promise.resolve(orders.get(previous.orderId)!);
    }
    const pendingKey = inFlightByKey.get(idempotencyKey);
    if (pendingKey) return pendingKey.quoteId === quoteId ? pendingKey.result :
      Promise.reject(new CommerceError('IDEMPOTENCY_CONFLICT', 409, 'Key reused for another quote'));
    const pending = inFlight.get(quoteId);
    if (pending) return pending.key === idempotencyKey ? pending.result :
      Promise.reject(new CommerceError('QUOTE_ALREADY_USED', 409, 'Quote already used'));
    if (orderByQuote.has(quoteId)) return Promise.reject(new CommerceError('QUOTE_ALREADY_USED', 409, 'Quote already used'));
    const result = commitOrder(quoteId, idempotencyKey).finally(() => {
      inFlight.delete(quoteId);
      inFlightByKey.delete(idempotencyKey);
    });
    inFlight.set(quoteId, { key: idempotencyKey, result });
    inFlightByKey.set(idempotencyKey, { quoteId, result });
    return result;
  }

  async function commitOrder(quoteId: string, idempotencyKey: string): Promise<ReservedOrder> {
    const selected = quotes.get(quoteId);
    if (!selected) return fail('QUOTE_NOT_FOUND', 404, 'Quote not found');
    if (now() >= Date.parse(selected.expiresAt)) return fail('QUOTE_EXPIRED', 409, 'Quote expired');
    const catalog = new Map((await adapter.listProducts()).map((product) => [product.sku, product]));
    if (selected.lines.some((line) => !catalog.get(line.sku)?.available ||
      catalog.get(line.sku)?.priceCents !== line.unitPriceCents)) {
      return fail('PRICE_CHANGED', 409, 'Price changed; request a new quote');
    }
    const cart: CartLine[] = selected.lines.map(({ sku, quantity }) => ({ sku, quantity }));
    if (!await adapter.reserve(selected.storeId, cart)) return fail('OUT_OF_STOCK', 409, 'Stock changed; request a new quote');
    const order: ReservedOrder = { id: randomUUID(), quote: selected,
      status: 'reserved_demo', createdAt: new Date(now()).toISOString() };
    orders.set(order.id, order);
    requests.set(idempotencyKey, { quoteId, orderId: order.id });
    orderByQuote.set(quoteId, order.id);
    return order;
  }

  function getOrder(id: string): ReservedOrder {
    const order = orders.get(id);
    if (!order) return fail('ORDER_NOT_FOUND', 404, 'Order not found');
    return order;
  }

  return { listProducts, availability, quote, placeOrder, getOrder };
}
