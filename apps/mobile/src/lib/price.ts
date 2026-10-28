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

/** Discount shown next to a struck-through price, e.g. "-34%" (display only; rounded down, never overstated). */
export function discountLabel(priceCents: number, compareAtCents: number | null | undefined): string | null {
  if (!compareAtCents || compareAtCents <= priceCents) return null;
  const pct = Math.floor(((compareAtCents - priceCents) * 100) / compareAtCents);
  return pct >= 1 ? `-${pct}%` : null;
}

/** Today in Italy as YYYY-MM-DD (member prices end on an Italian calendar day). */
const italyToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/**
 * Club member price ("Prezzo Soci") of a product if still valid today and lower than the price, else null.
 * Display only: the charged price always comes from quote_cart.
 */
export function memberPrice(p: { price_cents: number; member_price_cents?: number | null; member_price_ends_on?: string | null }):
  { cents: number; endsOn: string | null } | null {
  if (!p.member_price_cents || p.member_price_cents >= p.price_cents) return null;
  if (p.member_price_ends_on && p.member_price_ends_on < italyToday()) return null;
  return { cents: p.member_price_cents, endsOn: p.member_price_ends_on ?? null };
}

/** "fino al 12 novembre" for a YYYY-MM-DD date. */
export function untilLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `fino al ${new Date(y, m - 1, d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`;
}
