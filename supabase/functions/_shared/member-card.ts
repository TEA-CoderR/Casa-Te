// Keyed hashes of member cards (tessere). Same algorithm in the ERP agent (tools/erp-agent/members.mjs):
//   key        = HMAC-SHA256(ERP_SYNC_SECRET, "casate-member-card-v1")   (hex)
//   card key   = card number in capitals, letters and digits only, without leading zeros
//   card_hash  = HMAC(key, "C|" + card key)
//   phone_hash = HMAC(key, "P|" + card key + "|" + last 4 phone digits)
//   birth_hash = HMAC(key, "B|" + card key + "|" + YYYYMMDD)
import { hmacSha256Hex } from './stripe.ts';

/** Card as typed, cleaned for storage and the barcode ("0012 3456" → "00123456"); null if not plausible. */
export function cleanCard(input: unknown): string | null {
  const s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{4,30}$/.test(s) ? s : null;
}

/** Card key used in the hashes: leading zeros dropped, so "000123456" and "123456" are the same card. */
export const cardKey = (clean: string) => clean.replace(/^0+(?=.)/, '');

export async function memberCardHashes(secret: string, card: string, check: { phoneLast4?: string; birth?: string }) {
  const key = await hmacSha256Hex(secret, 'casate-member-card-v1');
  const k = cardKey(card);
  return {
    card_hash: await hmacSha256Hex(key, `C|${k}`),
    phone_hash: check.phoneLast4 ? await hmacSha256Hex(key, `P|${k}|${check.phoneLast4}`) : null,
    birth_hash: check.birth ? await hmacSha256Hex(key, `B|${k}|${check.birth}`) : null,
  };
}
