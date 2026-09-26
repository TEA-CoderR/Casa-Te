import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SHIPPING_RULES, quoteShipping, shippingCostCents, freeShippingRemainingCents,
  formatEuro, formatWeight, parseEuroInput, toCents, vatIncluded,
  allowedNextStatuses, orderStatusLabel, orderTimeline,
  isPostalCode, isVatNumber, isTaxCode, validateAddress, validateInvoice, isValidQuantity,
  friendlyError, errorCode, productImageUrl,
} from '../src/index';

const ship = (s: number, w: number, m: 'home' | 'pickup' | 'store') => shippingCostCents(DEFAULT_SHIPPING_RULES, s, w, m);

test('shipping: agreed bands (docs/PROJECT_CONTEXT.md §6)', () => {
  assert.equal(ship(2000, 1500, 'home'), 490);
  assert.equal(ship(2000, 1500, 'pickup'), 390);
  assert.equal(ship(2499, 2000, 'home'), 490);
  assert.equal(ship(2500, 2000, 'home'), 390);
  assert.equal(ship(2500, 2001, 'home'), 590);
  assert.equal(ship(4500, 5001, 'pickup'), 490);
  assert.equal(ship(6599, 10000, 'home'), 690);
  assert.equal(ship(6600, 10000, 'home'), 0);
  assert.equal(ship(6600, 10000, 'pickup'), 0);
  assert.equal(ship(100, 50000, 'store'), 0);
});

test('shipping: >10 kg provisional fallback, even above free threshold', () => {
  assert.deepEqual(quoteShipping(DEFAULT_SHIPPING_RULES, 9000, 10001, 'home'), { priceCents: 1290, provisional: true });
  assert.deepEqual(quoteShipping(DEFAULT_SHIPPING_RULES, 100, 10001, 'pickup'), { priceCents: 990, provisional: true });
});

test('shipping: no matching rule means method unavailable', () => {
  assert.equal(shippingCostCents([], 1000, 1000, 'home'), null);
  assert.equal(shippingCostCents([], 1000, 1000, 'store'), 0);
});

test('free shipping progress', () => {
  assert.equal(freeShippingRemainingCents(5000, 1000), 1600);
  assert.equal(freeShippingRemainingCents(7000, 1000), 0);
  assert.equal(freeShippingRemainingCents(1000, 12000), 0);
});

test('money formatting and parsing', () => {
  assert.equal(formatEuro(0), '€0,00');
  assert.equal(formatEuro(499), '€4,99');
  assert.equal(formatEuro(123456), '€1.234,56');
  assert.equal(formatEuro(-250), '-€2,50');
  assert.equal(formatWeight(800), '800 g');
  assert.equal(formatWeight(2200), '2,20 kg');
  assert.equal(parseEuroInput('12,50'), 1250);
  assert.equal(parseEuroInput('€ 7.9'), 790);
  assert.equal(parseEuroInput('abc'), null);
  assert.equal(parseEuroInput('1,234'), null);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(vatIncluded(1220, 22), 220);
});

test('order status transitions mirror SQL', () => {
  assert.deepEqual(allowedNextStatuses('paid', 'home'), ['picking', 'cancelled']);
  assert.deepEqual(allowedNextStatuses('ready', 'store'), ['completed', 'cancelled']);
  assert.deepEqual(allowedNextStatuses('ready', 'home'), ['shipped', 'cancelled']);
  assert.deepEqual(allowedNextStatuses('pending_payment', 'home'), []);
  assert.equal(orderStatusLabel('ready', 'store'), 'Pronto per il ritiro');
  assert.equal(orderStatusLabel('completed', 'home'), 'Consegnato');
  assert.equal(orderTimeline('store').includes('shipped'), false);
});

test('validation', () => {
  assert.ok(isPostalCode('55100'));
  assert.ok(!isPostalCode('5510'));
  assert.ok(isVatNumber('IT01114601006'));
  assert.ok(!isVatNumber('01114601007'));
  assert.ok(isTaxCode('RSSMRA85T10A562S'));
  assert.ok(!isTaxCode('RSSMRA85'));
  assert.deepEqual(validateAddress({ fullName: 'Anna Rossi', line1: 'Via Roma 1', city: 'Lucca', province: 'lu', postalCode: '55100', phone: '333 1234567' }), {});
  const errors = validateAddress({ fullName: '', line1: '', city: '', province: 'XX', postalCode: '1', phone: 'x' });
  assert.deepEqual(Object.keys(errors).sort(), ['city', 'fullName', 'line1', 'phone', 'postalCode', 'province']);
  assert.deepEqual(validateInvoice({ taxCode: 'RSSMRA85T10A562S' }), {});
  assert.ok(validateInvoice({ vatNumber: '01114601006' }).companyName);
  assert.ok(isValidQuantity(1) && !isValidQuantity(0) && !isValidQuantity(100) && !isValidQuantity(1.5));
});

test('friendly errors', () => {
  assert.equal(errorCode({ message: 'insufficient_stock' }), 'insufficient_stock');
  assert.match(friendlyError({ message: 'coupon_expired' }), /scaduto/);
  assert.match(friendlyError(new Error('Failed to fetch')), /Connessione/);
  assert.equal(friendlyError({ message: '???' }, 'X'), 'X');
});

test('product image url', () => {
  assert.equal(productImageUrl('https://x.supabase.co/', 'a/b.jpg'), 'https://x.supabase.co/storage/v1/object/public/product-images/a/b.jpg');
  assert.equal(productImageUrl('https://x.supabase.co', 'https://cdn/x.jpg'), 'https://cdn/x.jpg');
  assert.equal(productImageUrl('https://x.supabase.co', null), null);
});
