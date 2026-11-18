import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { router, Tabs } from 'expo-router';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown, ZoomIn, ZoomOut, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, fonts } from '@/config/theme';
import { Icon, type IconName } from '@/components/Icon';
import { useLayout } from '@/lib/hooks';
import { SiteHeader } from '@/components/site/SiteHeader';
import { cartItemCount, useCartStore } from '@/store/cart';
import { useCartQuote } from '@/lib/hooks';
import { formatEuro } from '@/lib/price';
import { usePreferences } from '@/store/preferences';
import { useSession } from '@/store/session';

const tabs: Array<{ name: string; title: string; icon: IconName; hidden?: boolean }> = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'catalog', title: 'Categorie', icon: 'grid' },
  { name: 'cart', title: 'Carrello', icon: 'cart' },
  { name: 'profile', title: 'Profilo', icon: 'user' },
  // Favourites and orders stay tab routes (deep links, back stack), reached from the header heart and Profilo.
  { name: 'favorites', title: 'Preferiti', icon: 'heart', hidden: true },
  { name: 'orders', title: 'Ordini', icon: 'box', hidden: true },
  // Product lists (department, subcategory, offers): their own screen under the Categorie tab.
  { name: 'prodotti', title: 'Prodotti', icon: 'grid', hidden: true },
];
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
const visible = tabs.filter((t) => !t.hidden);
/** The cart bar rises 12 px while it fades in (no spring: it settles at once), and fades out downwards. */
const BAR_IN = FadeInDown.duration(220).withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] });
/** How long the cart bar stays up after an add. */
const BAR_MS = 3500;

/**
 * Phone tab bar (design F): a floating deep-green pill on the ivory ground; the active tab is a yellow pill
 * with its label. With something in the cart, the Carrello tab shows the count on its icon and the total as
 * its label. Right after an add, a white cart bar rises above the tab bar for a few seconds ("Vai al carrello"),
 * then goes away so it does not cover the products.
 */
function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const count = cartItemCount(useCartStore((s) => s.items));
  // Swipe the bar left or right to tuck it into a small round handle at that side (the page gets the whole
  // screen); tap the handle, or pull it towards the middle, to bring the bar back.
  const [tucked, setTucked] = useState<null | 'left' | 'right'>(null);
  const x = useSharedValue(0);
  const tuck = (side: 'left' | 'right') => setTucked(side);
  const pillPan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
    onPanResponderMove: (_e, g) => { x.value = g.dx; },
    onPanResponderRelease: (_e, g) => {
      if (Math.abs(g.dx) > 90 || Math.abs(g.vx) > 0.6) {
        const side = g.dx < 0 ? 'left' : 'right';
        x.value = withTiming(side === 'left' ? -width : width, { duration: 180 }, () => scheduleOnRN(tuck, side));
      } else x.value = withSpring(0, { damping: 18, stiffness: 220 });
    },
    onPanResponderTerminate: () => { x.value = withSpring(0); },
  }), [width]); // eslint-disable-line react-hooks/exhaustive-deps
  const untuck = () => {
    const side = tucked;
    setTucked(null);
    x.value = side === 'left' ? -width * 0.6 : width * 0.6;
    x.value = withSpring(0, { damping: 18, stiffness: 200 });
  };
  const handlePan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8,
    onPanResponderRelease: (_e, g) => { if ((tucked === 'left' && g.dx > 30) || (tucked === 'right' && g.dx < -30)) untuck(); },
  }), [tucked]); // eslint-disable-line react-hooks/exhaustive-deps
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], opacity: 1 - Math.min(0.6, Math.abs(x.value) / (width * 1.2)) }));
  const current = state.routes[state.index]?.name ?? 'index';
  const { quote } = useCartQuote();
  // The cart bar: shown when the count goes up, hidden again after BAR_MS (each new add restarts the wait).
  const [bar, setBar] = useState(false);
  const before = useRef(count);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (count > before.current) {
      setBar(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setBar(false), BAR_MS);
    } else if (count === 0) setBar(false);
    before.current = count;
  }, [count]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // The cart is a full page with its own back button and checkout sheet (design F): no tab bar there.
  // The search page (catalog with ?search) is a focused page too.
  const params = state.routes[state.index]?.params as { search?: string } | undefined;
  if (current === 'cart' || (current === 'catalog' && !!params?.search)) return null;
  // The cart total is the server quote (never computed here); "Carrello" until it arrives.
  const total = count > 0 && quote ? formatEuro(quote.subtotal_cents).replace(/€\s/, '€') : '';
  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) return;
    // "Categorie" always opens the whole catalogue (not a filter left from "In offerta" or a department).
    if (name === 'catalog') navigation.navigate('catalog', { offerte: '', evidenza: '', category: '' });
    else navigation.navigate(name);
  };
  const cartBar = bar && count > 0;
  return <View pointerEvents={tucked ? 'box-none' : 'auto'}
    style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }, tucked && styles.dockTucked]}>
    {cartBar && <Animated.View entering={BAR_IN} exiting={FadeOutDown.duration(180)}
      accessibilityLiveRegion="polite">
      <Pressable onPress={() => { setBar(false); go('cart'); }} accessibilityRole="button" accessibilityLabel={`Vai al carrello, ${count} ${count === 1 ? 'articolo' : 'articoli'}`}
        style={({ pressed }) => [styles.mini, pressed && { opacity: 0.92 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.miniLabel} numberOfLines={1}>{count === 1 ? '1 articolo nel carrello' : `${count} articoli nel carrello`}</Text>
          {/* The total is the server quote (never computed here); hidden until it arrives. */}
          <Text style={styles.miniTotal}>{total || ' '}</Text>
        </View>
        <View style={styles.miniCta}><Text style={styles.miniCtaText}>Vai al carrello</Text></View>
      </Pressable>
    </Animated.View>}
    {tucked ? <Animated.View entering={ZoomIn.springify().damping(15)} exiting={ZoomOut.duration(120)} {...handlePan.panHandlers}
      style={[styles.handleWrap, tucked === 'left' ? { alignSelf: 'flex-start' } : { alignSelf: 'flex-end' }]}>
      <Pressable onPress={untuck} accessibilityRole="button" accessibilityLabel="Mostra il menu" hitSlop={8}
        style={({ pressed }) => [styles.handle, pressed && { transform: [{ scale: 0.94 }] }]}>
        <Icon name={visible.find((t) => t.name === current)?.icon ?? (current === 'prodotti' ? 'grid' : 'menu')} size={22} color={colors.text} strokeWidth={2} />
        {count > 0 && <View style={styles.handleBadge}><Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text></View>}
        <View style={[styles.handleGrip, tucked === 'left' ? { right: 7 } : { left: 7 }]} />
      </Pressable>
    </Animated.View>
    : <Animated.View style={[styles.pill, pillStyle]} accessibilityRole="tablist" {...pillPan.panHandlers}>
      {visible.map((tab) => {
        const on = current === tab.name || (tab.name === 'profile' && current === 'orders') || (tab.name === 'catalog' && current === 'prodotti');
        const badge = tab.name === 'cart' && count > 0 ? (count > 99 ? '99+' : String(count)) : '';
        return <Pressable key={tab.name} onPress={() => go(tab.name)} accessibilityRole="tab" accessibilityState={{ selected: on }}
          accessibilityLabel={badge ? `${tab.title}, ${count} ${count === 1 ? 'articolo' : 'articoli'}${total ? `, ${total}` : ''}` : tab.title}
          style={[styles.tab, on && styles.tabOn]}>
          <View>
            <Icon name={tab.icon} size={21} color={colors.text} strokeWidth={on ? 1.9 : 1.8}
              fill={on && tab.icon !== 'cart' ? colors.text : undefined} />
            {!!badge && !on && <Animated.View key={badge} entering={ZoomIn.springify()} style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text></Animated.View>}
          </View>
          {/* Every tab is named, not only the chosen one: four icons alone leave the shop guessing. */}
          <Text style={[styles.tabLabel, on && styles.tabLabelOn, tab.name === 'cart' && total && styles.tabTotal]} numberOfLines={1}>
            {tab.name === 'cart' && total ? total : tab.title}</Text>
        </Pressable>;
      })}
    </Animated.View>}
  </View>;
}

export default function TabsLayout() {
  const { wide } = useLayout();
  // First launch of the app (not the web shop): the welcome steps, once. Signed-in customers skip it.
  const onboarded = usePreferences((p) => p.onboarded);
  const setOnboarded = usePreferences((p) => p.setOnboarded);
  const session = useSession();
  useEffect(() => {
    if (Platform.OS === 'web' || onboarded || !session.ready) return;
    if (session.session) { setOnboarded(); return; }
    const t = setTimeout(() => router.push('/benvenuto'), 0);
    return () => clearTimeout(t);
  }, [onboarded, session.ready, session.session, setOnboarded]);
  // Desktop web shop: the catalogue masthead (search, wordmark, departments) replaces the tab bar.
  // Back follows the order the screens were opened in (a product list returns to Home or Categorie, whichever opened it).
  return <Tabs backBehavior="history" tabBar={wide ? () => <SiteHeader /> : (props) => <FloatingTabBar {...props} />} screenOptions={{
    headerShown: false, tabBarPosition: wide ? 'top' : 'bottom',
  }}>
    {tabs.map((tab) => <Tabs.Screen key={tab.name} name={tab.name}
      options={{ title: tab.title, href: tab.hidden ? null : undefined }} />)}
  </Tabs>;
}

const styles = StyleSheet.create({
  dock: { backgroundColor: colors.page, paddingHorizontal: 12, paddingTop: 6, gap: 8 },
  // Tucked away: no room taken from the page; only the handle (and the cart bar after an add) float over it.
  dockTucked: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' },
  handleWrap: { width: 58, height: 58 },
  handle: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#143019', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  handleBadge: { position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10,
    backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.page },
  // A short grip on the inner side: "pull me out".
  handleGrip: { position: 'absolute', top: 21, width: 3, height: 16, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, paddingLeft: 18, paddingRight: 8, borderRadius: 20, backgroundColor: '#FFFFFF',
    shadowColor: '#18201A', shadowOpacity: 0.22, shadowRadius: 34, shadowOffset: { width: 0, height: 14 }, elevation: 8, borderWidth: 1, borderColor: colors.line },
  miniLabel: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.muted },
  miniTotal: { fontSize: 18, fontFamily: fonts.heavy, color: colors.text },
  miniCta: { height: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.green, justifyContent: 'center' },
  miniCtaText: { fontSize: 14.5, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  // userSelect: a swipe on the web must not select the labels.
  // White floating bar with a hairline and a soft shadow; the chosen tab on the logo lime.
  pill: { flexDirection: 'row', alignItems: 'center', height: 66, borderRadius: 33, paddingHorizontal: 7, backgroundColor: '#FFFFFF', userSelect: 'none',
    borderWidth: 1, borderColor: colors.line, shadowColor: '#143019', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  tab: { flex: 1, height: 54, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabOn: { backgroundColor: colors.yellow },
  tabLabel: { fontSize: 11.5, fontFamily: fonts.sansBold, color: colors.muted },
  tabTotal: { fontFamily: fonts.heavy, color: colors.text },
  tabLabelOn: { fontFamily: fonts.heavy, color: colors.text },
  badge: { position: 'absolute', top: -7, right: -12, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10,
    backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11.5, fontFamily: fonts.heavy, color: '#FFFFFF' },
});
