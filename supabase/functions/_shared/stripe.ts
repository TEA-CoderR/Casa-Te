// Tiny Stripe API client (fetch + WebCrypto). Works in Deno and Node >= 20.
import { env, type Config } from './env.ts';
import { HttpError } from './http.ts';

/** Pinned API version; override with STRIPE_API_VERSION if your account requires another. */
export const STRIPE_API_VERSION = env('STRIPE_API_VERSION') ?? '2025-03-31.basil';

/** API origin. Only overridden for local end-to-end runs against a Stripe mock (tools/local-stack). */
function stripeApiBase(): string {
  return (env('STRIPE_API_BASE') ?? 'https://api.stripe.com').replace(/\/$/, '');
}

type Params = { [key: string]: string | number | boolean | null | undefined | Params | Array<string | number | Params> };

/** Encodes nested params the way Stripe expects: a[b][0][c]=1 */
export function formEncode(params: Params, prefix = ''): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object') parts.push(formEncode(item, `${name}[${i}]`));
        else parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === 'object') {
      parts.push(formEncode(value, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

export async function stripeRequest<T>(
  config: Config, method: 'GET' | 'POST', path: string, params: Params = {}, idempotencyKey?: string,
): Promise<T> {
  if (!config.stripeSecretKey) throw new HttpError(503, 'payment_unavailable', 'STRIPE_SECRET_KEY not configured');
  const body = method === 'POST' ? formEncode(params) : undefined;
  const url = `${stripeApiBase()}/v1/${path}${method === 'GET' && Object.keys(params).length ? `?${formEncode(params)}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': STRIPE_API_VERSION,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Stripe error', res.status, JSON.stringify(data));
    throw new HttpError(502, 'payment_unavailable', data?.error?.message ?? 'Stripe error');
  }
  return data as T;
}

// ---- Webhook signature verification ------------------------------------------

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

/** Verifies a `Stripe-Signature` header (scheme v1) and returns the parsed event. */
export async function verifyStripeEvent<T = StripeEvent>(
  payload: string, header: string | null, secret: string, toleranceSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000),
): Promise<T> {
  if (!secret) throw new HttpError(500, 'webhook_not_configured');
  if (!header) throw new HttpError(400, 'missing_signature');
  const items = header.split(',').map((kv) => kv.split('=') as [string, string]);
  const timestamp = Number(items.find(([k]) => k === 't')?.[1]);
  const signatures = items.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || signatures.length === 0) throw new HttpError(400, 'invalid_signature');
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) throw new HttpError(400, 'signature_expired');
  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  if (!signatures.some((s) => timingSafeEqual(s, expected))) throw new HttpError(400, 'invalid_signature');
  return JSON.parse(payload) as T;
}

// ---- Types (subset) -------------------------------------------------------------

export type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

export type CheckoutSession = {
  id: string; url: string | null; payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  status: 'open' | 'complete' | 'expired'; amount_total: number | null; payment_intent: string | null;
  client_reference_id: string | null; metadata: Record<string, string> | null;
};

export type StripeRefund = {
  id: string; amount: number; status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled';
  payment_intent: string | null; metadata: Record<string, string> | null;
};
