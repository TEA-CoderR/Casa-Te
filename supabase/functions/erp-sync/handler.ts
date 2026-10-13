// POST /functions/v1/erp-sync   (verify_jwt = false; authenticated by an HMAC of the body)
// Called by the sync agent that runs next to the ERP (ITO) database. Headers:
//   X-Casate-Timestamp: <unix seconds>
//   X-Casate-Signature: v1=<hex HMAC-SHA256(ERP_SYNC_SECRET, "<timestamp>.<raw body>")>
// Body: see public.erp_apply_batch (store_code, sent_at, products[], store_items[]).
import type { Config } from '../_shared/env.ts';
import { HttpError, json } from '../_shared/http.ts';
import { rpc } from '../_shared/supabase.ts';
import { hmacSha256Hex, timingSafeEqual } from '../_shared/stripe.ts';

const MAX_BODY_BYTES = 6 * 1024 * 1024;
const TOLERANCE_S = 300;

export async function verifyErpSignature(secret: string, raw: string, timestamp: string | null, signature: string | null, nowS = Date.now() / 1000): Promise<void> {
  if (!secret) throw new HttpError(503, 'erp_sync_disabled');
  const ts = Number(timestamp);
  if (!timestamp || !Number.isFinite(ts) || Math.abs(nowS - ts) > TOLERANCE_S) throw new HttpError(401, 'invalid_timestamp');
  const given = /^v1=([0-9a-f]{64})$/.exec(signature ?? '')?.[1];
  const expected = await hmacSha256Hex(secret, `${timestamp}.${raw}`);
  if (!given || !timingSafeEqual(given, expected)) throw new HttpError(401, 'invalid_signature');
}

export async function erpSync(req: Request, config: Config): Promise<Response> {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'batch_too_large');
  await verifyErpSignature(config.erpSyncSecret ?? '', raw, req.headers.get('x-casate-timestamp'), req.headers.get('x-casate-signature'));
  let batch: unknown;
  try { batch = JSON.parse(raw); } catch { throw new HttpError(400, 'invalid_json'); }
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)) throw new HttpError(400, 'invalid_json');
  const result = await rpc<Record<string, unknown>>(config, config.serviceRoleKey, 'erp_apply_batch', { p: batch });
  return json(req, result);
}
