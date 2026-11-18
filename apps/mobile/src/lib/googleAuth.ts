// "Continua con Google" (plan v3 X9, owner 18/11): Supabase OAuth. The button shows only while the Google provider
// is switched on in Supabase (Authentication → Providers → Google), read from the public auth settings.
// Phones open Google in an in-app browser session that returns to casate://auth/callback; the web shop is
// redirected back to the page it came from and picks the session up from the URL.
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';

export const APP_AUTH_CALLBACK = 'casate://auth/callback';

let cached: Promise<boolean> | null = null;
/** True when Supabase has Google sign-in enabled (cached for the session). */
export function googleEnabled(): Promise<boolean> {
  cached ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } })
    .then((r) => (r.ok ? r.json() : null))
    .then((s: { external?: { google?: boolean } } | null) => !!s?.external?.google)
    .catch(() => false);
  return cached;
}

/** Tokens or a PKCE code from the callback URL (query or fragment). */
export function callbackParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = url.split(/[?#]/).slice(1).join('&');
  for (const kv of parts.split('&')) {
    const [k, v] = kv.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return out;
}

/**
 * Signs in with Google. Web: the page navigates away (returns null). Phones: resolves to the user id once the
 * session is set, null when the customer closed Google; throws on errors.
 */
export async function signInWithGoogle(webRedirectTo?: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: webRedirectTo, queryParams: { prompt: 'select_account' } } });
    if (error) throw error;
    return null;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: APP_AUTH_CALLBACK, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) throw error ?? new Error('oauth_url_missing');
  const res = await WebBrowser.openAuthSessionAsync(data.url, APP_AUTH_CALLBACK);
  if (res.type !== 'success') return null;
  const p = callbackParams(res.url);
  if (p.error) throw new Error(p.error_description || p.error);
  if (p.code) {
    const { data: s, error: e } = await supabase.auth.exchangeCodeForSession(p.code);
    if (e) throw e;
    return s.user?.id ?? null;
  }
  if (p.access_token && p.refresh_token) {
    const { data: s, error: e } = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
    if (e) throw e;
    return s.user?.id ?? null;
  }
  throw new Error('oauth_no_session');
}
