import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import type { CategoryRow } from '@casa-te/shared';
import { colors, fonts } from '@/config/theme';
import { Icon, type IconName } from '@/components/Icon';
import { atPlace, StoreSheet, storeShortName } from '@/components/StoreSheet';
import { fetchCategories, fetchProducts } from '@/lib/api';
import { ProductImage } from '@/components/ProductImage';
import { discountLabel, formatEuro } from '@/lib/price';
import { useStores } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';
import { cartItemCount, useCartStore } from '@/store/cart';
import { homeDepartments, transition, Wrap, type WebState } from './shared';
import { Overlay } from './Overlay';

/**
 * Desktop masthead, like the cover band of the printed catalogue: search on the left, the
 * wordmark in the middle, account and cart on the right, then a row of department links.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ category?: string; q?: string; offerte?: string }>();
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

  // Department menu: hovering a department opens its subcategories under the nav band.
  const [menuId, setMenuId] = useState<string | null>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepMenu = () => { if (closing.current) { clearTimeout(closing.current); closing.current = null; } };
  const switching = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSwitch = () => { if (switching.current) { clearTimeout(switching.current); switching.current = null; } };
  const openMenu = (id: string | null) => { keepMenu(); cancelSwitch(); setMenuId(id); };
  // Hover intent: with a menu already open, a department only takes over after a short pause, so
  // crossing other links on the way down to the panel does not switch or close it.
  const hoverMenu = (id: string | null) => {
    cancelSwitch();
    if (!menuId) { if (id) openMenu(id); return; }
    switching.current = setTimeout(() => openMenu(id), 160);
  };
  const closeMenu = () => { keepMenu(); closing.current = setTimeout(() => setMenuId(null), 140); };
  useEffect(() => { setMenuId(null); }, [pathname, params.category]);
  const [barHeight, setBarHeight] = useState(133);
  // The menu stays open while the pointer is on the nav band or the panel, and closes when it leaves
  // that strip (tracked on the document: hover events do not reach a panel rendered in a portal).
  useEffect(() => {
    if (!menuId || typeof document === 'undefined') return;
    const onMove = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const inside = !!target?.closest?.('#site-nav, #site-menu');
      if (inside) keepMenu(); else closeMenu();
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuId]);
  const menuDept = departments.find((d) => d.id === menuId) ?? null;
  const menuChildren = menuDept ? all.filter((c) => c.parent_id === menuDept.id) : [];
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
  const navLink = (key: string, label: string, active: boolean, onPress: () => void, menu: string | null = null) => {
    const open = !!menu && menuId === menu;
    return <Pressable key={key} onPress={onPress} accessibilityRole="link" accessibilityState={{ selected: active, expanded: menu ? open : undefined }}
      onHoverIn={() => hoverMenu(menu)} onHoverOut={cancelSwitch} onFocus={() => openMenu(menu)}
      style={({ hovered }: WebState) => [styles.navLink, (hovered || active || open) && styles.navLinkOn, transition('border-color, color')]}>
      {({ hovered }: WebState) =>
        <Text style={[styles.navText, (hovered || active || open) && { color: colors.green }]}>{label}</Text>}
    </Pressable>;
  };

  return <View style={styles.bar} onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    <Wrap style={[styles.mast, { zIndex: 2 }]}>
      <View style={styles.side}>
        <SearchBox query={query} setQuery={setQuery} onSubmit={search} storeId={selected?.id ?? null} categories={all} />
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
    <View nativeID="site-nav" style={[styles.navBand, { zIndex: 1 }]}>
      <Wrap style={styles.nav}>
        <View style={styles.navLinks} accessibilityRole="menubar">
          {navLink('all', 'Tutti i prodotti', onCatalog && !activeId && !params.q && params.offerte !== '1', () => router.push({ pathname: '/catalog', params: { category: '' } }))}
          {departments.map((d) => navLink(d.id, d.name, activeId === d.id,
            () => router.push({ pathname: '/catalog', params: { category: d.id } }), d.id))}
          <Pressable onPress={() => router.push({ pathname: '/catalog', params: { offerte: '1', category: '' } })} accessibilityRole="link"
            onHoverIn={() => hoverMenu(null)} onHoverOut={cancelSwitch}
            style={({ hovered }: WebState) => [styles.navLink, (hovered || params.offerte === '1') && { borderColor: colors.sale }, transition('border-color')]}>
            <Text style={[styles.navText, { color: colors.sale, fontFamily: fonts.sansSemiBold, fontWeight: '600' }]}>Offerte</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button"
          accessibilityLabel={`Negozio per il ritiro: ${storeShortName(selected) || 'nessuno'}. Cambia negozio`} style={styles.store}>
          <Icon name="pin" size={15} color={colors.green} strokeWidth={1.8} />
          <Text style={styles.storeText}>Ritiro gratuito {storeName ? atPlace(storeName).slice(0, -storeName.length) : ''}<Text style={styles.storeName}>{storeName || 'scegli il negozio'}</Text></Text>
          <Icon name="down" size={13} strokeWidth={1.8} />
        </Pressable>
      </Wrap>
    </View>
    {!!menuDept && menuChildren.length > 0 && <Overlay><View nativeID="site-menu" style={[styles.menu, { top: barHeight } as object]}
      accessibilityRole="menu" accessibilityLabel={`Sottocategorie di ${menuDept.name}`}>
      <Wrap style={styles.menuInner}>
        <View style={styles.menuHead}>
          <Text style={styles.menuTitle}>{menuDept.name}</Text>
          <Pressable onPress={() => router.push({ pathname: '/catalog', params: { category: menuDept.id } })} accessibilityRole="link">
            {({ hovered }: WebState) => <View style={styles.menuAll}>
              <Text style={[styles.menuAllText, hovered && { textDecorationLine: 'underline' }]}>Vedi tutto {menuDept.name}</Text>
              <Icon name="arrow" size={15} color={colors.green} strokeWidth={1.6} /></View>}
          </Pressable>
        </View>
        <View style={styles.menuList}>
          {menuChildren.map((c) => <Pressable key={c.id} accessibilityRole="menuitem" style={styles.menuItem}
            onPress={() => router.push({ pathname: '/catalog', params: { category: c.id } })}>
            {({ hovered }: WebState) => <Text style={[styles.menuItemText, hovered && styles.menuItemOn, transition('color')]}>{c.name}</Text>}
          </Pressable>)}
        </View>
      </Wrap>
    </View></Overlay>}
  </View>;
}

/** Masthead search with live suggestions: matching departments and products while typing. */
function SearchBox({ query, setQuery, onSubmit, storeId, categories }: {
  query: string; setQuery: (q: string) => void; onSubmit: () => void; storeId: string | null; categories: CategoryRow[];
}) {
  const [focused, setFocused] = useState(false);
  const [debounced, setDebounced] = useState(query.trim());
  const [active, setActive] = useState(-1);
  const blur = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 180); return () => clearTimeout(t); }, [query]);
  useEffect(() => { setActive(-1); }, [debounced]);
  const enough = debounced.length >= 2;
  const results = useQuery(enough ? `suggest:${storeId}:${debounced.toLowerCase()}` : null,
    () => fetchProducts({ storeId, search: debounced, pageSize: 6 }));
  const needle = debounced.toLowerCase();
  const depts = enough ? categories.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 4) : [];
  const products = enough ? results.data?.items ?? [] : [];
  const open = focused && enough;
  type Item = { key: string; go: () => void };
  const items: Item[] = [
    ...depts.map((c) => ({ key: `c${c.id}`, go: () => router.push({ pathname: '/catalog', params: { category: c.id } }) })),
    ...products.map((p) => ({ key: `p${p.id}`, go: () => router.push(`/product/${p.id}`) })),
  ];
  // Opening a suggestion leaves the box empty; the full results page keeps the words in ?q=.
  const pick = (item: Item) => { setFocused(false); setQuery(''); item.go(); };
  const submit = () => { if (active >= 0 && items[active]) pick(items[active]); else { setFocused(false); onSubmit(); } };
  const onKey = (key: string) => {
    if (key === 'ArrowDown') setActive((i) => Math.min(items.length - 1, i + 1));
    else if (key === 'ArrowUp') setActive((i) => Math.max(-1, i - 1));
    else if (key === 'Escape') setFocused(false);
  };
  // Bold the part of a name that matches what was typed.
  const mark = (text: string) => {
    const i = text.toLowerCase().indexOf(needle);
    if (i < 0 || !needle) return text;
    return <>{text.slice(0, i)}<Text style={styles.mark}>{text.slice(i, i + needle.length)}</Text>{text.slice(i + needle.length)}</>;
  };
  const row = (item: Item, index: number, content: React.ReactNode) =>
    <Pressable key={item.key} onPress={() => pick(item)} onHoverIn={() => setActive(index)} accessibilityRole="link"
      style={[styles.suggestRow, active === index && styles.suggestRowOn]}>{content}</Pressable>;

  return <View style={styles.searchWrap}>
    <View style={[styles.search, focused && { borderColor: colors.green }]}>
      <Icon name="search" size={18} strokeWidth={1.5} color={focused ? colors.green : colors.muted} />
      <TextInput value={query} onChangeText={(t) => { setQuery(t); setFocused(true); }} onSubmitEditing={submit} returnKeyType="search"
        onFocus={() => { if (blur.current) clearTimeout(blur.current); setFocused(true); }}
        onBlur={() => { blur.current = setTimeout(() => setFocused(false), 160); }}
        onKeyPress={(e) => onKey(e.nativeEvent.key)}
        placeholder="Cerca un prodotto" placeholderTextColor={colors.faint} accessibilityLabel="Cerca prodotti"
        aria-expanded={open} aria-autocomplete="list" style={styles.searchInput} autoCorrect={false} />
      {!!query && <Pressable onPress={() => { setQuery(''); setFocused(true); }} accessibilityLabel="Cancella ricerca" hitSlop={8}>
        <Icon name="close" size={15} color={colors.muted} /></Pressable>}
    </View>
    {open && <View style={styles.suggest} accessibilityRole="list">
      {depts.length > 0 && <>
        <Text style={styles.suggestLabel}>Reparti</Text>
        {depts.map((c, i) => row(items[i], i, <>
          <View style={styles.suggestIcon}><Icon name="grid" size={16} color={colors.green} strokeWidth={1.5} /></View>
          <Text style={styles.suggestName} numberOfLines={1}>{mark(c.name)}</Text>
        </>))}
      </>}
      <Text style={styles.suggestLabel}>Prodotti</Text>
      {results.loading && !results.data ? <Text style={styles.suggestEmpty}>Ricerca in corso…</Text>
        : products.length === 0 ? <Text style={styles.suggestEmpty}>Nessun prodotto per «{debounced}»</Text>
        : products.map((p, j) => {
          const i = depts.length + j;
          const discount = discountLabel(p.price_cents, p.compare_at_price_cents);
          return row(items[i], i, <>
            <View style={styles.suggestThumb}><ProductImage uri={p.image} sku={p.sku} label={p.name} inset={0.06} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.suggestName} numberOfLines={1}>{mark(p.name)}</Text>
              {!!p.brand && <Text style={styles.suggestMeta} numberOfLines={1}>{p.brand}</Text>}
            </View>
            <Text style={[styles.suggestPrice, !!discount && { color: colors.sale }]}>{formatEuro(p.price_cents)}</Text>
          </>);
        })}
      <Pressable onPress={() => { setFocused(false); onSubmit(); }} accessibilityRole="link" style={styles.suggestAll}>
        {({ hovered }: WebState) => <>
          <Text style={[styles.suggestAllText, hovered && { textDecorationLine: 'underline' }]}>
            Vedi tutti i risultati{results.data?.total ? ` (${results.data.total})` : ''}</Text>
          <Icon name="arrow" size={15} color={colors.green} strokeWidth={1.6} />
        </>}
      </Pressable>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#FFFFFF', zIndex: 10 },
  mast: { flexDirection: 'row', alignItems: 'center', height: 84 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  searchWrap: { width: 320, zIndex: 30 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 40, borderBottomWidth: 1, borderColor: colors.rule },
  mark: { fontFamily: fonts.sansSemiBold, fontWeight: '600', color: colors.text },
  suggest: { position: 'absolute', top: 48, left: 0, width: 440, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.rule, borderRadius: 4,
    paddingVertical: 8, shadowColor: '#2A2418', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  suggestLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted, fontFamily: fonts.sansSemiBold, fontWeight: '600',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 7 },
  suggestRowOn: { backgroundColor: colors.stone },
  suggestIcon: { width: 32, height: 32, borderRadius: 4, borderWidth: 1, borderColor: colors.photoLine, alignItems: 'center', justifyContent: 'center' },
  suggestThumb: { width: 44, borderRadius: 4, borderWidth: 1, borderColor: colors.photoLine, backgroundColor: colors.photo, overflow: 'hidden' },
  suggestName: { fontSize: 14, color: colors.text, fontFamily: fonts.sans },
  suggestMeta: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans, marginTop: 1 },
  suggestPrice: { fontSize: 15, color: colors.text, fontFamily: fonts.serifMedium },
  suggestEmpty: { fontSize: 13.5, color: colors.muted, fontFamily: fonts.sans, paddingHorizontal: 16, paddingVertical: 8 },
  suggestAll: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
    borderTopWidth: 1, borderColor: colors.rule },
  suggestAllText: { fontSize: 13.5, color: colors.green, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  // Fixed to the window under the masthead: an overlay over the page, never pushing it down.
  menu: { position: 'fixed' as 'absolute', left: 0, right: 0, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: colors.rule,
    shadowColor: '#2A2418', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 16 }, zIndex: 1000 },
  menuInner: { flexDirection: 'row', paddingTop: 32, paddingBottom: 40, gap: 64 },
  menuHead: { width: 260, gap: 14 },
  menuTitle: { fontSize: 34, lineHeight: 38, letterSpacing: -0.5, fontFamily: fonts.serif, color: colors.text },
  menuAll: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuAllText: { fontSize: 13.5, color: colors.green, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  menuList: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, alignContent: 'flex-start' },
  menuItem: { width: '33.3%', paddingVertical: 7, paddingRight: 24 },
  menuItemText: { fontSize: 15, lineHeight: 21, color: colors.text, fontFamily: fonts.sans },
  menuItemOn: { color: colors.green, textDecorationLine: 'underline' },
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
