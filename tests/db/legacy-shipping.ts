// Frozen copy of the approved demo shipping calculator (commit 031e8f4), used only as a test oracle.
export type FulfilmentMethod = 'home' | 'pickup' | 'store';

export type ShippingInput = {
  subtotal: number;
  weightKg: number;
  method: FulfilmentMethod;
};

export const FREE_SHIPPING_THRESHOLD = 66;
export const FREE_SHIPPING_MAX_WEIGHT_KG = 10;

export function calculateShipping({
  subtotal,
  weightKg,
  method,
}: ShippingInput): number {
  if (method === 'store') return 0;

  if (
    subtotal >= FREE_SHIPPING_THRESHOLD &&
    weightKg <= FREE_SHIPPING_MAX_WEIGHT_KG
  ) {
    return 0;
  }

  const pickup = method === 'pickup';

  if (subtotal < 25) {
    if (weightKg <= 2) return pickup ? 3.9 : 4.9;
    if (weightKg <= 5) return pickup ? 4.9 : 6.9;
    if (weightKg <= 10) return pickup ? 6.9 : 8.9;
  }

  if (subtotal < 45) {
    if (weightKg <= 2) return pickup ? 2.9 : 3.9;
    if (weightKg <= 5) return pickup ? 3.9 : 5.9;
    if (weightKg <= 10) return pickup ? 5.9 : 7.9;
  }

  if (subtotal < 66) {
    if (weightKg <= 2) return pickup ? 1.9 : 2.9;
    if (weightKg <= 5) return pickup ? 2.9 : 4.9;
    if (weightKg <= 10) return pickup ? 4.9 : 6.9;
  }

  // Demo fallback for >10 kg. Final rule will be validated later.
  return pickup ? 9.9 : 12.9;
}

export function shippingLabel(value: number): string {
  return value === 0 ? 'Gratis' : `€${value.toFixed(2).replace('.', ',')}`;
}
