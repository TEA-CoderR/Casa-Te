import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { orderStatusLabel, type CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { CategoryPhoto } from '@/components/CategoryNav';
import { StoreSheet, storeShortName } from '@/components/StoreSheet';
import { storeStatus } from '@/components/StoreCard';
import { HomePosters, type Poster } from '@/components/HomePosters';
import { useClubMember } from '@/store/club';
import { Icon } from '@/components/Icon';
import { Loading, Notice } from '@/components/UI';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/config/theme';
import { fetchCategories, fetchCategoryCovers, fetchFlyers, fetchOffers, fetchOrders, fetchProducts, type OrderWithItems } from '@/lib/api';
import { useClubSettings, useLayout, useStores } from '@/lib/hooks';
import { useQuery, useRefetchOnFocus } from '@/lib/useQuery';
import { useUser } from '@/store/session';
import { HomeDesktop } from '@/components/site/HomeDesktop';
import { ALL_PRODUCTS, productList } from '@/lib/links';

/** Desktop web gets the catalogue-style home; phones and the native app keep the phone home. */
export default function HomeScreen() {
  const { wide } = useLayout();
  return wide ? <HomeDesktop /> : <HomePhone />;
}

const ACTIVE = new Set(['paid', 'picking', 'ready', 'shipped']);
/** Steps of an order, for the progress bar on the order card (pickup and delivery both have four). */
const STEP: Record<string, number> = { paid: 1, picking: 2, ready: 3, shipped: 3 };
function HomePhone() {
  const insets = useSafeAreaInsets();
  const { selected } = useStores();
  const user = useUser();
  const [storeSheet, setStoreSheet] = useState(false);
  const storeName = storeShortName(selected).replace(/^(\S+)\s+(?!·)/, '$1 · ');
  const club = useClubSettings();
  const member = useClubMember();
  const orders = useQuery<OrderWithItems[]>(user ? `orders:list:${user.id}` : null, fetchOrders);
  useRefetchOnFocus(orders.refetch);
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);
  const covers = useQuery('category-covers', () => fetchCategoryCovers());
  const featured = useQuery(selected ? `featured:${selected.id}` : null,
    // Products starred "In evidenza" in the admin; while none is starred, the start of the catalogue.
    async () => {
      const picked = await fetchProducts({ storeId: selected?.id ?? null, featured: true, sort: 'featured', pageSize: 8 });
      return picked.items.length ? { ...picked, picked: true } : { ...await fetchProducts({ storeId: selected?.id ?? null, sort: 'featured', pageSize: 8 }), picked: false };
    });
  const offers = useQuery(selected ? `offers:${selected.id}:8` : null, () => fetchOffers(selected?.id ?? null, 8));
  const offerItems = offers.data ?? [];
  // The Volantino shortcut only while a flyer is published (RLS returns only current ones).
  const flyers = useQuery('flyers', fetchFlyers);
  const refresh = () => { void categories.refetch(); void featured.refetch(); void offers.refetch(); void orders.refetch(); };
  // Up to 8 departments chosen in the admin ("Mostra in home"); the first 6 when none is chosen.
  const all = categories.data ?? [];
  const allTop = all.filter((c) => !c.parent_id);
  const chosen = allTop.filter((c) => c.show_on_home);
  const topCategories = (chosen.length ? chosen : allTop).slice(0, chosen.length ? 8 : 6);
  const coverFor = (top: CategoryRow) => covers.data?.[top.id]?.image
    ? covers.data[top.id] : all.filter((c) => c.parent_id === top.id).map((c) => covers.data?.[c.id]).find((c) => c?.image);
  // Lists (a department, the offers, "In evidenza") open as their own screen, so back returns here; search opens on Categorie.
  const openCatalog = (params: Record<string, string>) => params.search
    ? router.push({ pathname: '/catalog', params: { offerte: '', evidenza: '', category: '', ...params } })
    : router.push(productList(params));
  const active = (orders.data ?? []).find((o) => ACTIVE.has(o.status));

  const flyer = flyers.data?.[0];
  const flyerCover = flyer?.pages[0];
  const status = storeStatus(selected?.opening_hours);
  const until = flyer?.valid_to ? new Date(`${flyer.valid_to}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : null;

  const best = [...offerItems].filter((p) => p.image)
    .sort((x, y) => (1 - y.price_cents / (y.compare_at_price_cents || y.price_cents)) - (1 - x.price_cents / (x.compare_at_price_cents || x.price_cents)))[0];
  const posters: Poster[] = [
    ...(best ? [{ kind: 'offer' as const, product: best, onPress: () => openCatalog({ offerte: '1' }) }] : []),
    ...(flyer && flyerCover ? [{ kind: 'flyer' as const, title: flyer.title, until, cover: flyerCover, onPress: () => router.push('/volantino') }] : []),
    ...(club.enabled ? [{ kind: 'club' as const, member, onPress: () => router.push('/club') }] : []),
    { kind: 'pickup' as const, store: storeName, onPress: () => router.push({ pathname: '/legal/[doc]', params: { doc: 'shipping' } }) },
  ];

  // Section title in heavy Figtree, like the posters; a quiet link on the right.
  const sectionHead = (title: string, link: string | null, onPress: () => void) => <View style={styles.section}>
    <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
    {!!link && <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={styles.linkRow}>
      <Text style={styles.link}>{link}</Text><Icon name="arrow" size={14} color={colors.text} strokeWidth={2.2} /></Pressable>}
  </View>;

  // Home header: no greeting and no logo (the logo opens the app). The store is one line you can tap, then the search.
  const header = <View style={styles.band}>
    <View style={styles.bandRow}>
      <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button" accessibilityLabel={storeName ? `Il tuo negozio: ${storeName}. Cambia negozio` : 'Scegli il tuo negozio'}
        style={({ pressed }) => [styles.storeLine, pressed && { opacity: 0.7 }]}>
        <Text style={styles.storeEyebrow} numberOfLines={1}>IL TUO NEGOZIO</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.storeName} numberOfLines={1}>{storeName || 'Scegli il negozio'}</Text>
          <View style={{ transform: [{ rotate: '90deg' }] }}><Icon name="chevron" size={16} color={colors.text} strokeWidth={2.4} /></View>
        </View>
        {!!status && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {status.open !== null && <View style={[styles.storeDot, { backgroundColor: status.open ? colors.green : colors.muted }]} />}
          <Text style={styles.storeStatus} numberOfLines={1}>{status.text}</Text>
        </View>}
      </Pressable>
      <Pressable onPress={() => router.push('/favorites')} accessibilityRole="button" accessibilityLabel="Preferiti" hitSlop={4}
        style={({ pressed }) => [styles.bandButton, pressed && { opacity: 0.7 }]}><Icon name="heart" size={21} color={colors.text} strokeWidth={1.9} /></Pressable>
    </View>
    <Pressable onPress={() => openCatalog({ search: '1' })} accessibilityRole="search" accessibilityLabel="Cerca prodotti"
      style={({ pressed }) => [styles.search, pressed && { opacity: 0.95 }]}>
      <Icon name="search" size={21} color={colors.text} strokeWidth={2.1} />
      <Text style={styles.searchText} numberOfLines={1}>Cerca prodotti, marche e reparti</Text>
      <Pressable onPress={() => openCatalog({ search: '1', code: '1' })} accessibilityRole="button" accessibilityLabel="Cerca per codice a barre" hitSlop={4} style={styles.scan}>
        <Icon name="scan" size={19} color={colors.text} strokeWidth={2} />
      </Pressable>
    </Pressable>
  </View>;

  return <Screen header={<View style={{ height: insets.top, backgroundColor: colors.band }} />} top={header} ground={colors.page} refreshing={featured.loading && !!featured.data} onRefresh={refresh}
    contentContainerStyle={{ padding: 0, paddingBottom: 24 }}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />

    {active && <Pressable onPress={() => router.push(`/order/${active.id}`)} accessibilityRole="link" style={({ pressed }) => [styles.order, pressed && { opacity: 0.9 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={styles.orderTitle} numberOfLines={1}>{active.status === 'ready' && active.fulfilment === 'store' ? 'Il tuo ordine è pronto al ritiro' : orderStatusLabel(active.status, active.fulfilment)}</Text>
        <Icon name="chevron" size={20} color={colors.muted} strokeWidth={2.2} />
      </View>
      <Text style={styles.orderSub}>{active.order_number}{active.status === 'ready' && active.fulfilment === 'store' ? ' · mostra il codice in cassa' : ' · segui l’ordine'}</Text>
      <View style={styles.bars}>{[1, 2, 3, 4].map((n) => <View key={n} style={[styles.bar, n <= (STEP[active.status] ?? 0) && styles.barOn]} />)}</View>
    </Pressable>}

    <View style={{ marginTop: 16 }}><HomePosters posters={posters} /></View>

    {offerItems.length > 0 && <View style={{ paddingTop: 30 }}>
      {sectionHead('Offerte', 'Tutte', () => openCatalog({ offerte: '1' }))}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.rail}>
        {offerItems.map((product) => <View key={product.id} style={styles.railItem}><ProductCard product={product} rail /></View>)}
      </ScrollView>
    </View>}

    {!!topCategories.length && <View style={{ paddingTop: 30, paddingHorizontal: 16 }}>
      <View style={[styles.section, { paddingHorizontal: 0 }]}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Reparti</Text>
        <Pressable onPress={() => router.push(ALL_PRODUCTS)} accessibilityRole="link" hitSlop={8} style={styles.linkRow}>
          <Text style={styles.link}>Tutti</Text><Icon name="arrow" size={14} color={colors.text} strokeWidth={2.2} /></Pressable>
      </View>
      {/* Departments as products on a quiet ground, no frames: the photos carry the page. */}
      <View style={styles.departments}>{topCategories.map((category) => {
        const cover = coverFor(category);
        const across = topCategories.length % 4 === 0 ? 4 : 3;
        return <Pressable key={category.id} accessibilityRole="link" accessibilityLabel={`Reparto ${category.name}`}
          style={({ pressed }) => [styles.department, { width: `${100 / across}%` }, pressed && { opacity: 0.75 }]} onPress={() => openCatalog({ category: category.id })}>
          <CategoryPhoto image={cover?.image} slug={category.slug} name={category.name} radius={4} bare ground={colors.well} />
          <Text style={styles.departmentName} numberOfLines={1}>{category.name}</Text>
        </Pressable>;
      })}</View>
    </View>}

    <View style={{ paddingTop: 30 }}>
      {sectionHead('In evidenza', 'Tutti', () => featured.data?.picked ? openCatalog({ evidenza: '1' }) : router.push(ALL_PRODUCTS))}
      {featured.error && !featured.data ? <View style={{ paddingHorizontal: 16 }}><Notice tone="error" message="Impossibile caricare i prodotti. Controlla la connessione e riprova." /></View>
        : !featured.data ? <Loading /> : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.rail}>
          {featured.data.items.map((product) => <View key={product.id} style={styles.railItem}><ProductCard product={product} rail /></View>)}
        </ScrollView>}
    </View>

    <View style={styles.footer}>
      {([['Privacy', 'privacy'], ['Termini di vendita', 'terms'], ['Spedizioni e ritiro', 'shipping']] as const).map(([label, doc]) =>
        <Pressable key={doc} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc } })} accessibilityRole="link" hitSlop={6}>
          <Text style={styles.footerLink}>{label}</Text></Pressable>)}
      <Pressable onPress={() => Linking.openURL('mailto:shoponline@casa-te.com')} accessibilityRole="link" hitSlop={6}><Text style={styles.footerLink}>Contatti</Text></Pressable>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.band, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  storeLine: { flex: 1, minWidth: 0, paddingVertical: 4 },
  storeEyebrow: { fontSize: 11, letterSpacing: 1.2, fontFamily: fonts.sansBold, color: colors.muted },
  storeName: { flexShrink: 1, fontSize: 21, lineHeight: 27, fontFamily: fonts.heavy, color: colors.text, letterSpacing: -0.4 },
  storeDot: { width: 7, height: 7, borderRadius: 4 },
  storeStatus: { fontSize: 13, fontFamily: fonts.sansMedium, color: colors.muted },
  bandButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bandButton, alignItems: 'center', justifyContent: 'center' },
  search: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, height: 50, paddingLeft: 16, paddingRight: 6, borderRadius: 14, backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#8C9189' },
  searchText: { flex: 1, fontSize: 15.5, fontFamily: fonts.sansMedium, color: colors.muted },
  scan: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
  order: { marginHorizontal: 16, marginTop: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  orderTitle: { flexShrink: 1, fontSize: 15, fontFamily: fonts.heavy, color: colors.text },
  orderSub: { fontSize: 13, fontFamily: fonts.sansSemiBold, color: colors.muted, marginTop: 2 },
  bars: { flexDirection: 'row', gap: 4, marginTop: 10 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.well },
  barOn: { backgroundColor: colors.green },
  section: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12, gap: 12 },
  sectionTitle: { fontSize: 26, lineHeight: 31, fontFamily: fonts.heavy, color: colors.text, letterSpacing: -0.8 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  link: { fontSize: 14.5, fontFamily: fonts.sansBold, color: colors.text },
  rail: { paddingHorizontal: 16, gap: 10, paddingBottom: 1 },
  railItem: { width: 162, flexDirection: 'row' },
  departments: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, rowGap: 16 },
  department: { paddingHorizontal: 5 },
  departmentName: { marginTop: 7, fontSize: 13, textAlign: 'center', fontFamily: fonts.sansSemiBold, color: colors.text },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, paddingHorizontal: 20, paddingTop: 22 },
  footerLink: { fontSize: 13, color: colors.muted, fontFamily: fonts.sansSemiBold, textDecorationLine: 'underline' },
});
