import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeOutDown, SlideInDown, ZoomIn } from 'react-native-reanimated';
import { colors, fonts } from '@/config/theme';
import { Icon, type IconName } from '@/components/Icon';
import { useLayout } from '@/lib/hooks';
import { SiteHeader } from '@/components/site/SiteHeader';
import { cartItemCount, useCartStore } from '@/store/cart';
import { useCartQuote } from '@/lib/hooks';
import { formatEuro } from '@/lib/price';

const tabs: Array<{ name: string; title: string; icon: IconName; hidden?: boolean }> = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'catalog', title: 'Categorie', icon: 'grid' },
  { name: 'cart', title: 'Carrello', icon: 'cart' },
  { name: 'profile', title: 'Profilo', icon: 'user' },
  // Favourites and orders stay tab routes (deep links, back stack), reached from the header heart and Profilo.
  { name: 'favorites', title: 'Preferiti', icon: 'heart', hidden: true },
  { name: 'orders', title: 'Ordini', icon: 'box', hidden: true },
];
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
const visible = tabs.filter((t) => !t.hidden);
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
  const count = cartItemCount(useCartStore((s) => s.items));
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
  return <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
    {bar && count > 0 && <Animated.View entering={SlideInDown.springify().damping(18)} exiting={FadeOutDown.duration(220)} style={styles.barWrap}
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
    <View style={styles.pill} accessibilityRole="tablist">
      {visible.map((tab) => {
        const on = current === tab.name || (tab.name === 'profile' && current === 'orders');
        const badge = tab.name === 'cart' && count > 0 ? (count > 99 ? '99+' : String(count)) : '';
        return <Pressable key={tab.name} onPress={() => go(tab.name)} accessibilityRole="tab" accessibilityState={{ selected: on }}
          accessibilityLabel={badge ? `${tab.title}, ${count} ${count === 1 ? 'articolo' : 'articoli'}${total ? `, ${total}` : ''}` : tab.title}
          style={[styles.tab, on && styles.tabOn]}>
          <View>
            <Icon name={tab.icon} size={21} color={on ? colors.text : '#FFFFFF'} strokeWidth={on ? 1.9 : 1.8}
              fill={on && tab.icon !== 'cart' ? colors.text : undefined} />
            {!!badge && !on && <Animated.View key={badge} entering={ZoomIn.springify()} style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text></Animated.View>}
          </View>
          {/* Every tab is named, not only the chosen one: four icons alone leave the shop guessing. */}
          <Text style={[styles.tabLabel, on && styles.tabLabelOn, tab.name === 'cart' && total && styles.tabTotal]} numberOfLines={1}>
            {tab.name === 'cart' && total ? total : tab.title}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

export default function TabsLayout() {
  const { wide } = useLayout();
  // Desktop web shop: the catalogue masthead (search, wordmark, departments) replaces the tab bar.
  return <Tabs tabBar={wide ? () => <SiteHeader /> : (props) => <FloatingTabBar {...props} />} screenOptions={{
    headerShown: false, tabBarPosition: wide ? 'top' : 'bottom',
  }}>
    {tabs.map((tab) => <Tabs.Screen key={tab.name} name={tab.name}
      options={{ title: tab.title, href: tab.hidden ? null : undefined }} />)}
  </Tabs>;
}

const styles = StyleSheet.create({
  dock: { backgroundColor: colors.page, paddingHorizontal: 12, paddingTop: 6, gap: 8 },
  // Over the page, just above the tab bar: it does not push the content up while it is shown.
  barWrap: { position: 'absolute', left: 12, right: 12, bottom: '100%', marginBottom: 2 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, paddingLeft: 18, paddingRight: 8, borderRadius: 20, backgroundColor: '#FFFFFF',
    shadowColor: '#18201A', shadowOpacity: 0.22, shadowRadius: 34, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
  miniLabel: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.muted },
  miniTotal: { fontSize: 18, fontFamily: fonts.heavy, color: colors.text },
  miniCta: { height: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.green, justifyContent: 'center' },
  miniCtaText: { fontSize: 14.5, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  pill: { flexDirection: 'row', alignItems: 'center', height: 66, borderRadius: 33, paddingHorizontal: 7, backgroundColor: colors.green,
    shadowColor: '#143019', shadowOpacity: 0.35, shadowRadius: 28, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  tab: { flex: 1, height: 54, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabOn: { backgroundColor: colors.yellow },
  tabLabel: { fontSize: 11.5, fontFamily: fonts.sansBold, color: colors.onBrand },
  tabTotal: { fontFamily: fonts.heavy, color: '#FFFFFF' },
  tabLabelOn: { fontFamily: fonts.heavy, color: colors.text },
  badge: { position: 'absolute', top: -7, right: -12, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10,
    backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11.5, fontFamily: fonts.heavy, color: colors.text },
});
