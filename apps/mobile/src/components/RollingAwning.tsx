import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolateColor, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue, useSharedValue,
  ZoomIn, ZoomOut,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, fonts } from '@/config/theme';
import { BAND_RADIUS, HeaderBack } from './BrandHeader';
import { Icon } from './Icon';

/** Band height (below the status bar) once rolled up: just the buttons row. */
const COLLAPSED = 70;
/** Scroll distance over which the header settles into its slim state. */
const RANGE = 60;
/** The "back to top" button appears after this much scrolling… */
const TOP_AFTER = 360;
/** …and hides again once the page has been still this long (ms). */
const TOP_IDLE = 2000;

/**
 * Department page header: a solid green band with the department title in one row between the back and search
 * buttons and rounded bottom corners, so the products start high on the page. Scrolling down the title fades away,
 * the band slims and the round search button stretches into a white "Cerca in …" pill. The pill names the department, but the
 * search page always searches the whole catalogue. The chips scroll away with the products. A "back to top" button
 * rises while scrolling and hides once the page has been still for a moment.
 */
export function RollingAwning({ title, subtitle, onBack, searchScope, onSearch, chips, overlay, children }: {
  title: string; subtitle?: string; onBack?: () => void;
  /** Department named in the pill ("Cerca in Profumeria"); without it "Cerca in tutti i prodotti". */
  searchScope?: string;
  /** Opens the search page (it searches every department). */
  onSearch: () => void;
  /** Chips row content (horizontal scroll), at the top of the scrolling content. */
  chips: ReactNode;
  /** Sheets and other overlays rendered over the page. */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const y = useSharedValue(0);
  // Expanded band height (below the status bar): the title sits between the back and search buttons, so the band is
  // one row high (padding 14 + the taller of buttons and title + padding 16) and the products start right below it.
  const [titleH, setTitleH] = useState(48);
  const expanded = 14 + Math.max(44, titleH) + 16;
  const exp = useDerivedValue(() => expanded);
  const [showTop, setShowTop] = useState(false);

  const onScroll = useAnimatedScrollHandler((e) => { y.value = e.contentOffset.y; });
  // "Torna su": shown while the page moves past TOP_AFTER, hidden after TOP_IDLE ms without scrolling.
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = (at: number) => {
    if (idle.current) clearTimeout(idle.current);
    if (at <= TOP_AFTER) { setShowTop(false); return; }
    setShowTop(true);
    idle.current = setTimeout(() => setShowTop(false), TOP_IDLE);
  };
  useEffect(() => () => { if (idle.current) clearTimeout(idle.current); }, []);
  useAnimatedReaction(() => Math.round(y.value / 8), (now, before) => { if (before !== null && now !== before) scheduleOnRN(moved, now * 8); });

  const ease = useDerivedValue(() => {
    const p = Math.max(0, Math.min(1, y.value / RANGE));
    return p * p * (3 - 2 * p);
  });
  const band = useDerivedValue(() => exp.value - (exp.value - COLLAPSED) * ease.value);

  const bandStyle = useAnimatedStyle(() => ({ height: insets.top + band.value }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - ease.value * 1.9),
    transform: [{ translateY: -10 * ease.value }],
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

  return <View style={styles.page}>
    <Animated.ScrollView ref={ref} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: insets.top + expanded + 6, paddingBottom: 24 }}>
      <View style={{ paddingTop: 6 }}>{chips}</View>
      {children}
    </Animated.ScrollView>

    <Animated.View style={[styles.band, bandStyle]}>
      <Animated.View style={[styles.titleBlock, { top: insets.top + 14 + Math.max(0, (44 - titleH) / 2), left: onBack ? 16 + 44 + 12 : 16 }, titleStyle]}
        onLayout={(e: LayoutChangeEvent) => { const h = Math.ceil(e.nativeEvent.layout.height); if (h && h !== titleH) setTitleH(h); }}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </Animated.View>
    </Animated.View>

    {onBack && <View style={[styles.back, { top: insets.top + 14 }]}><HeaderBack onPress={onBack} /></View>}
    <Animated.View style={[styles.pill, { top: insets.top + 14 }, pillStyle]}>
      <Pressable onPress={onSearch} accessibilityRole="search" accessibilityLabel={`Cerca in ${searchScope ?? 'tutti i prodotti'}`}
        style={({ pressed }) => [styles.pillInner, pressed && { opacity: 0.8 }]}>
        <View style={{ width: 20, height: 20 }}>
          <Animated.View style={[StyleSheet.absoluteFill, whiteIcon]}><Icon name="search" size={20} color="#FFFFFF" strokeWidth={2.1} /></Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, darkIcon]}><Icon name="search" size={20} color={colors.text} strokeWidth={2.1} /></Animated.View>
        </View>
        <Animated.Text style={[styles.pillText, labelStyle]} numberOfLines={1}>
          Cerca in <Text style={styles.pillScope}>{searchScope ?? 'tutti i prodotti'}</Text>
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
  band: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: colors.brand, overflow: 'hidden', zIndex: 3,
    borderBottomLeftRadius: BAND_RADIUS, borderBottomRightRadius: BAND_RADIUS },
  titleBlock: { position: 'absolute', right: 16 + 44 + 10 },
  title: { fontFamily: fonts.display, color: '#FFFFFF', fontSize: 25, lineHeight: 29, letterSpacing: -0.2 },
  subtitle: { fontSize: 13, lineHeight: 17, fontFamily: fonts.sans, color: colors.onBrand },
  back: { position: 'absolute', left: 16, zIndex: 4 },
  pill: { position: 'absolute', right: 16, zIndex: 4, height: 44, borderRadius: 22, overflow: 'hidden',
    shadowColor: '#0A180C', shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  pillInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  pillText: { flex: 1, fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.muted },
  pillScope: { fontFamily: fonts.heavy, color: colors.text },
  toTop: { position: 'absolute', right: 16, bottom: 16, zIndex: 5 },
  toTopButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, shadowColor: '#18201A', shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
});
