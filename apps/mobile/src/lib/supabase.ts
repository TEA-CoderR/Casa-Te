import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False until apps/mobile/.env is filled in; the app then shows a setup notice. */
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = createClient(SUPABASE_URL || 'http://localhost:54321', SUPABASE_ANON_KEY || 'not-configured', {
  auth: {
    // Web uses localStorage (the default); native persists the session in AsyncStorage.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Refresh tokens only while the app is in the foreground (Supabase React Native guidance).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
