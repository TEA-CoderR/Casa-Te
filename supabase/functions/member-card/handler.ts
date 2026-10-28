// POST /functions/v1/member-card   (signed-in customer links their Casa & Te member card)
// Body: { "card": "…", "phone_last4"?: "1234", "birth_date"?: "1980-05-31" }  (one of the two checks)
// The card and the check are hashed here with the server key and compared in public.member_card_link;
// the plain phone digits or birth date are never stored.
import type { Config } from '../_shared/env.ts';
import { bearer, HttpError, json, readJson } from '../_shared/http.ts';
import { getUser, rpc } from '../_shared/supabase.ts';
import { cleanCard, memberCardHashes } from '../_shared/member-card.ts';

export async function memberCard(req: Request, config: Config): Promise<Response> {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  if (!config.erpSyncSecret) throw new HttpError(503, 'member_cards_disabled');
  const token = bearer(req);
  const body = await readJson<{ card?: string; phone_last4?: string; birth_date?: string }>(req);
  const card = cleanCard(body.card);
  if (!card) throw new HttpError(400, 'invalid_card');
  const phoneLast4 = /^\d{4}$/.test(String(body.phone_last4 ?? '')) ? String(body.phone_last4) : undefined;
  const birthMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(body.birth_date ?? ''));
  const birth = birthMatch ? `${birthMatch[1]}${birthMatch[2]}${birthMatch[3]}` : undefined;
  if (!phoneLast4 && !birth) throw new HttpError(400, 'invalid_card_check');
  const user = await getUser(config, token);
  const h = await memberCardHashes(config.erpSyncSecret, card, { phoneLast4, birth });
  const result = await rpc<{ linked: boolean; error?: string; card?: string }>(config, config.serviceRoleKey, 'member_card_link', {
    p_user: user.id, p_card: card, p_card_hash: h.card_hash, p_phone_hash: h.phone_hash, p_birth_hash: h.birth_hash,
  });
  if (!result.linked) throw new HttpError(400, result.error ?? 'card_not_verified');
  return json(req, { linked: true, card: result.card });
}
