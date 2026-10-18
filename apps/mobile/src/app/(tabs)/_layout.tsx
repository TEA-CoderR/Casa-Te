import type { ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown, ZoomIn } from 'react-native-reanimated';
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
/** Pages where the mini cart rises above the tab bar once something is in the cart. */
const SHOPPING = new Set(['index', 'catalog', 'favorites']);

/**
 * Phone tab bar (design F): a floating deep-green pill on the ivory ground; the active tab is a yellow pill
 * with its label. While shopping, a white mini cart rises above it with the item count.
 */
function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const count = cartItemCount(useCartStore((s) => s.items));
  const current = state.routes[state.index]?.name ?? 'index';
  const { quote } = useCartQuote();
  // The cart is a full page with its own back button and checkout sheet (design F): no tab bar there.
  // The search page (catalog with ?search) is a focused page too.
  const params = state.routes[state.index]?.params as { search?: string } | undefined;
  if (current === 'cart' || (current === 'catalog' && !!params?.search)) return null;
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
    {SHOPPING.has(current) && count > 0 && <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown.duration(160)}>
      <Pressable onPress={() => go('cart')} accessibilityRole="button" accessibilityLabel={`Vai al carrello, ${count} articoli`}
        style={({ pressed }) => [styles.mini, pressed && { opacity: 0.92 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.miniLabel} numberOfLines={1}>{count === 1 ? '1 articolo nel carrello' : `${count} articoli nel carrello`}</Text>
          {/* The total is the server quote (never computed here); hidden until it arrives. */}
          <Text style={styles.miniTotal}>{quote ? formatEuro(quote.subtotal_cents).replace(/€\s/, '€') : ' '}</Text>
        </View>
        <View style={styles.miniCta}><Text style={styles.miniCtaText}>Vai al carrello</Text></View>
      </Pressable>
    </Animated.View>}
    <View style={styles.pill} accessibilityRole="tablist">
      {visible.map((tab) => {
        const on = current === tab.name || (tab.name === 'profile' && current === 'orders');
        const badge = tab.name === 'cart' && count > 0 ? (count > 99 ? '99+' : String(count)) : '';
        return <Pressable key={tab.name} onPress={() => go(tab.name)} accessibilityRole="tab" accessibilityState={{ selected: on }}
          accessibilityLabel={badge ? `${tab.title}, ${count} articoli` : tab.title}
          style={[styles.tab, on && styles.tabOn]}>
          <View>
            <Icon name={tab.icon} size={22} color={on ? colors.text : '#FFFFFF'} strokeWidth={on ? 1.9 : 1.8}
              fill={on && tab.icon !== 'cart' ? colors.text : undefined} />
            {!!badge && !on && <Animated.View key={badge} entering={ZoomIn.springify()} style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text></Animated.View>}
          </View>
          {on && <Text style={styles.tabLabel} numberOfLines={1}>{tab.title}</Text>}
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
  mini: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, paddingLeft: 18, paddingRight: 8, borderRadius: 20, backgroundColor: '#FFFFFF',
    shadowColor: '#18201A', shadowOpacity: 0.22, shadowRadius: 34, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
  miniLabel: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.muted },
  miniTotal: { fontSize: 18, fontFamily: fonts.heavy, color: colors.text },
  miniCta: { height: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.green, justifyContent: 'center' },
  miniCtaText: { fontSize: 14.5, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  pill: { flexDirection: 'row', alignItems: 'center', height: 66, borderRadius: 33, paddingHorizontal: 7, backgroundColor: colors.green,
    shadowColor: '#143019', shadowOpacity: 0.35, shadowRadius: 28, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  tab: { flex: 1, height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  tabOn: { flex: 1.6, backgroundColor: colors.yellow },
  tabLabel: { fontSize: 14.5, fontFamily: fonts.heavy, color: colors.text, flexShrink: 1 },
  badge: { position: 'absolute', top: -7, right: -12, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10,
    backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11.5, fontFamily: fonts.heavy, color: colors.text },
});
