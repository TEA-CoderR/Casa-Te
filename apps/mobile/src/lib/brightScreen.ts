// While the member card's barcode is shown big: screen at full brightness and kept awake, then back as it was
// (plan v3 X7; the till scanner reads it at the first try). App brightness only, no permission; phones only.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const TAG = 'club-card';

export function useBrightScreen(active: boolean) {
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    let before: number | null = null;
    let cancelled = false;
    (async () => {
      try {
        before = await Brightness.getBrightnessAsync();
        if (!cancelled) await Brightness.setBrightnessAsync(1);
      } catch { /* not available: the card still shows */ }
      activateKeepAwakeAsync(TAG).catch(() => {});
    })();
    return () => {
      cancelled = true;
      deactivateKeepAwake(TAG).catch(() => {});
      if (Platform.OS === 'android') Brightness.restoreSystemBrightnessAsync().catch(() => {});
      else if (before != null) Brightness.setBrightnessAsync(before).catch(() => {});
    };
  }, [active]);
}
