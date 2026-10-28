import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useSession } from './session';

/**
 * Club membership of the signed-in customer, loaded once per user and shared by every price on screen
 * (display only: quote_cart decides on the server whether the member price is charged).
 */
type ClubState = { userId: string | null; member: boolean; load: (userId: string | null) => Promise<void>; set: (member: boolean) => void };

export const useClubStore = create<ClubState>((set, get) => ({
  userId: null,
  member: false,
  load: async (userId) => {
    if (!userId) { set({ userId: null, member: false }); return; }
    if (get().userId !== userId) set({ userId, member: false });
    const { data } = await supabase.from('profiles').select('club_member_since').eq('id', userId).maybeSingle();
    if (get().userId === userId) set({ member: !!data?.club_member_since });
  },
  set: (member) => set({ member }),
}));

let started = false;
/** Follows sign-in / sign-out. Called from the root layout next to the session listener. */
export function startClubListener() {
  if (started) return;
  started = true;
  let last: string | null | undefined;
  const sync = (id: string | null) => { if (id !== last) { last = id; void useClubStore.getState().load(id); } };
  sync(useSession.getState().session?.user?.id ?? null);
  useSession.subscribe((s) => sync(s.session?.user?.id ?? null));
}

export const useClubMember = () => useClubStore((s) => s.member);
