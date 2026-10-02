import { formatEuro as formatEuroShared, formatShipping as formatShippingShared, unitPriceLabel as unitPriceLabelShared } from '@casa-te/shared';

/**
 * Prices as the shop shows them: "€ 59,00" (a non-breaking space after the euro sign, as in the
 * design). Same amount as the shared formatter; only the spacing differs.
 */
export function formatEuro(cents: number): string {
  return formatEuroShared(cents).replace(/^(-?)€/, '$1€ ');
}

const spaced = (text: string | null) => (text === null ? null : text.replace(/(^|[^\w])€(?=\d)/g, '$1€ '));

/** Shipping price ("Gratis" or "€ 5,90"). */
export function formatShipping(cents: number): string {
  return spaced(formatShippingShared(cents)) as string;
}

/** Unit price such as "€ 15,80 / l", or null. */
export function unitPriceLabel(priceCents: number, unitQuantity: number | null, unit: string | null): string | null {
  return spaced(unitPriceLabelShared(priceCents, unitQuantity, unit));
}
