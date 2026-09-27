// Environment access that works in Deno (Edge runtime) and Node (unit tests).
type EnvReader = { get(key: string): string | undefined };
const denoEnv = (globalThis as { Deno?: { env: EnvReader } }).Deno?.env;
const nodeEnv = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;

export function env(key: string): string | undefined {
  return denoEnv ? denoEnv.get(key) : nodeEnv?.[key];
}

export function requireEnv(key: string): string {
  const value = env(key);
  if (!value) throw new Error(`Missing environment variable ${key}`);
  return value;
}

export type Config = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  /** Public base URL of the web shop, e.g. https://shop.casate.it */
  webShopUrl: string;
  /** Deep-link scheme of the native app (app.json "scheme"). */
  appScheme: string;
};

/** Reads the `default` key from the JSON dictionaries Supabase injects (SUPABASE_SECRET_KEYS etc.). */
function namedKey(dictVar: string, name = 'default'): string | undefined {
  const raw = env(dictVar);
  if (!raw) return undefined;
  try {
    const value = (JSON.parse(raw) as Record<string, unknown>)[name];
    return typeof value === 'string' && value ? value : undefined;
  } catch {
    return undefined;
  }
}

export function loadConfig(): Config {
  // New API keys (sb_publishable_/sb_secret_) first; legacy anon/service_role JWTs as fallback
  // (Supabase retires the legacy keys at the end of 2026).
  const anonKey = namedKey('SUPABASE_PUBLISHABLE_KEYS') ?? env('SUPABASE_ANON_KEY');
  const serviceRoleKey = namedKey('SUPABASE_SECRET_KEYS') ?? env('SUPABASE_SERVICE_ROLE_KEY');
  if (!anonKey) throw new Error('Missing environment variable SUPABASE_PUBLISHABLE_KEYS or SUPABASE_ANON_KEY');
  if (!serviceRoleKey) throw new Error('Missing environment variable SUPABASE_SECRET_KEYS or SUPABASE_SERVICE_ROLE_KEY');
  return {
    supabaseUrl: requireEnv('SUPABASE_URL').replace(/\/$/, ''),
    anonKey,
    serviceRoleKey,
    stripeSecretKey: env('STRIPE_SECRET_KEY') ?? '',
    stripeWebhookSecret: env('STRIPE_WEBHOOK_SECRET') ?? '',
    webShopUrl: (env('WEB_SHOP_URL') ?? '').replace(/\/$/, ''),
    appScheme: env('APP_SCHEME') ?? 'casate',
  };
}
