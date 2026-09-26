/** All money is handled as integer euro cents; all weight as integer grams. */
export type Cents = number;
export type Grams = number;

export function toCents(euros: number): Cents {
  if (!Number.isFinite(euros)) throw new Error('Invalid amount');
  return Math.round(euros * 100);
}

export function toGrams(kg: number): Grams {
  if (!Number.isFinite(kg)) throw new Error('Invalid weight');
  return Math.round(kg * 1000);
}

/** Italian euro formatting, e.g. 1234 -> "€12,34". */
export function formatEuro(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}€${grouped},${rest}`;
}

export function formatShipping(cents: Cents): string {
  return cents === 0 ? 'Gratis' : formatEuro(cents);
}

/** 1250 -> "1,25 kg"; values under 1 kg shown in grams. */
export function formatWeight(grams: Grams): string {
  if (grams < 1000) return `${Math.round(grams)} g`;
  return `${(grams / 1000).toFixed(2).replace('.', ',')} kg`;
}

/** Parse user-entered euro strings such as "12,50" or "12.50" into cents. */
export function parseEuroInput(value: string): Cents | null {
  const normalized = value.trim().replace(/\s|€/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return toCents(Number(normalized));
}

/** VAT included in a gross (VAT-inclusive) amount, rounded to the cent. */
export function vatIncluded(grossCents: Cents, ratePercent: number): Cents {
  return Math.round(grossCents - grossCents / (1 + ratePercent / 100));
}
