import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { orderStatusLabel, type CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { CategoryPhoto } from '@/components/CategoryNav';
import { StoreSheet, storeShortName } from '@/components/StoreSheet';
import { storeStatus } from '@/components/StoreCard';
import { Icon } from '@/components/Icon';
import { Loading, Notice } from '@/components/UI';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RemoteImage } from '@/components/RemoteImage';
import { colors, fonts } from '@/config/theme';
import { fetchCategories, fetchCategoryCovers, fetchFlyers, fetchOffers, fetchOrders, fetchProducts, type OrderWithItems } from '@/lib/api';
import { useClubSettings, useLayout, useStores } from '@/lib/hooks';
import { useQuery, useRefetchOnFocus } from '@/lib/useQuery';
import { useUser } from '@/store/session';
import { useClubMember } from '@/store/club';
import { HomeDesktop } from '@/components/site/HomeDesktop';
import { ALL_PRODUCTS, productList } from '@/lib/links';

/** Desktop web gets the catalogue-style home; phones and the native app keep the phone home. */
export default function HomeScreen() {
  const { wide } = useLayout();
  return wide ? <HomeDesktop /> : <HomePhone />;
}

const ACTIVE = new Set(['paid', 'picking', 'ready', 'shipped']);
/** Steps of an order, for the progress line on the order card (pickup and delivery both have four). */
const STEP: Record<string, number> = { paid: 1, picking: 2, ready: 3, shipped: 3 };
const CLUB_CARD = require('../../../assets/club-card.webp');

/**
 * Phone home, design "Pulito" (November 2026): the store and the search, then the shop itself: offers, departments,
 * the flyer, picks and the Club. White page, white plates with a hairline, one radius scale, Geist, Phosphor icons,
 * the shop green for actions; no labels above titles, no numbering, no decorative dots or rules.
 */
function HomePhone() {
  const insets = useSafeAreaInsets();
  const { selected } = useStores();
  const user = useUser();
  const [storeSheet, setStoreSheet] = useState(false);
  const storeName = storeShortName(selected).replace(/^(\S+)\s+(?!·)/, '$1 · ');
  const status = storeStatus(selected?.opening_hours);
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
  // The flyer only while one is published (RLS returns only current ones).
  const flyers = useQuery('flyers', fetchFlyers);
  const refresh = () => { void categories.refetch(); void featured.refetch(); void offers.refetch(); void orders.refetch(); };
  // Up to 8 departments chosen in the admin ("Mostra in home"); the first 8 when none is chosen.
  const all = categories.data ?? [];
  const allTop = all.filter((c) => !c.parent_id);
  const chosen = allTop.filter((c) => c.show_on_home);
  const topCategories = (chosen.length ? chosen : allTop).slice(0, 8);
  const coverFor = (top: CategoryRow) => covers.data?.[top.id]?.image
    ? covers.data[top.id] : all.filter((c) => c.parent_id === top.id).map((c) => covers.data?.[c.id]).find((c) => c?.image);
  // Lists (a department, the offers, "In evidenza") open as their own screen, so back returns here; search opens on Categorie.
  const openCatalog = (params: Record<string, string>) => params.search
    ? router.push({ pathname: '/catalog', params: { offerte: '', evidenza: '', category: '', ...params } })
    : router.push(productList(params));
  const active = (orders.data ?? []).find((o) => ACTIVE.has(o.status));
  const flyer = flyers.data?.[0];
  const flyerCover = flyer?.pages[0];
  const until = flyer?.valid_to ? new Date(`${flyer.valid_to}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : null;
  const picks = (featured.data?.items ?? []).slice(0, 6);

  const head = (title: string, link: string | null, onPress: () => void) => <View style={styles.head}>
    <Text style={styles.h2} accessibilityRole="header">{title}</Text>
    {!!link && <Pressable onPress={onPress} accessibilityRole="link" hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      <Text style={styles.link}>{link}</Text></Pressable>}
  </View>;

  const header = <View style={styles.band}>
    <View style={styles.bandRow}>
      <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button" style={({ pressed }) => [styles.store, pressed && { opacity: 0.6 }]}
        accessibilityLabel={storeName ? `Il tuo negozio: ${storeName}. Cambia negozio` : 'Scegli il tuo negozio'}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={styles.storeName} numberOfLines={1}>{storeName || 'Scegli il negozio'}</Text>
          <Icon name="down" size={16} color={colors.text} strokeWidth={2.2} />
        </View>
        <Text style={styles.storeLine} numberOfLines={1}>{status ? `${status.text} · ritiro gratis` : 'Ritiro in negozio gratis'}</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/favorites')} accessibilityRole="button" accessibilityLabel="Preferiti" hitSlop={6}
        style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}><Icon name="heart" size={24} color={colors.text} /></Pressable>
    </View>
    <Pressable onPress={() => openCatalog({ search: '1' })} accessibilityRole="search" accessibilityLabel="Cerca prodotti"
      style={({ pressed }) => [styles.search, pressed && { opacity: 0.85 }]}>
      <Icon name="search" size={20} color={colors.text} />
      <Text style={styles.searchText} numberOfLines={1}>Cerca prodotti e marche</Text>
      <Pressable onPress={() => openCatalog({ search: '1', code: '1' })} accessibilityRole="button" accessibilityLabel="Cerca per codice a barre" hitSlop={8}>
        <Icon name="scan" size={20} color={colors.text} />
      </Pressable>
    </Pressable>
  </View>;

  return <Screen header={<View style={{ height: insets.top, backgroundColor: colors.band }} />} top={header} ground={colors.page} refreshing={featured.loading && !!featured.data} onRefresh={refresh}
    contentContainerStyle={{ padding: 0, paddingBottom: 24 }}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />

    {active && <Pressable onPress={() => router.push(`/order/${active.id}`)} accessibilityRole="link" style={({ pressed }) => [styles.plate, styles.order, pressed && { opacity: 0.85 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={styles.plateTitle} numberOfLines={1}>{active.status === 'ready' && active.fulfilment === 'store' ? 'Il tuo ordine è pronto al ritiro' : orderStatusLabel(active.status, active.fulfilment)}</Text>
        <Icon name="chevron" size={18} color={colors.muted} />
      </View>
      <Text style={styles.plateText}>{active.order_number}{active.status === 'ready' && active.fulfilment === 'store' ? ', mostra il codice in cassa' : ''}</Text>
      <View style={styles.bars}>{[1, 2, 3, 4].map((n) => <View key={n} style={[styles.bar, n <= (STEP[active.status] ?? 0) && styles.barOn]} />)}</View>
    </Pressable>}

    {offerItems.length > 0 && <View style={styles.section}>
      {head('Offerte della settimana', 'Vedi tutte', () => openCatalog({ offerte: '1' }))}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.rail}>
        {offerItems.map((product) => <View key={product.id} style={styles.railItem}><ProductCard product={product} rail /></View>)}
      </ScrollView>
    </View>}

    {!!topCategories.length && <View style={[styles.section, { paddingHorizontal: 16 }]}>
      <View style={[styles.head, { paddingHorizontal: 0 }]}>
        <Text style={styles.h2} accessibilityRole="header">Reparti</Text>
        <Pressable onPress={() => router.push(ALL_PRODUCTS)} accessibilityRole="link" hitSlop={10}><Text style={styles.link}>Tutti</Text></Pressable>
      </View>
      <View style={styles.departments}>{topCategories.map((category) => {
        const cover = coverFor(category);
        return <Pressable key={category.id} accessibilityRole="link" accessibilityLabel={`Reparto ${category.name}`}
          style={({ pressed }) => [styles.department, pressed && { opacity: 0.7 }]} onPress={() => openCatalog({ category: category.id })}>
          <CategoryPhoto image={cover?.image} slug={category.slug} name={category.name} radius={12} />
          <Text style={styles.departmentName} numberOfLines={1}>{category.name}</Text>
        </Pressable>;
      })}</View>
    </View>}

    {!!flyer && !!flyerCover && <Pressable onPress={() => router.push('/volantino')} accessibilityRole="link"
      accessibilityLabel={`Volantino ${flyer.title}${until ? `, fino al ${until}` : ''}`} style={({ pressed }) => [styles.plate, styles.row, { marginTop: 32 }, pressed && { opacity: 0.85 }]}>
      <View style={styles.flyerCover}><RemoteImage uri={flyerCover} style={{ width: '100%', height: '100%' }} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.plateTitle} numberOfLines={1}>Volantino</Text>
        <Text style={styles.plateText} numberOfLines={2}>{flyer.title}{until ? `, fino al ${until}` : ''}</Text>
      </View>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>}

    <View style={styles.section}>
      {head('In evidenza', 'Vedi tutti', () => featured.data?.picked ? openCatalog({ evidenza: '1' }) : router.push(ALL_PRODUCTS))}
      {featured.error && !featured.data ? <View style={{ paddingHorizontal: 16 }}><Notice tone="error" message="Impossibile caricare i prodotti. Controlla la connessione e riprova." /></View>
        : !featured.data ? <Loading /> : <View style={styles.grid}>
          {picks.map((product) => <View key={product.id} style={styles.gridItem}><ProductCard product={product} /></View>)}
        </View>}
    </View>

    {club.enabled && <Pressable onPress={() => router.push('/club')} accessibilityRole="link" accessibilityLabel="Casa & Te Club"
      style={({ pressed }) => [styles.plate, styles.row, { marginTop: 32 }, pressed && { opacity: 0.85 }]}>
      <Image source={CLUB_CARD} style={styles.clubCard} accessibilityIgnoresInvertColors />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.plateTitle}>Casa & Te Club</Text>
        <Text style={styles.plateText} numberOfLines={2}>{member ? 'La tua tessera e i Prezzi Soci' : 'Prezzi Soci e codici sconto, iscrizione gratuita'}</Text>
      </View>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>}

    <View style={styles.footer}>
      {([['Privacy', 'privacy'], ['Termini di vendita', 'terms'], ['Spedizioni e ritiro', 'shipping']] as const).map(([label, doc]) =>
        <Pressable key={doc} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc } })} accessibilityRole="link" hitSlop={6}>
          <Text style={styles.footerLink}>{label}</Text></Pressable>)}
      <Pressable onPress={() => Linking.openURL('mailto:shoponline@casa-te.com')} accessibilityRole="link" hitSlop={6}><Text style={styles.footerLink}>Contatti</Text></Pressable>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.band, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  store: { flex: 1, minWidth: 0, paddingVertical: 4 },
  storeName: { flexShrink: 1, fontSize: 18, lineHeight: 24, fontFamily: fonts.sansSemiBold, color: colors.text, letterSpacing: -0.2 },
  storeLine: { fontSize: 13, lineHeight: 18, fontFamily: fonts.sans, color: colors.muted },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  search: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.well },
  searchText: { flex: 1, fontSize: 15, fontFamily: fonts.sans, color: colors.muted },
  section: { marginTop: 32 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  h2: { fontSize: 22, lineHeight: 28, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.5 },
  link: { fontSize: 14, fontFamily: fonts.sansMedium, color: colors.green },
  plate: { marginHorizontal: 16, padding: 14, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  plateTitle: { flexShrink: 1, fontSize: 16, lineHeight: 21, fontFamily: fonts.sansSemiBold, color: colors.text },
  plateText: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.sans, color: colors.muted, marginTop: 2 },
  order: { marginTop: 16 },
  bars: { flexDirection: 'row', gap: 4, marginTop: 12 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.well },
  barOn: { backgroundColor: colors.green },
  rail: { paddingHorizontal: 16, gap: 10, paddingBottom: 1 },
  railItem: { width: 164, flexDirection: 'row' },
  departments: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, rowGap: 14 },
  department: { width: '25%', paddingHorizontal: 5 },
  departmentName: { marginTop: 6, fontSize: 12.5, textAlign: 'center', fontFamily: fonts.sansMedium, color: colors.text },
  flyerCover: { width: 46, aspectRatio: 0.71, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.well },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  gridItem: { width: '48.5%', flexDirection: 'row' },
  clubCard: { width: 64, height: 40, borderRadius: 4 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, paddingHorizontal: 16, paddingTop: 28 },
  footerLink: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans },
});
