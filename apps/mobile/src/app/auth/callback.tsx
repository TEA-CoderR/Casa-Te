// Where Google sends the phone back (casate://auth/callback). The sign-in page finishes the session itself;
// if the system also opens this route, it waits a moment and then goes on to the profile (or back).
import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Loading } from '@/components/UI';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  useEffect(() => {
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace('/profile');
      else if (router.canGoBack()) router.back();
      else router.replace('/');
    }, 1500);
    return () => clearTimeout(t);
  }, []);
  return <Screen stack><Stack.Screen options={{ title: 'Accesso' }} /><Loading label="Accesso in corso…" /></Screen>;
}
