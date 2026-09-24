import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateShipping } from '../src/config/shipping';
import { getCartSnapshot } from '../src/domain/cart';
import { createDemoOrder, type CheckoutDetails } from '../src/domain/checkout';

const cases = [
  [20, 1.5, 4.9, 3.9], [20, 3, 6.9, 4.9],
  [30, 1.5, 3.9, 2.9], [30, 4, 5.9, 3.9],
  [50, 1.5, 2.9, 1.9], [50, 4, 4.9, 2.9],
  [66, 9.5, 0, 0], [80, 12, 12.9, 9.9],
];
cases.forEach(([subtotal, weightKg, home, pickup], i) => test(`S${i + 1}`, () => {
  assert.equal(calculateShipping({ subtotal, weightKg, method: 'home' }), home);
  assert.equal(calculateShipping({ subtotal, weightKg, method: 'pickup' }), pickup);
  assert.equal(calculateShipping({ subtotal, weightKg, method: 'store' }), 0);
}));

test('all value and weight band boundaries', () => {
  const bands = [
    { values: [0, 24.99], home: [4.9, 6.9, 8.9], pickup: [3.9, 4.9, 6.9] },
    { values: [25, 44.99], home: [3.9, 5.9, 7.9], pickup: [2.9, 3.9, 5.9] },
    { values: [45, 65.99], home: [2.9, 4.9, 6.9], pickup: [1.9, 2.9, 4.9] },
  ];
  for (const band of bands) for (const subtotal of band.values) {
    for (const [weightKg, index] of [[0, 0], [2, 0], [2.001, 1], [5, 1], [5.001, 2], [10, 2]]) {
      for (const method of ['home', 'pickup'] as const)
        assert.equal(calculateShipping({ subtotal, weightKg, method }), band[method][index]);
    }
  }
  for (const subtotal of [20, 25, 45, 66, 80]) {
    assert.equal(calculateShipping({ subtotal, weightKg: 10.001, method: 'home' }), 12.9);
    assert.equal(calculateShipping({ subtotal, weightKg: 10.001, method: 'pickup' }), 9.9);
    assert.equal(calculateShipping({ subtotal, weightKg: 10.001, method: 'store' }), 0);
  }
  assert.equal(calculateShipping({ subtotal: 66, weightKg: 10, method: 'home' }), 0);
});

test('A1/A2: quantities, exact money and weight, invalid products', () => {
  const one = getCartSnapshot({ 'detergente-lavatrice': 1 });
  assert.equal(one.subtotal, 7.99);
  assert.equal(one.totalWeightKg, 2.2);
  const two = getCartSnapshot({ 'detergente-lavatrice': 2 });
  assert.equal(two.subtotal, 15.98);
  assert.equal(two.totalWeightKg, 4.4);
  assert.equal(two.itemCount, 2);
  for (const quantity of [0, -1, 0.5, NaN, Infinity])
    assert.equal(getCartSnapshot({ 'detergente-lavatrice': quantity }).itemCount, 0);
  assert.equal(getCartSnapshot({ unknown: 2 }).itemCount, 0);
});

const details: CheckoutDetails = {
  method: 'store', payment: 'card-demo', store: 'Arezzo',
  address: { name: '', address: '', city: '', cap: '' },
};
test('checkout validates home only, snapshots products and totals', () => {
  const items = { 'detergente-lavatrice': 2 };
  assert.throws(() => createDemoOrder({}, details));
  assert.throws(() => createDemoOrder(items, { ...details, method: 'home' }));
  const store = createDemoOrder(items, details);
  assert.equal(store.shipping, 0);
  assert.equal(store.total, 15.98);
  assert.equal(store.address, undefined);
  const home = createDemoOrder(items, { ...details, method: 'home', address: {
    name: 'Test demo', address: 'Indirizzo di prova', city: 'Città demo', cap: '00000',
  } });
  assert.equal(home.total, 22.88);
  assert.equal(home.lines?.[0].quantity, 2);
  assert.equal(home.payment, 'card-demo');
  assert.equal(createDemoOrder(items, { ...details, method: 'pickup' }).shipping, 4.9);
  assert.deepEqual(JSON.parse(JSON.stringify(home)), home);
});
