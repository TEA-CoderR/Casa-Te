import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/config/theme';
import { Icon, type IconName } from '@/components/Icon';
import { useLayout } from '@/lib/hooks';

const tabs: Array<{ name: string; title: string; icon: IconName; hidden?: boolean }> = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'catalog', title: 'Categorie', icon: 'grid' },
  { name: 'favorites', title: 'Preferiti', icon: 'heart' },
  { name: 'profile', title: 'Profilo', icon: 'user' },
  // Cart and orders stay tab routes (deep links, back stack) but are reached from the header cart
  // icon, Profilo and the menu, like the approved design.
  { name: 'cart', title: 'Carrello', icon: 'cart', hidden: true },
  { name: 'orders', title: 'Ordini', icon: 'box', hidden: true },
];

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  return <Tabs screenOptions={{
    headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: colors.faint,
    tabBarActiveBackgroundColor: wide ? colors.cream : undefined,
    // Desktop web shop: navigation as a sidebar instead of a phone-style bottom bar.
    tabBarPosition: wide ? 'left' : 'bottom',
    tabBarVariant: wide ? 'material' : 'uikit',
    tabBarStyle: wide
      ? { backgroundColor: '#FFFFFF', borderRightColor: colors.line, minWidth: 200, paddingTop: 24 }
      : { backgroundColor: '#FFFFFF', borderTopColor: '#EEE9E0', borderTopWidth: 1, height: 60 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8), paddingTop: 6, elevation: 0 },
    tabBarLabelStyle: { fontSize: wide ? 17 : 10.5, fontFamily: wide ? fonts.serif : fonts.sansMedium, marginTop: wide ? 0 : 2 },
    tabBarBadgeStyle: { backgroundColor: colors.badge, fontSize: 11, color: '#fff' },
  }}>
    {tabs.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} options={{
      title: tab.title, href: tab.hidden ? null : undefined,
      tabBarIcon: ({ color, focused }) => <View style={{ width: 48, height: 30, alignItems: 'center', justifyContent: 'center' }}>
        {/* Active tab: solid green icon, like the design. */}
        <Icon name={tab.icon} color={color} size={22} strokeWidth={focused ? 1.4 : 1.25} fill={focused && !wide ? color : undefined} />
      </View>,
    }} />)}
  </Tabs>;
}
