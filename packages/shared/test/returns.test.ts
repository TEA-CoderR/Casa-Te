import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysSinceHandover, returnableQuantities, type ReturnWithItems } from '../src/returns';

const ret = (status: ReturnWithItems['status'], items: Array<[string, number]>) =>
  ({ status, return_items: items.map(([order_item_id, quantity]) => ({ return_id: 'r', order_item_id, quantity })) }) as ReturnWithItems;

test('returnable quantities ignore rejected and cancelled returns', () => {
  const items = [{ id: 'a', quantity: 3 }, { id: 'b', quantity: 1 }];
  assert.deepEqual(returnableQuantities(items, [ret('approved', [['a', 2]]), ret('cancelled', [['a', 1], ['b', 1]]), ret('refunded', [['b', 1]])]),
    { a: 1, b: 0 });
});

test('days since handover only for collected or shipped orders', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  assert.equal(daysSinceHandover({ status: 'completed', completed_at: '2026-10-10T12:00:00Z', updated_at: '2026-10-11T00:00:00Z' }, now), 10);
  assert.equal(daysSinceHandover({ status: 'ready', completed_at: null, updated_at: '2026-10-10T12:00:00Z' }, now), null);
});
