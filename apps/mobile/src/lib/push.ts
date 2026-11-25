// Push notifications (plan v3 L2): "your order is ready", cancellations, refunds, return answers — never marketing.
// Asked for at the right moment (after the first order, or from Profilo → Notifiche), never at app start.
// The phone's Firebase token is saved for the signed-in customer (register_push_token); turning notifications off
// or signing out deletes it. Tapping a notification opens the order. Phones only.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export const pushSupported = Platform.OS === 'android' || Platform.OS === 'ios';

/** The customer's choice on this phone (the system permission can still be refused or revoked). */
export const usePushPreference = create<{ enabled: boolean; asked: boolean; set: (enabled: boolean) => void }>()(persist((set) => ({
  enabled: false, asked: false, set: (enabled) => set({ enabled, asked: true }),
}), { name: 'casa-te-push-v1', storage: createJSONStorage(() => AsyncStorage) }));

if (pushSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

async function channel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Ordini', description: 'Ordine pronto, annullato, rimborsi e resi',
      importance: Notifications.AndroidImportance.HIGH, lightColor: '#CDE434',
    });
  }
}

async function deviceToken(): Promise<string | null> {
  try { return (await Notifications.getDevicePushTokenAsync()).data as string; } catch { return null; }
}

/** Saves this phone for the signed-in customer, if notifications are on and allowed. */
export async function syncPushToken(): Promise<void> {
  if (!pushSupported || !usePushPreference.getState().enabled) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  await channel();
  const token = await deviceToken();
  if (token) await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
}

/** Asks the system once and turns notifications on. Returns whether they are on. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported) return false;
  await channel();
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  usePushPreference.getState().set(perm.granted);
  if (perm.granted) await syncPushToken().catch(() => {});
  return perm.granted;
}

/** Turns notifications off on this phone (and forgets its token), e.g. from Profilo or before signing out. */
export async function disablePush(keepChoice = false): Promise<void> {
  if (!keepChoice) usePushPreference.getState().set(false);
  if (!pushSupported) return;
  const token = await deviceToken();
  if (token) await supabase.from('push_tokens').delete().eq('token', token);
}

/** Opens the order of a tapped notification (also when it started the app). */
export function listenForPushTaps(): () => void {
  if (!pushSupported) return () => {};
  const open = (r: Notifications.NotificationResponse | null) => {
    const id = r?.notification.request.content.data?.order_id;
    if (typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) router.push(`/order/${id}`);
  };
  Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
