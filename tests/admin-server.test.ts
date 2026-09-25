import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createDemoServer } from '../server/app';
import { createDemoOrder } from '../src/domain/checkout';

const dir = mkdtempSync(join(tmpdir(), 'casa-te-admin-'));
const dataFile = join(dir, 'orders.json');
const server = createDemoServer(dataFile);
let base = '';

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

const order = createDemoOrder({ 'carta-cucina': 2 }, {
  method: 'store', payment: 'card-demo', store: 'Arezzo',
  address: { name: '', address: '', city: '', cap: '' },
});

test('phone submission appears in admin, survives service restart data read, and retries are idempotent', async () => {
  const post = () => fetch(`${base}/api/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order),
  });
  assert.equal((await post()).status, 201);
  assert.equal((await post()).status, 200);
  const response = await fetch(`${base}/api/orders`);
  const data = await response.json() as { orders: typeof order[] };
  assert.equal(data.orders.length, 1);
  assert.equal(data.orders[0].id, order.id);
  assert.equal(data.orders[0].total, order.total);
  const restarted = createDemoServer(dataFile);
  await new Promise<void>((resolve) => restarted.listen(0, '127.0.0.1', resolve));
  try {
    const second = await fetch(`http://127.0.0.1:${(restarted.address() as AddressInfo).port}/api/orders`);
    assert.equal((await second.json() as { orders: typeof order[] }).orders[0].id, order.id);
  } finally {
    await new Promise<void>((resolve) => restarted.close(() => resolve()));
  }
});

test('server rejects manipulated totals and conflicting reuse of an order number', async () => {
  const changed = { ...order, total: order.total + 1 };
  const bad = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed) });
  assert.equal(bad.status, 400);
  const reused = { ...order, payment: 'cash-demo' as const };
  const conflict = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reused) });
  assert.equal(conflict.status, 409);
});

test('admin assets and product catalog are served by the same process', async () => {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /CASA & TE/);
  const catalog = await fetch(`${base}/api/products`);
  assert.equal((await catalog.json() as { products: unknown[] }).products.length, 8);
});

test('v1 mock commerce endpoints quote, reserve, and expose the same order', async () => {
  const quoteResponse = await fetch(`${base}/v1/quotes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines: [{ sku: 'carta-cucina', quantity: 1 }], storeId: 'Arezzo', fulfilment: 'store' }),
  });
  assert.equal(quoteResponse.status, 201);
  const quote = (await quoteResponse.json() as { quote: { id: string; totalCents: number } }).quote;
  assert.equal(quote.totalCents, 499);
  const submit = () => fetch(`${base}/v1/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId: quote.id, idempotencyKey: 'http-retry-key-123' }) });
  const first = (await (await submit()).json() as { order: { id: string; status: string } }).order;
  const again = (await (await submit()).json() as { order: { id: string } }).order;
  assert.equal(again.id, first.id);
  assert.equal(first.status, 'reserved_demo');
  const order = await fetch(`${base}/v1/orders/${first.id}`);
  assert.equal((await order.json() as { order: { id: string } }).order.id, first.id);
  const stock = await fetch(`${base}/v1/availability?storeId=Arezzo`);
  assert.equal((await stock.json() as { availability: Array<{ sku: string; quantity: number }> })
    .availability.find((item) => item.sku === 'carta-cucina')?.quantity, 4);
});
