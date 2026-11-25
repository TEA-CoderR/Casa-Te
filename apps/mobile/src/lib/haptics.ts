// A light touch on the moments that matter (plan v3 X5), never on every button: adding to the cart, changing a
// quantity, saving a product, a confirmed order, the member card opening. Phones only; silent where unsupported.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const on = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptic = {
  /** Added to the cart, a product saved, the card opened. */
  tap: () => { if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  /** A quantity changed. */
  tick: () => { if (on) Haptics.selectionAsync().catch(() => {}); },
  /** The order is confirmed. */
  success: () => { if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
};
