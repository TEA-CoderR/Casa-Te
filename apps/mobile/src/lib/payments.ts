import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import type { CheckoutResponse } from '@casa-te/shared';

const APP_RETURN = 'casate://checkout/return';

/**
 * Opens Stripe Checkout. Web: full-page redirect (Stripe returns to /checkout/return).
 * Native: in-app browser session; whatever happens (paid, cancelled, dismissed) we land on
 * /checkout/return, which reads the authoritative order status from the server.
 */
export async function openCheckout(res: CheckoutResponse): Promise<void> {
  if (Platform.OS === 'web') {
    window.location.assign(res.checkout_url);
    return;
  }
  let result: 'success' | 'cancel' = 'cancel';
  try {
    const outcome = await WebBrowser.openAuthSessionAsync(res.checkout_url, APP_RETURN);
    if (outcome.type === 'success' && /result=success/.test(outcome.url)) result = 'success';
  } catch {
    // Fall through to the return screen, which polls the order status.
  }
  router.replace({ pathname: '/checkout/return', params: { order: res.order_id, result } });
}
