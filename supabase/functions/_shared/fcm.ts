// Firebase Cloud Messaging (HTTP v1) with fetch and WebCrypto only: the service account (env FCM_SERVICE_ACCOUNT,
// the JSON downloaded from Firebase → Project settings → Service accounts) signs a short-lived OAuth token.
// Works in Deno (Edge runtime) and in Node (unit tests).
import { env } from './env.ts';

type ServiceAccount = { client_email: string; private_key: string; project_id: string };
export type PushMessage = { title: string; body: string; data?: Record<string, string>; tag?: string };
export type PushResult = { token: string; ok: boolean; gone: boolean };

export function serviceAccount(): ServiceAccount | null {
  const raw = env('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    return sa.client_email && sa.private_key && sa.project_id ? sa : null;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array | string) => {
  const s = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(typeof bytes === 'string' ? unescape(encodeURIComponent(s)) : s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function signJwt(sa: ServiceAccount, now: number): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`)));
  return `${head}.${claims}.${b64url(sig)}`;
}

let cached: { token: string; until: number } | null = null;
async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.until > now + 60) return cached.token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${await signJwt(sa, now)}`,
  });
  if (!res.ok) throw new Error(`fcm_auth_failed ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, until: now + (body.expires_in ?? 3600) };
  return body.access_token;
}

/** For tests: forget the cached OAuth token. */
export function resetFcmToken() { cached = null; }

/** Sends one message to each token. `gone` = the app was uninstalled or the token expired: delete it. */
export async function sendPush(sa: ServiceAccount, tokens: string[], msg: PushMessage): Promise<PushResult[]> {
  if (!tokens.length) return [];
  const auth = await accessToken(sa);
  return Promise.all(tokens.map(async (token) => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: msg.data ?? {},
        android: { priority: 'HIGH', notification: { channel_id: 'orders', color: '#1F4127', ...(msg.tag ? { tag: msg.tag } : {}) } },
      } }),
    });
    if (res.ok) return { token, ok: true, gone: false };
    const text = await res.text();
    return { token, ok: false, gone: res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(text) };
  }));
}
