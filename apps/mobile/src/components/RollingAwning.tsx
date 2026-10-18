import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolateColor, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue, useSharedValue,
  ZoomIn, ZoomOut,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, fonts } from '@/config/theme';
import { AwningEdge, AwningStripes, HeaderBack } from './BrandHeader';
import { Icon } from './Icon';

/** Band height (below the status bar) once rolled up: just the buttons row. */
const COLLAPSED = 70;
/** Scroll distance over which the awning rolls up. */
const RANGE = 110;
/** Height of the chips row (40 px chips + 6 above + 10 below). */
const CHIPS_H = 56;
/** The "back to top" button appears after this much scrolling. */
const TOP_AFTER = 360;
const EDGE = 12;

/**
 * Department page header (design G, "la tenda si arrotola"): the striped awning with the department title.
 * Scrolling down rolls it up into a slim bar (a rolled-cloth cylinder at its bottom edge, the scalloped valance
 * still attached), the title fades away and the round search button stretches into a white "Cerca in …" pill.
 * The chips stick under the rolled awning; the awning unrolls only back at the top of the page.
 * A "back to top" button rises after scrolling.
 */
export function RollingAwning({ title, subtitle, onBack, searchScope, onSearch, chips, overlay, resetKey, children }: {
  title: string; subtitle?: string; onBack?: () => void;
  /** Department name for "Cerca in {scope}"; without it the pill reads "Cerca prodotti". */
  searchScope?: string; onSearch: () => void;
  /** Chips row content (horizontal scroll), pinned under the rolled awning. */
  chips: ReactNode;
  /** Sheets and other overlays rendered over the page. */
  overlay?: ReactNode;
  /** When it changes (another chip), a page scrolled past the chips goes back to the start of the list. */
  resetKey?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const y = useSharedValue(0);
  // Expanded band height (below the status bar): padding 14 + buttons 44 + gap 12 + title block + padding 18.
  const [titleH, setTitleH] = useState(58);
  const expanded = 14 + 44 + 12 + titleH + 18;
  const exp = useDerivedValue(() => expanded);
  const [showTop, setShowTop] = useState(false);

  const onScroll = useAnimatedScrollHandler((e) => { y.value = e.contentOffset.y; });
  useAnimatedReaction(() => y.value > TOP_AFTER, (now, before) => { if (now !== before) scheduleOnRN(setShowTop, now); });

  // Another chip: keep the awning rolled, but show the new list from its start.
  const pinAt = expanded + EDGE - (COLLAPSED + EDGE);
  useEffect(() => {
    if (resetKey === undefined) return;
    if (y.value > pinAt) ref.current?.scrollTo({ y: pinAt, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const ease = useDerivedValue(() => {
    const p = Math.max(0, Math.min(1, y.value / RANGE));
    return p * p * (3 - 2 * p);
  });
  const band = useDerivedValue(() => exp.value - (exp.value - COLLAPSED) * ease.value);

  const bandStyle = useAnimatedStyle(() => ({ height: insets.top + band.value }));
  const edgeStyle = useAnimatedStyle(() => ({ top: insets.top + band.value - 1 }));
  const rollStyle = useAnimatedStyle(() => ({ height: 3 + 11 * ease.value }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - ease.value * 1.9),
    transform: [{ translateY: -28 * ease.value }, { scale: 1 - 0.12 * ease.value }],
  }));
  const pillMax = width - 16 - 44 - 10 - 16;
  const pillStyle = useAnimatedStyle(() => ({
    width: 44 + (pillMax - 44) * ease.value,
    backgroundColor: interpolateColor(Math.min(1, ease.value / 0.35), [0, 1], ['rgba(255,255,255,0.12)', '#FFFFFF']),
    shadowOpacity: ease.value > 0.5 ? 0.22 : 0,
    elevation: ease.value > 0.5 ? 4 : 0,
  }));
  const whiteIcon = useAnimatedStyle(() => ({ opacity: ease.value > 0.2 ? 0 : 1 }));
  const darkIcon = useAnimatedStyle(() => ({ opacity: ease.value > 0.2 ? 1 : 0 }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, (ease.value - 0.55) / 0.45) }));
  // The chips scroll with the page until they meet the rolled awning, then stay pinned under it.
  const chipsStyle = useAnimatedStyle(() => {
    const natural = insets.top + exp.value + EDGE - y.value;
    const pinned = insets.top + band.value + EDGE;
    return { top: Math.max(natural, pinned) };
  });
  const chipsShadow = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, (y.value - pinAt) / 30)) }));

  return <View style={styles.page}>
    <Animated.ScrollView ref={ref} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: insets.top + expanded + EDGE + CHIPS_H, paddingBottom: 24 }}>
      {children}
    </Animated.ScrollView>

    {/* Pinned chips: an ivory strip that also covers the products sliding under the valance. */}
    <Animated.View style={[styles.chips, chipsStyle]}>
      <View pointerEvents="none" style={styles.chipsBehind} />
      {chips}
      <Animated.View pointerEvents="none" style={[styles.chipsShadow, chipsShadow]} />
    </Animated.View>

    <Animated.View style={[styles.band, bandStyle]}>
      <AwningStripes />
      <Animated.View style={[styles.titleBlock, { top: insets.top + 14 + 44 + 12 }, titleStyle]}
        onLayout={(e: LayoutChangeEvent) => { const h = Math.ceil(e.nativeEvent.layout.height); if (h && h !== titleH) setTitleH(h); }}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>}
      </Animated.View>
      {/* The rolled cloth: a small cylinder that thickens as the awning rolls up. */}
      <Animated.View pointerEvents="none" style={[styles.roll, rollStyle]}>
        <View style={{ flex: 1.4, backgroundColor: '#102617' }} />
        <View style={{ flex: 1.2, backgroundColor: '#2F6A3A' }} />
        <View style={{ flex: 1, backgroundColor: '#3E7A48' }} />
        <View style={{ flex: 1.6, backgroundColor: '#1C3E24' }} />
        <View style={{ flex: 1, backgroundColor: '#0E2213' }} />
      </Animated.View>
    </Animated.View>
    <Animated.View pointerEvents="none" style={[styles.edge, edgeStyle]}><AwningEdge /></Animated.View>

    {onBack && <View style={[styles.back, { top: insets.top + 14 }]}><HeaderBack onPress={onBack} /></View>}
    <Animated.View style={[styles.pill, { top: insets.top + 14 }, pillStyle]}>
      <Pressable onPress={onSearch} accessibilityRole="search" accessibilityLabel={searchScope ? `Cerca in ${searchScope}` : 'Cerca prodotti'}
        style={({ pressed }) => [styles.pillInner, pressed && { opacity: 0.8 }]}>
        <View style={{ width: 20, height: 20 }}>
          <Animated.View style={[StyleSheet.absoluteFill, whiteIcon]}><Icon name="search" size={20} color="#FFFFFF" strokeWidth={2.1} /></Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, darkIcon]}><Icon name="search" size={20} color={colors.text} strokeWidth={2.1} /></Animated.View>
        </View>
        <Animated.Text style={[styles.pillText, labelStyle]} numberOfLines={1}>
          {searchScope ? <>Cerca in <Text style={styles.pillScope}>{searchScope}</Text></> : 'Cerca prodotti'}
        </Animated.Text>
      </Pressable>
    </Animated.View>

    {showTop && <Animated.View entering={ZoomIn.springify().damping(14)} exiting={ZoomOut.duration(160)} style={styles.toTop}>
      <Pressable onPress={() => ref.current?.scrollTo({ y: 0, animated: true })} accessibilityRole="button" accessibilityLabel="Torna su"
        style={({ pressed }) => [styles.toTopButton, pressed && { opacity: 0.85 }]}>
        <Icon name="up" size={22} color={colors.green} strokeWidth={2.4} />
      </Pressable>
    </Animated.View>}
    {overlay}
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: colors.brand, overflow: 'hidden', zIndex: 3 },
  titleBlock: { position: 'absolute', left: 16, right: 16, transformOrigin: 'left top' },
  title: { fontFamily: fonts.display, color: '#FFFFFF', fontSize: 34, lineHeight: 38, letterSpacing: -0.3 },
  subtitle: { fontSize: 14.5, fontFamily: fonts.sans, color: colors.onBrand, marginTop: 2 },
  roll: { position: 'absolute', left: 0, right: 0, bottom: 0, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 2, shadowOffset: { width: 0, height: 2 } },
  edge: { position: 'absolute', left: 0, right: 0, zIndex: 3 },
  back: { position: 'absolute', left: 16, zIndex: 4 },
  pill: { position: 'absolute', right: 16, zIndex: 4, height: 44, borderRadius: 22, overflow: 'hidden',
    shadowColor: '#0A180C', shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  pillInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  pillText: { flex: 1, fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.muted },
  pillScope: { fontFamily: fonts.heavy, color: colors.text },
  chips: { position: 'absolute', left: 0, right: 0, zIndex: 2, height: CHIPS_H, paddingTop: 6, backgroundColor: colors.page },
  chipsBehind: { position: 'absolute', left: 0, right: 0, top: -EDGE - 2, height: EDGE + 2, backgroundColor: colors.page },
  chipsShadow: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: colors.line },
  toTop: { position: 'absolute', right: 16, bottom: 16, zIndex: 5 },
  toTopButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, shadowColor: '#18201A', shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
});
