// Generates the shipping parity fixture: every case is computed by the shared TS rules and
// cross-checked against the original approved demo calculator before being written out.
import { writeFileSync, mkdirSync } from 'node:fs';
import { DEFAULT_SHIPPING_RULES, shippingCostCents, type FulfilmentMethod } from '../../packages/shared/src/shipping';
import { calculateShipping as legacy } from './legacy-shipping';

const subtotals = [0, 1, 999, 2499, 2500, 3000, 4499, 4500, 5000, 6599, 6600, 6601, 12000];
const weights = [0, 1, 500, 2000, 2001, 3500, 5000, 5001, 7500, 10000, 10001, 25000];
const methods: FulfilmentMethod[] = ['home', 'pickup', 'store'];
const cases = [];
for (const method of methods) for (const s of subtotals) for (const w of weights) {
  const expected = shippingCostCents(DEFAULT_SHIPPING_RULES, s, w, method);
  const old = Math.round(legacy({ subtotal: s / 100, weightKg: w / 1000, method }) * 100);
  if (expected !== old) throw new Error(`Shared rules diverge from approved demo rules: ${method} ${s} ${w}: ${expected} vs ${old}`);
  cases.push({ method, subtotal: s, weight: w, expected });
}
mkdirSync(new URL('./.generated/', import.meta.url), { recursive: true });
writeFileSync(new URL('./.generated/shipping_cases.json', import.meta.url), JSON.stringify(cases));
console.log(`shipping parity fixture: ${cases.length} cases`);
