// Minimal Supabase REST client (PostgREST + GoTrue) built on fetch, so functions have no npm deps
// and can be unit-tested in Node with a mocked fetch.
import type { Config } from './env.ts';
import { HttpError } from './http.ts';

export type AuthUser = { id: string; email?: string; is_anonymous?: boolean };

function headers(config: Config, token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: config.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

/** Extracts the Postgres error code raised with `raise exception '<code>'`. */
async function postgrestError(res: Response): Promise<HttpError> {
  let body: { message?: string; code?: string } = {};
  try { body = await res.json(); } catch { /* ignore */ }
  const message = body.message ?? `HTTP ${res.status}`;
  const status = body.code === '42501' ? 403 : res.status >= 500 ? 502 : 400;
  return new HttpError(status, /^[a-z_]+$/.test(message) ? message : 'database_error', message);
}

export async function getUser(config: Config, token: string): Promise<AuthUser> {
  const res = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers: headers(config, token) });
  if (!res.ok) throw new HttpError(401, 'not_authenticated');
  return (await res.json()) as AuthUser;
}

/** Calls a Postgres function. `token` is a user JWT (RLS + auth.uid()) or the service role key. */
export async function rpc<T>(config: Config, token: string, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: headers(config, token), body: JSON.stringify(args),
  });
  if (!res.ok) throw await postgrestError(res);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** GET /rest/v1/<table>?<query> */
export async function select<T>(config: Config, token: string, table: string, query: string): Promise<T[]> {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/${table}?${query}`, { headers: headers(config, token) });
  if (!res.ok) throw await postgrestError(res);
  return (await res.json()) as T[];
}

/** Inserts a row, ignoring duplicates. Returns true if the row was new. */
export async function insertIgnoreDuplicate(config: Config, token: string, table: string, row: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(config, token, { Prefer: 'resolution=ignore-duplicates,return=representation' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw await postgrestError(res);
  const rows = (await res.json()) as unknown[];
  return rows.length > 0;
}

export async function upsert(config: Config, token: string, table: string, row: Record<string, unknown>, onConflict: string): Promise<void> {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: headers(config, token, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw await postgrestError(res);
}

// ---- GoTrue admin (service role) ------------------------------------------------

export async function adminDeleteUser(config: Config, userId: string): Promise<void> {
  const res = await fetch(`${config.supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE', headers: headers(config, config.serviceRoleKey),
  });
  if (!res.ok) throw new HttpError(502, 'auth_admin_error', await res.text());
}

/** Invites a user by email (creates the account and sends the invite email). */
export async function adminInviteUser(config: Config, email: string, redirectTo?: string): Promise<AuthUser> {
  // GoTrue reads the redirect target from the query string (same as supabase-js inviteUserByEmail).
  const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
  const res = await fetch(`${config.supabaseUrl}/auth/v1/invite${query}`, {
    method: 'POST', headers: headers(config, config.serviceRoleKey), body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new HttpError(res.status === 422 ? 409 : 502, res.status === 422 ? 'user_exists' : 'auth_admin_error', await res.text());
  return (await res.json()) as AuthUser;
}

export async function adminFindUserByEmail(config: Config, email: string): Promise<AuthUser | null> {
  // GoTrue has no direct lookup by email; page through users (fine for staff-sized lookups).
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${config.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: headers(config, config.serviceRoleKey),
    });
    if (!res.ok) throw new HttpError(502, 'auth_admin_error');
    const body = (await res.json()) as { users: AuthUser[] };
    const hit = body.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (body.users.length < 200) return null;
  }
  return null;
}
