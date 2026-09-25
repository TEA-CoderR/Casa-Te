import { products } from './products';
import { stores } from '@/config/stores';
import type { CartLine, CatalogItem, CommerceAdapter } from '@/commerce/types';

/** Fictional stock exists only for contract and flow tests; never represent it as real inventory. */
export function createMockCommerceAdapter(): CommerceAdapter & { setPrice(sku: string, cents: number): void } {
  const catalog: CatalogItem[] = products.map((product) => ({
    sku: product.id, name: product.name, priceCents: Math.round(product.price * 100),
    weightGrams: Math.round(product.weightKg * 1000), available: product.available,
  }));
  const stock = new Map(stores.map((store) => [store, new Map(catalog.map((item) => [item.sku, 5]))]));
  return {
    listProducts: async () => catalog.map((item) => ({ ...item })),
    available: async (storeId, sku) => stock.get(storeId as typeof stores[number])?.get(sku) ?? 0,
    reserve: async (storeId, lines: CartLine[]) => {
      const location = stock.get(storeId as typeof stores[number]);
      if (!location || lines.some((line) => (location.get(line.sku) ?? 0) < line.quantity)) return false;
      for (const line of lines) location.set(line.sku, location.get(line.sku)! - line.quantity);
      return true;
    },
    setPrice: (sku, cents) => {
      const item = catalog.find((product) => product.sku === sku);
      if (!item || !Number.isSafeInteger(cents) || cents < 0) throw new Error('Invalid fixture price');
      item.priceCents = cents;
    },
  };
}
