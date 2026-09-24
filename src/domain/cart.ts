import { products } from '@/data/products';

export function validQuantity(quantity: number) {
  return Number.isSafeInteger(quantity) && quantity > 0;
}

export function getCartSnapshot(items: Record<string, number>) {
  const lines = products.flatMap((product) => {
    const quantity = items[product.id];
    return product.available && validQuantity(quantity)
      ? [{ product, quantity }]
      : [];
  });
  const subtotal = lines.reduce((sum, { product, quantity }) =>
    sum + Math.round(product.price * 100) * quantity, 0) / 100;
  const totalWeightKg = lines.reduce((sum, { product, quantity }) =>
    sum + Math.round(product.weightKg * 1000) * quantity, 0) / 1000;
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  return { lines, subtotal, totalWeightKg, itemCount };
}
