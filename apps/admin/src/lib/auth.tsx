import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { StaffMemberRow, StaffRole } from '@casa-te/shared';
import { supabase } from './supabase';

type AuthState = {
  session: Session | null;
  staff: StaffMemberRow | null;
  loading: boolean;
  can: (...roles: StaffRole[]) => boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<StaffMemberRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async (s: Session | null) => {
      setSession(s);
      if (!s) { setStaff(null); setLoading(false); return; }
      const { data } = await supabase.from('staff_members').select('*').eq('user_id', s.user.id).eq('active', true).maybeSingle();
      if (active) { setStaff((data as StaffMemberRow | null) ?? null); setLoading(false); }
    };
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { void load(s); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const value: AuthState = {
    session, staff, loading,
    can: (...roles) => Boolean(staff && roles.includes(staff.role)),
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
