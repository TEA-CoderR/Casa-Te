import type { Cents, Grams } from './money';

export type FulfilmentMethod = 'home' | 'pickup' | 'store';
export type ShippedMethod = Exclude<FulfilmentMethod, 'store'>;

/**
 * One shipping rule. Ranges are inclusive and expressed in integer cents / grams.
 * `max*` = null means unbounded. Rules are evaluated by ascending `priority`;
 * the first match wins. Store pickup is always free and never uses rules.
 *
 * The database table `public.shipping_rates` has the same shape and is the
 * production source of truth; the SQL function `public.shipping_cost_cents`
 * implements this exact algorithm (parity is tested in tests/db).
 */
export type ShippingRule = {
  method: ShippedMethod;
  priority: number;
  minSubtotalCents: Cents;
  maxSubtotalCents: Cents | null;
  minWeightG: Grams;
  maxWeightG: Grams | null;
  priceCents: Cents;
  /** Marks rules the business has not finalised yet (e.g. >10 kg). */
  provisional?: boolean;
};

export const FREE_SHIPPING_THRESHOLD_CENTS = 6600;
export const FREE_SHIPPING_MAX_WEIGHT_G = 10000;

function bands(
  minSubtotalCents: number,
  maxSubtotalCents: number,
  home: [number, number, number],
  pickup: [number, number, number],
  priorityBase: number,
): ShippingRule[] {
  const weights: Array<[number, number]> = [[0, 2000], [2001, 5000], [5001, 10000]];
  return weights.flatMap(([minWeightG, maxWeightG], i) => [
    { method: 'home' as const, priority: priorityBase + i, minSubtotalCents, maxSubtotalCents, minWeightG, maxWeightG, priceCents: home[i] },
    { method: 'pickup' as const, priority: priorityBase + i, minSubtotalCents, maxSubtotalCents, minWeightG, maxWeightG, priceCents: pickup[i] },
  ]);
}

/**
 * CASA & TE agreed shipping model (see docs/PROJECT_CONTEXT.md §6).
 * Mirrors supabase/seed data in migration 0003. Do not change without approval.
 */
export const DEFAULT_SHIPPING_RULES: ShippingRule[] = [
  // Free shipping from €66 when the order weighs <= 10 kg.
  { method: 'home', priority: 1, minSubtotalCents: 6600, maxSubtotalCents: null, minWeightG: 0, maxWeightG: 10000, priceCents: 0 },
  { method: 'pickup', priority: 1, minSubtotalCents: 6600, maxSubtotalCents: null, minWeightG: 0, maxWeightG: 10000, priceCents: 0 },
  ...bands(0, 2499, [490, 690, 890], [390, 490, 690], 10),
  ...bands(2500, 4499, [390, 590, 790], [290, 390, 590], 20),
  ...bands(4500, 6599, [290, 490, 690], [190, 290, 490], 30),
  // Provisional >10 kg fallback — final production rule not yet agreed.
  { method: 'home', priority: 90, minSubtotalCents: 0, maxSubtotalCents: null, minWeightG: 10001, maxWeightG: null, priceCents: 1290, provisional: true },
  { method: 'pickup', priority: 90, minSubtotalCents: 0, maxSubtotalCents: null, minWeightG: 10001, maxWeightG: null, priceCents: 990, provisional: true },
];

export type ShippingQuote = { priceCents: Cents; provisional: boolean } | null;

/** Returns null when no rule matches (the method is not available for this cart). */
export function quoteShipping(
  rules: readonly ShippingRule[],
  subtotalCents: Cents,
  weightG: Grams,
  method: FulfilmentMethod,
): ShippingQuote {
  if (method === 'store') return { priceCents: 0, provisional: false };
  const match = [...rules]
    .filter((r) => r.method === method)
    .sort((a, b) => a.priority - b.priority || a.priceCents - b.priceCents)
    .find((r) =>
      subtotalCents >= r.minSubtotalCents &&
      (r.maxSubtotalCents === null || subtotalCents <= r.maxSubtotalCents) &&
      weightG >= r.minWeightG &&
      (r.maxWeightG === null || weightG <= r.maxWeightG));
  return match ? { priceCents: match.priceCents, provisional: Boolean(match.provisional) } : null;
}

export function shippingCostCents(
  rules: readonly ShippingRule[],
  subtotalCents: Cents,
  weightG: Grams,
  method: FulfilmentMethod,
): Cents | null {
  return quoteShipping(rules, subtotalCents, weightG, method)?.priceCents ?? null;
}

/** Amount still needed to unlock free shipping, or 0 if already free / not reachable by value. */
export function freeShippingRemainingCents(subtotalCents: Cents, weightG: Grams): Cents {
  if (weightG > FREE_SHIPPING_MAX_WEIGHT_G) return 0;
  return Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - subtotalCents);
}

export const FULFILMENT_LABELS: Record<FulfilmentMethod, string> = {
  home: 'Consegna a domicilio',
  pickup: 'Punto di ritiro',
  store: 'Ritiro in negozio',
};
