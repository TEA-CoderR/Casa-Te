import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/config/theme';
import { Icon, type IconName } from '@/components/Icon';
import { useLayout } from '@/lib/hooks';
import { SiteHeader } from '@/components/site/SiteHeader';
import { cartItemCount, useCartStore } from '@/store/cart';

const tabs: Array<{ name: string; title: string; icon: IconName; hidden?: boolean }> = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'catalog', title: 'Categorie', icon: 'grid' },
  { name: 'cart', title: 'Carrello', icon: 'cart' },
  { name: 'profile', title: 'Profilo', icon: 'user' },
  // Favourites and orders stay tab routes (deep links, back stack), reached from the header heart and Profilo.
  { name: 'favorites', title: 'Preferiti', icon: 'heart', hidden: true },
  { name: 'orders', title: 'Ordini', icon: 'box', hidden: true },
];

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  const count = cartItemCount(useCartStore((s) => s.items));
  // Desktop web shop: the catalogue masthead (search, wordmark, departments) replaces the tab bar.
  return <Tabs tabBar={wide ? () => <SiteHeader /> : undefined} screenOptions={{
    headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: colors.faint,
    tabBarPosition: wide ? 'top' : 'bottom',
    tabBarVariant: 'uikit',
    tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: colors.line, borderTopWidth: 1, height: 62 + Math.max(insets.bottom, 10),
      paddingBottom: Math.max(insets.bottom, 10), paddingTop: 0, elevation: 0 },
    tabBarLabelStyle: { fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: '600', marginTop: 0 },
    tabBarBadgeStyle: { backgroundColor: colors.sale, fontSize: 11, fontFamily: fonts.heavy, color: '#fff', minWidth: 18, height: 18, lineHeight: 18 },
  }}>
    {tabs.map((tab) => <Tabs.Screen key={tab.name} name={tab.name}
      // The "Categorie" tab always opens the whole catalogue (not a filter left from "In offerta" or a department).
      listeners={tab.name === 'catalog' ? ({ navigation }) => ({
        tabPress: (e) => { e.preventDefault(); navigation.navigate('catalog', { offerte: '', evidenza: '', category: '' }); },
      }) : undefined}
      options={{
      title: tab.title, href: tab.hidden ? null : undefined,
      tabBarBadge: tab.name === 'cart' && count > 0 ? (count > 99 ? '99+' : count) : undefined,
      tabBarAccessibilityLabel: tab.name === 'cart' && count > 0 ? `Carrello, ${count} articoli` : undefined,
      tabBarIcon: ({ color, focused }) => <View style={{ width: 56, height: 34, alignItems: 'center', justifyContent: 'flex-end' }}>
        {/* Active tab: a short brand-green bar on the top edge and a solid icon (design D). */}
        {focused && <View style={{ position: 'absolute', top: 0, width: 36, height: 4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, backgroundColor: colors.brand }} />}
        <Icon name={tab.icon} color={color} size={24} strokeWidth={focused ? 1.6 : 1.8} fill={focused && tab.icon !== 'cart' ? color : undefined} />
      </View>,
    }} />)}
  </Tabs>;
}
