import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type SessionState = { session: Session | null; ready: boolean };

export const useSession = create<SessionState>(() => ({ session: null, ready: false }));

let started = false;
/** Subscribes once to Supabase auth changes. Called from the root layout. */
export function startSessionListener() {
  if (started) return;
  started = true;
  supabase.auth.getSession().then(({ data }) => useSession.setState({ session: data.session, ready: true }))
    .catch(() => useSession.setState({ ready: true }));
  supabase.auth.onAuthStateChange((_event, session) => useSession.setState({ session, ready: true }));
}

export const useUser = () => useSession((s) => s.session?.user ?? null);
