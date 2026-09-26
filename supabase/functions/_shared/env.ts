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

export function loadConfig(): Config {
  return {
    supabaseUrl: requireEnv('SUPABASE_URL').replace(/\/$/, ''),
    anonKey: requireEnv('SUPABASE_ANON_KEY'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    stripeSecretKey: env('STRIPE_SECRET_KEY') ?? '',
    stripeWebhookSecret: env('STRIPE_WEBHOOK_SECRET') ?? '',
    webShopUrl: (env('WEB_SHOP_URL') ?? '').replace(/\/$/, ''),
    appScheme: env('APP_SCHEME') ?? 'casate',
  };
}
