import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import type { CategoryRow } from '@casa-te/shared';
import { colors, fonts } from '@/config/theme';
import { Icon, type IconName } from '@/components/Icon';
import { atPlace, StoreSheet, storeShortName } from '@/components/StoreSheet';
import { fetchCategories } from '@/lib/api';
import { useStores } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';
import { cartItemCount, useCartStore } from '@/store/cart';
import { homeDepartments, transition, Wrap, type WebState } from './shared';

/**
 * Desktop masthead, like the cover band of the printed catalogue: search on the left, the
 * wordmark in the middle, account and cart on the right, then a row of department links.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ category?: string; q?: string }>();
  const { selected } = useStores();
  const count = cartItemCount(useCartStore((s) => s.items));
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);
  const [query, setQuery] = useState(params.q ?? '');
  const [storeSheet, setStoreSheet] = useState(false);
  const storeName = storeShortName(selected);
  useEffect(() => { setQuery(params.q ?? ''); }, [params.q]);

  const all = categories.data ?? [];
  const departments = homeDepartments(all);
  // The active department: the open category or the department it belongs to.
  const openCategory = pathname.startsWith('/catalog') ? all.find((c) => c.id === params.category) : undefined;
  const activeId = openCategory ? openCategory.parent_id ?? openCategory.id : null;
  const onCatalog = pathname.startsWith('/catalog');

  const search = () => {
    const q = query.trim();
    router.push({ pathname: '/catalog', params: q ? { q } : { search: '1' } });
  };
  const tool = (icon: IconName, label: string, href: '/favorites' | '/profile' | '/cart', badge?: number) => {
    const on = pathname === href;
    return <Pressable key={href} onPress={() => router.push(href)} accessibilityRole="link"
      accessibilityLabel={badge ? `${label}, ${badge} articoli` : label}
      style={({ hovered }: WebState) => [styles.tool, (hovered || on) && styles.toolOn]}>
      <Icon name={icon} size={21} strokeWidth={1.35} color={on ? colors.green : colors.text} />
      <Text style={[styles.toolText, on && { color: colors.green }]}>{label}</Text>
      {!!badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>}
    </Pressable>;
  };
  const navLink = (key: string, label: string, active: boolean, onPress: () => void) =>
    <Pressable key={key} onPress={onPress} accessibilityRole="link" accessibilityState={{ selected: active }}
      style={({ hovered }: WebState) => [styles.navLink, (hovered || active) && styles.navLinkOn, transition('border-color, color')]}>
      {({ hovered }: WebState) =>
        <Text style={[styles.navText, (hovered || active) && { color: colors.green }]}>{label}</Text>}
    </Pressable>;

  return <View style={styles.bar}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    <Wrap style={styles.mast}>
      <View style={styles.side}>
        <View style={styles.search}>
          <Icon name="search" size={18} strokeWidth={1.5} color={colors.muted} />
          <TextInput value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search"
            placeholder="Cerca un prodotto" placeholderTextColor={colors.faint} accessibilityLabel="Cerca prodotti"
            style={styles.searchInput} autoCorrect={false} />
        </View>
      </View>
      <Pressable onPress={() => router.push('/')} accessibilityRole="link" accessibilityLabel="Casa & Te, home">
        <Text style={styles.wordmark} accessibilityRole="header">Casa & Te</Text>
      </Pressable>
      <View style={[styles.side, { justifyContent: 'flex-end', gap: 6 }]}>
        {tool('heart', 'Preferiti', '/favorites')}
        {tool('user', 'Account', '/profile')}
        {tool('cart', 'Carrello', '/cart', count)}
      </View>
    </Wrap>
    <View style={styles.navBand}>
      <Wrap style={styles.nav}>
        <View style={styles.navLinks} accessibilityRole="menubar">
          {navLink('all', 'Tutti i prodotti', onCatalog && !activeId && !params.q, () => router.push({ pathname: '/catalog', params: { category: '' } }))}
          {departments.map((d) => navLink(d.id, d.name, activeId === d.id,
            () => router.push({ pathname: '/catalog', params: { category: d.id } })))}
        </View>
        <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button"
          accessibilityLabel={`Negozio per il ritiro: ${storeShortName(selected) || 'nessuno'}. Cambia negozio`} style={styles.store}>
          <Icon name="pin" size={15} color={colors.green} strokeWidth={1.8} />
          <Text style={styles.storeText}>Ritiro gratuito {storeName ? atPlace(storeName).slice(0, -storeName.length) : ''}<Text style={styles.storeName}>{storeName || 'scegli il negozio'}</Text></Text>
          <Icon name="down" size={13} strokeWidth={1.8} />
        </Pressable>
      </Wrap>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#FFFFFF', zIndex: 10 },
  mast: { flexDirection: 'row', alignItems: 'center', height: 84 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 300, height: 40, borderBottomWidth: 1, borderColor: colors.rule },
  searchInput: { flex: 1, minWidth: 0, height: 40, fontSize: 14.5, color: colors.text, fontFamily: fonts.sans, outlineWidth: 0 } as object,
  wordmark: { fontSize: 40, lineHeight: 46, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.4 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 10, borderRadius: 4 },
  toolOn: { backgroundColor: colors.stone },
  toolText: { fontSize: 13.5, color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  navBand: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.rule },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48 },
  navLinks: { flexDirection: 'row', alignItems: 'center', gap: 30, flexShrink: 1, flexWrap: 'wrap', overflow: 'hidden', height: 48 },
  navLink: { height: 48, justifyContent: 'center', borderBottomWidth: 2, borderColor: 'transparent', marginBottom: -1 },
  navLinkOn: { borderColor: colors.green },
  navText: { fontSize: 13.5, letterSpacing: 0.3, color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500' },
  store: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 48, paddingLeft: 24 },
  storeText: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans },
  storeName: { color: colors.text, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
});
