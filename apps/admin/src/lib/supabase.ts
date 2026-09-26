import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const isConfigured = Boolean(SUPABASE_URL && KEY);

export const supabase = createClient(SUPABASE_URL || 'http://localhost:54321', KEY || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Throws the Postgres error code/message (e.g. "invalid_transition") on failure. */
export function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** Calls an Edge Function and surfaces its `{ error }` code. */
export async function invoke<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = error.message;
    try { code = (await (error as { context?: Response }).context?.json())?.error ?? code; } catch { /* ignore */ }
    throw new Error(code);
  }
  return data as T;
}
