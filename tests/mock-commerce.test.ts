import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommerceModule, CommerceError } from '../server/commerce';
import { createMockCommerceAdapter } from '../src/data/mockCommerce';

const cart = [{ sku: 'carta-cucina', quantity: 2 }];

test('store pickup and home delivery receive server-calculated quotes', async () => {
  const commerce = createCommerceModule(createMockCommerceAdapter());
  const pickup = await commerce.quote({ lines: cart, storeId: 'Arezzo', fulfilment: 'store' });
  const delivery = await commerce.quote({ lines: cart, storeId: 'Arezzo', fulfilment: 'home', postalCode: '52100' });
  assert.equal(pickup.subtotalCents, 998);
  assert.equal(pickup.shippingCents, 0);
  assert.equal(delivery.shippingCents, 690);
  assert.equal(delivery.totalCents, 1688);
  assert.equal(delivery.weightGrams, 2400);
});

test('reservation reduces fictional store stock, prevents overselling, and retries are idempotent', async () => {
  const commerce = createCommerceModule(createMockCommerceAdapter());
  const quote = await commerce.quote({ lines: [{ sku: 'carta-cucina', quantity: 4 }], storeId: 'Arezzo', fulfilment: 'store' });
  const first = await commerce.placeOrder(quote.id, 'retry-key-123');
  assert.equal(first.status, 'reserved_demo');
  assert.equal((await commerce.placeOrder(quote.id, 'retry-key-123')).id, first.id);
  assert.equal((await commerce.availability('Arezzo')).find((item) => item.sku === 'carta-cucina')?.quantity, 1);
  assert.equal((await commerce.availability('Lucca 1')).find((item) => item.sku === 'carta-cucina')?.quantity, 5);
  await assert.rejects(commerce.placeOrder(quote.id, 'retry-key-456'), (error: unknown) =>
    error instanceof CommerceError && error.code === 'QUOTE_ALREADY_USED');
  const otherQuote = await commerce.quote({ lines: [{ sku: 'carta-cucina', quantity: 1 }], storeId: 'Arezzo', fulfilment: 'store' });
  await assert.rejects(commerce.placeOrder(otherQuote.id, 'retry-key-123'), (error: unknown) =>
    error instanceof CommerceError && error.code === 'IDEMPOTENCY_CONFLICT');
});

test('price change and quote expiry require a fresh quote', async () => {
  let time = Date.parse('2026-09-26T10:00:00Z');
  const fixture = createMockCommerceAdapter();
  const commerce = createCommerceModule(fixture, () => time);
  const quote = await commerce.quote({ lines: cart, storeId: 'Arezzo', fulfilment: 'store' });
  fixture.setPrice('carta-cucina', 599);
  await assert.rejects(commerce.placeOrder(quote.id, 'price-key-123'), (error: unknown) =>
    error instanceof CommerceError && error.code === 'PRICE_CHANGED');
  const fresh = await commerce.quote({ lines: cart, storeId: 'Arezzo', fulfilment: 'store' });
  time += 5 * 60_000;
  await assert.rejects(commerce.placeOrder(fresh.id, 'expire-key-123'), (error: unknown) =>
    error instanceof CommerceError && error.code === 'QUOTE_EXPIRED');
});

test('overweight and unavailable stock fail before an order is created', async () => {
  const commerce = createCommerceModule(createMockCommerceAdapter());
  await assert.rejects(commerce.quote({ lines: [{ sku: 'detergente-lavatrice', quantity: 5 }],
    storeId: 'Arezzo', fulfilment: 'home', postalCode: '52100' }), (error: unknown) =>
    error instanceof CommerceError && error.code === 'UNSUPPORTED_CART');
  await assert.rejects(commerce.quote({ lines: [{ sku: 'carta-cucina', quantity: 6 }],
    storeId: 'Arezzo', fulfilment: 'store' }), (error: unknown) =>
    error instanceof CommerceError && error.code === 'OUT_OF_STOCK');
});

test('two simultaneous submissions for one quote reserve stock once', async () => {
  const commerce = createCommerceModule(createMockCommerceAdapter());
  const quote = await commerce.quote({ lines: [{ sku: 'carta-cucina', quantity: 4 }], storeId: 'Arezzo', fulfilment: 'store' });
  const [first, retry] = await Promise.all([
    commerce.placeOrder(quote.id, 'parallel-key-123'), commerce.placeOrder(quote.id, 'parallel-key-123'),
  ]);
  assert.equal(first.id, retry.id);
  assert.equal((await commerce.availability('Arezzo')).find((item) => item.sku === 'carta-cucina')?.quantity, 1);
});

test('a quote cannot reserve stock that another order has already taken', async () => {
  const commerce = createCommerceModule(createMockCommerceAdapter());
  const request = { lines: [{ sku: 'carta-cucina', quantity: 4 }], storeId: 'Arezzo', fulfilment: 'store' as const };
  const first = await commerce.quote(request);
  const second = await commerce.quote(request);
  await commerce.placeOrder(first.id, 'stock-race-key-1');
  await assert.rejects(commerce.placeOrder(second.id, 'stock-race-key-2'), (error: unknown) =>
    error instanceof CommerceError && error.code === 'OUT_OF_STOCK');
});

test('one idempotency key cannot create two orders in parallel', async () => {
  const commerce = createCommerceModule(createMockCommerceAdapter());
  const first = await commerce.quote({ lines: [{ sku: 'carta-cucina', quantity: 1 }], storeId: 'Arezzo', fulfilment: 'store' });
  const second = await commerce.quote({ lines: [{ sku: 'padella-28', quantity: 1 }], storeId: 'Arezzo', fulfilment: 'store' });
  const results = await Promise.allSettled([
    commerce.placeOrder(first.id, 'same-key-different-quotes'),
    commerce.placeOrder(second.id, 'same-key-different-quotes'),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  if (results[1].status === 'rejected') assert.equal(results[1].reason.code, 'IDEMPOTENCY_CONFLICT');
});
