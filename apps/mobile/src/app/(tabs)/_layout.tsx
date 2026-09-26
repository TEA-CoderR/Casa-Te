import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/config/theme';
import { cartItemCount, useCartStore } from '@/store/cart';
import { Icon, type IconName } from '@/components/Icon';
import { useLayout } from '@/lib/hooks';

const tabs: Array<{ name: string; title: string; icon: IconName }> = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'catalog', title: 'Catalogo', icon: 'grid' },
  { name: 'cart', title: 'Carrello', icon: 'bag' },
  { name: 'orders', title: 'Ordini', icon: 'box' },
  { name: 'profile', title: 'Profilo', icon: 'user' },
];

export default function TabsLayout() {
  const count = cartItemCount(useCartStore((s) => s.items));
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  return <Tabs screenOptions={{
    headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: '#8B9187',
    // Desktop web shop: navigation as a sidebar instead of a phone-style bottom bar.
    tabBarPosition: wide ? 'left' : 'bottom',
    tabBarVariant: wide ? 'material' : 'uikit',
    tabBarStyle: wide
      ? { backgroundColor: '#FFFFFF', borderRightColor: '#EBEDE7', minWidth: 200, paddingTop: 24 }
      : { backgroundColor: '#FFFFFF', borderTopColor: '#EBEDE7', height: 64 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8), paddingTop: 7, elevation: 0 },
    tabBarLabelStyle: { fontSize: wide ? 14 : 10, fontWeight: '500', marginTop: wide ? 0 : 3 },
    tabBarBadgeStyle: { backgroundColor: colors.green, fontSize: 9, color: '#fff' },
  }}>
    {tabs.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} options={{
      title: tab.title, tabBarBadge: tab.name === 'cart' && count > 0 ? count : undefined,
      tabBarIcon: ({ color, focused }) => <View style={{ width: 48, height: 30, borderRadius: 15,
        alignItems: 'center', justifyContent: 'center', backgroundColor: focused && !wide ? '#EDF2E7' : 'transparent' }}>
        <Icon name={tab.icon} color={color} size={21} strokeWidth={focused ? 1.9 : 1.5} />
      </View>,
    }} />)}
  </Tabs>;
}
