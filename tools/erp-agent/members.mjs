// Member cards (tessere) → keyed hashes for the shop. Runs on CASA & TE's PC: the card number, phone and birth date
// are read from ysoft and hashed here; only the hashes are sent (see supabase/functions/_shared/member-card.ts for
// the algorithm and public.erp_apply_member_cards for the endpoint). Nothing plain is written to disk or the log.
import crypto from 'node:crypto';
import { chunk, send, toIsoDate } from './lib.mjs';

const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest('hex');

/** Card as printed, capitals, letters and digits only; null if not plausible. */
export function cleanCard(value) {
  const s = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{4,30}$/.test(s) ? s : null;
}
export const cardKey = (clean) => clean.replace(/^0+(?=.)/, '');

/** Last 4 digits of a phone number with at least 6 digits, else null. */
export function phoneLast4(phone) {
  const d = String(phone ?? '').replace(/\D/g, '');
  return d.length >= 6 ? d.slice(-4) : null;
}

/** Birth date → YYYYMMDD (null for empty or 0000-00-00). */
export function birthKey(value) {
  const iso = toIsoDate(value);
  return iso && !iso.startsWith('0000') ? iso.replaceAll('-', '') : null;
}

/** One ysoft row { card, phone?, birth?, active? } → { card_hash, phone_hash, birth_hash, active } or null. */
export function memberHashes(secret, row) {
  const card = cleanCard(row.card);
  if (!card) return null;
  const key = hmac(secret, 'casate-member-card-v1');
  const k = cardKey(card);
  const p = phoneLast4(row.phone);
  const b = birthKey(row.birth);
  const active = row.active === undefined || row.active === null ? true : !['0', 'false', 'no', 'n'].includes(String(row.active).trim().toLowerCase());
  return {
    card_hash: hmac(key, `C|${k}`),
    phone_hash: p ? hmac(key, `P|${k}|${p}`) : null,
    birth_hash: b ? hmac(key, `B|${k}|${b}`) : null,
    active,
  };
}

/** The query in members.sql must be one SELECT returning the columns card, phone, birth (and optionally active). */
export function checkMembersSql(sql) {
  const s = String(sql ?? '').replace(/^﻿/, '').replace(/--[^\n]*\n/g, '\n').trim().replace(/;\s*$/, '');
  if (!/^select\s/i.test(s) || s.includes(';')) throw new Error('members.sql: una sola SELECT');
  return s;
}

/** Reads, hashes and sends all cards in batches; the last batch deactivates cards no longer in the ERP. */
export async function syncMembers({ rows, secret, endpoint, fetchImpl, log = () => {} }) {
  const seen = new Map();
  let skipped = 0;
  for (const r of rows) {
    const h = memberHashes(secret, r);
    if (!h) { skipped++; continue; }
    const prev = seen.get(h.card_hash);
    // Same card twice: keep the active row with the most checks.
    if (!prev || (h.active && !prev.active) || (!!h.phone_hash + !!h.birth_hash > !!prev.phone_hash + !!prev.birth_hash)) seen.set(h.card_hash, h);
  }
  const list = [...seen.values()];
  if (!list.length) throw new Error('members.sql: nessuna tessera letta');
  const syncId = crypto.randomUUID();
  const parts = chunk(list, 5000);
  let sent = 0;
  let deactivated = 0;
  for (const [i, part] of parts.entries()) {
    const r = await send(endpoint, secret, { sync_id: syncId, final: i === parts.length - 1, member_cards: part }, { fetchImpl });
    sent += part.length;
    deactivated += r.deactivated ?? 0;
    log(`tessere ${sent}/${list.length}`);
  }
  return {
    cards: list.length, skipped, deactivated,
    withPhone: list.filter((h) => h.phone_hash).length, withBirth: list.filter((h) => h.birth_hash).length,
    withoutCheck: list.filter((h) => !h.phone_hash && !h.birth_hash).length,
  };
}
