import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/config/theme';
import { LOGO_PARTS } from '@/config/logoPaths';

// Keep the native splash (the two C in lime on the shop-sign green) up until the animated one is drawn on top of it.
SplashScreen.preventAutoHideAsync().catch(() => {});

const W = 260;
const H = W / LOGO_PARTS.aspect;
const UNIT = W / 2901; // points per logo unit (viewBox width 2901)
// The two C sit in the upper part of the full logo; at the start they are centred on the screen, exactly where the
// native splash draws them (assets/brand/splash-mono.png, 104 pt wide), so the hand-over is invisible.
const MONO_SHIFT = (40 + 1376 / 2 - (50 + 694) / 2) * UNIT;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

const SEEN_KEY = 'casate.splash';
function seenThisSession() {
  if (Platform.OS !== 'web') return false;
  try { return window.sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}
function markSeen() {
  if (Platform.OS !== 'web') return;
  try { window.sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: play again next time */ }
}

function Part({ d }: { d: string }) {
  return <Svg width={W} height={H} viewBox={LOGO_PARTS.viewBox} style={StyleSheet.absoluteFill}>
    <Path d={d} fill={colors.signInk} fillRule="evenodd" />
  </Svg>;
}

/**
 * Opening animation: the two C rise, the name comes up under them, then the line "Per la tua casa e per te";
 * a short hold and the green sign fades away on the app. Once per launch (on the web shop once per visit).
 */
export function AnimatedSplash({ ready, skip = false }: { ready: boolean; skip?: boolean }) {
  const [done, setDone] = useState(() => skip || seenThisSession());
  const mono = useSharedValue(MONO_SHIFT);
  const word = useSharedValue(0);
  const tag = useSharedValue(0);
  const veil = useSharedValue(1);

  useEffect(() => {
    if (done) { SplashScreen.hideAsync().catch(() => {}); return; }
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    markSeen();
    mono.value = withDelay(250, withTiming(0, { duration: 650, easing: EASE }));
    word.value = withDelay(420, withTiming(1, { duration: 560, easing: EASE }));
    tag.value = withDelay(820, withTiming(1, { duration: 480, easing: EASE }));
    veil.value = withDelay(1650, withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished) scheduleOnRN(setDone, true);
    }));
  }, [ready, done]);

  const monoStyle = useAnimatedStyle(() => ({ transform: [{ translateY: mono.value }] }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value, transform: [{ translateY: (1 - word.value) * 14 }] }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tag.value, transform: [{ translateY: (1 - tag.value) * 8 }] }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));

  if (done) return null;
  return <Animated.View style={[StyleSheet.absoluteFill, styles.ground, veilStyle]} pointerEvents="none"
    accessibilityLabel="Casa & Te — Per la tua casa e per te" accessibilityRole="image">
    <View style={{ width: W, height: H }}>
      <Animated.View style={[StyleSheet.absoluteFill, monoStyle]}><Part d={LOGO_PARTS.mono} /></Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, wordStyle]}><Part d={LOGO_PARTS.word} /></Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, tagStyle]}><Part d={LOGO_PARTS.tag} /></Animated.View>
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  ground: { backgroundColor: colors.sign, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
});
