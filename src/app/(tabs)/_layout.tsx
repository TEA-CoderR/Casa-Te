import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typeScale } from '@/config/theme';
import { getCartSnapshot, useCartStore } from '@/store/cart';
import { Icon, type IconName } from '@/components/Icon';
const tabs: Array<{ name: string; title: string; icon: IconName }> = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'catalog', title: 'Catalogo', icon: 'grid' },
  { name: 'cart', title: 'Carrello', icon: 'bag' },
  { name: 'orders', title: 'Ordini', icon: 'box' },
  { name: 'profile', title: 'Profilo', icon: 'user' },
];
export default function TabsLayout() {
  const count = getCartSnapshot(useCartStore((s) => s.items)).itemCount;
  const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{
    headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: '#8B9187',
    tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: '#EBEDE7', height: 64 + Math.max(insets.bottom, 8),
      paddingBottom: Math.max(insets.bottom, spacing.xs), paddingTop: spacing.xxs, elevation: 0 },
    tabBarLabelStyle: { fontSize: typeScale.caption, fontWeight: '500', marginTop: spacing.xxs },
    tabBarBadgeStyle: { backgroundColor: colors.green, fontSize: 9, color: '#fff' },
  }}>
    {tabs.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} options={{
      title: tab.title, tabBarBadge: tab.name === 'cart' && count > 0 ? count : undefined,
      tabBarIcon: ({ color, focused }) => <View style={{ width: 48, height: 30, borderRadius: 15,
        alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? '#EDF2E7' : 'transparent' }}>
        <Icon name={tab.icon} color={color} size={21} strokeWidth={focused ? 1.9 : 1.5} />
      </View>,
    }} />)}
  </Tabs>;
}

