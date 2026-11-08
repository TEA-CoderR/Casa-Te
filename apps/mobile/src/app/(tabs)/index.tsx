import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { orderStatusLabel, type CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { StoreSheet, storeShortName } from '@/components/StoreSheet';
import { storeStatus } from '@/components/StoreCard';
import { BrandLogo } from '@/components/BrandLogo';
import { useClubMember } from '@/store/club';
import { Icon } from '@/components/Icon';
import { Loading, Notice } from '@/components/UI';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RemoteImage } from '@/components/RemoteImage';
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
/** Steps of an order, for the progress line on the order row (pickup and delivery both have four). */
const STEP: Record<string, number> = { paid: 1, picking: 2, ready: 3, shipped: 3 };
const CLUB_CARD = require('../../../assets/club-card.webp');
const MONTHS = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];

/** Small spaced capitals above a title. */
function Eyebrow({ children, color = colors.muted }: { children: string; color?: string }) {
  return <Text style={[styles.eyebrow, { color }]}>{children}</Text>;
}

/** Text link with a thin arrow, underlined by a hairline. */
function More({ label, onPress, color = colors.text }: { label: string; onPress: () => void; color?: string }) {
  return <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={({ pressed }) => [styles.more, { borderColor: color }, pressed && { opacity: 0.6 }]}>
    <Text style={[styles.moreText, { color }]}>{label}</Text><Icon name="arrow" size={14} color={color} strokeWidth={1.6} />
  </Pressable>;
}

/**
 * Phone home, design "Editoriale" (November 2026): the logo small and centred, a typographic cover with the brand line,
 * a strip of large product pictures, the departments as a numbered index, a gallery of picks, the Club and the store.
 * One product ground (`well`) for every picture, hairlines instead of cards, Instrument Serif titles over Inter Tight.
 */
function HomePhone() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
  const until = flyer?.valid_to ? new Date(`${flyer.valid_to}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : null;
  // The strip under the cover: the offers when there are some, otherwise the picks.
  const stripOffers = offerItems.length > 0;
  const strip = (stripOffers ? offerItems : featured.data?.items ?? []).slice(0, 6);
  const gallery = (featured.data?.items ?? []).slice(0, 4);
  const tileW = Math.round((width - 16 * 2) * 0.72);
  const now = new Date();

  const header = <View style={styles.band}>
    <View style={styles.bandRow}>
      <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button" hitSlop={6}
        accessibilityLabel={storeName ? `Il tuo negozio: ${storeName}. Cambia negozio` : 'Scegli il tuo negozio'} style={styles.bandSide}>
        <Icon name="pin" size={21} color={colors.text} strokeWidth={1.5} />
      </Pressable>
      <BrandLogo width={58} color={colors.green} />
      <Pressable onPress={() => router.push('/favorites')} accessibilityRole="button" accessibilityLabel="Preferiti" hitSlop={6}
        style={[styles.bandSide, { alignItems: 'flex-end' }]}><Icon name="heart" size={21} color={colors.text} strokeWidth={1.5} /></Pressable>
    </View>
    <Pressable onPress={() => openCatalog({ search: '1' })} accessibilityRole="search" accessibilityLabel="Cerca prodotti"
      style={({ pressed }) => [styles.search, pressed && { opacity: 0.8 }]}>
      <Icon name="search" size={18} color={colors.text} strokeWidth={1.6} />
      <Text style={styles.searchText} numberOfLines={1}>Cerca prodotti e marche</Text>
      <Pressable onPress={() => openCatalog({ search: '1', code: '1' })} accessibilityRole="button" accessibilityLabel="Cerca per codice a barre" hitSlop={8}>
        <Icon name="scan" size={18} color={colors.text} strokeWidth={1.6} />
      </Pressable>
    </Pressable>
  </View>;

  return <Screen header={<View style={{ height: insets.top, backgroundColor: colors.band }} />} top={header} ground={colors.page} refreshing={featured.loading && !!featured.data} onRefresh={refresh}
    contentContainerStyle={{ padding: 0, paddingBottom: 24 }}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />

    {/* Cover: the brand line set large, like the first page of a catalogue. */}
    <View style={styles.cover}>
      <Eyebrow>{`${MONTHS[now.getMonth()]} ${now.getFullYear()}${storeName ? `  ·  ${storeName.toUpperCase()}` : ''}`}</Eyebrow>
      <Text style={styles.coverTitle} accessibilityRole="header">Per la tua casa{'\n'}<Text style={styles.coverItalic}>e per te.</Text></Text>
    </View>

    {active && <Pressable onPress={() => router.push(`/order/${active.id}`)} accessibilityRole="link" style={({ pressed }) => [styles.order, pressed && { opacity: 0.7 }]}>
      <Eyebrow color={colors.green}>{`ORDINE ${active.order_number}`}</Eyebrow>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <Text style={styles.orderTitle} numberOfLines={1}>{active.status === 'ready' && active.fulfilment === 'store' ? 'Pronto al ritiro: mostra il codice in cassa' : orderStatusLabel(active.status, active.fulfilment)}</Text>
        <Icon name="chevron" size={18} color={colors.text} strokeWidth={1.6} />
      </View>
      <View style={styles.bars}>{[1, 2, 3, 4].map((n) => <View key={n} style={[styles.bar, n <= (STEP[active.status] ?? 0) && styles.barOn]} />)}</View>
    </Pressable>}

    {/* Large pictures, side by side: the offers (or the picks), each on the same studio ground. */}
    {strip.length > 0 && <View style={{ marginTop: 26 }}>
      <View style={styles.headRow}>
        <Text style={styles.h2}>{stripOffers ? 'Offerte' : 'Selezione'}</Text>
        <More label="Vedi tutto" onPress={() => stripOffers ? openCatalog({ offerte: '1' }) : router.push(ALL_PRODUCTS)} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={tileW + 10} decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} style={{ flexGrow: 0 }}>
        {strip.map((p) => <View key={p.id} style={{ width: tileW }}><ProductCard product={p} variant="feature" /></View>)}
      </ScrollView>
    </View>}

    {!!flyer && !!flyerCover && <Pressable onPress={() => router.push('/volantino')} accessibilityRole="link"
      accessibilityLabel={`Volantino ${flyer.title}${until ? `, fino al ${until}` : ''}`} style={({ pressed }) => [styles.flyer, pressed && { opacity: 0.7 }]}>
      <View style={styles.flyerCover}><RemoteImage uri={flyerCover} style={{ width: '100%', height: '100%' }} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow>VOLANTINO</Eyebrow>
        <Text style={styles.flyerTitle} numberOfLines={2}>{flyer.title}</Text>
        {!!until && <Text style={styles.small}>Fino al {until}</Text>}
      </View>
      <Icon name="chevron" size={18} color={colors.text} strokeWidth={1.6} />
    </Pressable>}

    {/* The departments as the index of a catalogue: number, name, a small picture. */}
    {!!topCategories.length && <View style={{ marginTop: 40, paddingHorizontal: 16 }}>
      <Eyebrow>INDICE</Eyebrow>
      <View style={[styles.headRow, { paddingHorizontal: 0, marginTop: 2 }]}>
        <Text style={styles.h2}>Reparti</Text>
        <More label={`Tutti i ${allTop.length}`} onPress={() => router.push(ALL_PRODUCTS)} />
      </View>
      <View style={styles.index}>{topCategories.map((category, i) => {
        const cover = coverFor(category);
        return <Pressable key={category.id} accessibilityRole="link" accessibilityLabel={`Reparto ${category.name}`} onPress={() => openCatalog({ category: category.id })}
          style={({ pressed }) => [styles.indexRow, pressed && { opacity: 0.6 }]}>
          <Text style={styles.indexNo}>{String(i + 1).padStart(2, '0')}</Text>
          <Text style={styles.indexName} numberOfLines={1}>{category.name}</Text>
          <View style={styles.indexThumb}>{cover?.image
            ? <RemoteImage uri={cover.image} style={{ width: '82%', height: '82%', mixBlendMode: 'multiply' } as object} />
            : null}</View>
        </Pressable>;
      })}</View>
    </View>}

    {/* Picks as a gallery: two across, pictures edge to edge. */}
    <View style={{ marginTop: 40 }}>
      <View style={styles.headRow}>
        <Text style={styles.h2}>In evidenza</Text>
        <More label="Vedi tutto" onPress={() => featured.data?.picked ? openCatalog({ evidenza: '1' }) : router.push(ALL_PRODUCTS)} />
      </View>
      {featured.error && !featured.data ? <View style={{ paddingHorizontal: 16 }}><Notice tone="error" message="Impossibile caricare i prodotti. Controlla la connessione e riprova." /></View>
        : !featured.data ? <Loading /> : <View style={styles.gallery}>
          {gallery.map((product) => <View key={product.id} style={styles.galleryItem}><ProductCard product={product} /></View>)}
        </View>}
    </View>

    {club.enabled && <Pressable onPress={() => router.push('/club')} accessibilityRole="link" accessibilityLabel="Casa & Te Club" style={styles.club}>
      <Eyebrow color={colors.signInk}>CASA & TE CLUB</Eyebrow>
      <Text style={styles.clubTitle}>Prezzi Soci,{'\n'}<Text style={styles.coverItalic}>ogni giorno.</Text></Text>
      <Image source={CLUB_CARD} style={styles.clubCard} accessibilityIgnoresInvertColors />
      <Text style={styles.clubText}>{member ? 'Sei socio: i Prezzi Soci sono già nel tuo carrello.' : 'Iscrizione gratuita, attiva subito sul tuo account.'}</Text>
      <View style={styles.clubButton}><Text style={styles.clubButtonText}>{member ? 'LA TUA TESSERA' : 'ISCRIVITI GRATIS'}</Text></View>
    </Pressable>}

    <View style={styles.store}>
      <Eyebrow>IL TUO NEGOZIO</Eyebrow>
      <Text style={styles.storeName}>{storeName || 'Scegli il negozio'}</Text>
      {!!status && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
        {status.open !== null && <View style={[styles.dot, { backgroundColor: status.open ? colors.green : colors.faint }]} />}
        <Text style={styles.small}>{status.text}</Text>
      </View>}
      <Text style={[styles.small, { marginTop: 2 }]}>Ritiro in negozio sempre gratuito</Text>
      <View style={{ flexDirection: 'row', gap: 22, marginTop: 16 }}>
        <More label="Cambia negozio" onPress={() => setStoreSheet(true)} />
        <More label="Come funziona" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'shipping' } })} />
      </View>
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
  band: { backgroundColor: colors.band, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  bandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48 },
  bandSide: { width: 44, height: 44, justifyContent: 'center' },
  search: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12, height: 44, paddingHorizontal: 14, borderRadius: 4, backgroundColor: colors.well },
  searchText: { flex: 1, fontSize: 15, fontFamily: fonts.sans, color: colors.muted },
  eyebrow: { fontSize: 11, letterSpacing: 1.6, fontFamily: fonts.label },
  cover: { paddingHorizontal: 16, paddingTop: 22 },
  coverTitle: { fontSize: 46, lineHeight: 48, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.8, marginTop: 10 },
  coverItalic: { fontFamily: fonts.displayItalic },
  more: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, paddingBottom: 2 },
  moreText: { fontSize: 13.5, fontFamily: fonts.sansMedium },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14, gap: 12 },
  h2: { fontSize: 32, lineHeight: 36, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.4 },
  small: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.sans, color: colors.muted },
  order: { marginHorizontal: 16, marginTop: 24, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  orderTitle: { flexShrink: 1, fontSize: 16, fontFamily: fonts.sansMedium, color: colors.text },
  bars: { flexDirection: 'row', gap: 3, marginTop: 12 },
  bar: { flex: 1, height: 2, backgroundColor: colors.line },
  barOn: { backgroundColor: colors.green },
  flyer: { flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 16, marginTop: 30, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  flyerCover: { width: 58, aspectRatio: 0.71, backgroundColor: colors.well, overflow: 'hidden' },
  flyerTitle: { fontSize: 24, lineHeight: 27, fontFamily: fonts.display, color: colors.text, marginTop: 3 },
  index: { borderTopWidth: 1, borderColor: colors.text },
  indexRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 68, borderBottomWidth: 1, borderColor: colors.line },
  indexNo: { width: 22, fontSize: 12, fontFamily: fonts.label, color: colors.muted, letterSpacing: 0.5 },
  indexName: { flex: 1, fontSize: 26, lineHeight: 30, fontFamily: fonts.display, color: colors.text },
  indexThumb: { width: 50, height: 50, backgroundColor: colors.well, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, columnGap: 10, rowGap: 22 },
  galleryItem: { width: '48.4%' },
  club: { marginTop: 44, backgroundColor: colors.green, paddingHorizontal: 20, paddingTop: 30, paddingBottom: 30, overflow: 'hidden' },
  clubTitle: { fontSize: 42, lineHeight: 44, fontFamily: fonts.display, color: '#FFFFFF', marginTop: 10, letterSpacing: -0.6 },
  clubCard: { position: 'absolute', right: -34, top: 34, width: 168, height: 106, borderRadius: 8, transform: [{ rotate: '-10deg' }] },
  clubText: { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.sans, color: 'rgba(255,255,255,0.82)', marginTop: 14, maxWidth: 260 },
  clubButton: { alignSelf: 'flex-start', marginTop: 20, height: 44, paddingHorizontal: 20, borderWidth: 1, borderColor: '#FFFFFF', justifyContent: 'center' },
  clubButtonText: { fontSize: 12.5, letterSpacing: 1.4, fontFamily: fonts.sansSemiBold, color: '#FFFFFF' },
  store: { marginHorizontal: 16, marginTop: 36, paddingBottom: 26, borderBottomWidth: 1, borderColor: colors.line },
  storeName: { fontSize: 32, lineHeight: 36, fontFamily: fonts.display, color: colors.text, marginTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 6, paddingHorizontal: 16, paddingTop: 20 },
  footerLink: { fontSize: 12.5, color: colors.muted, fontFamily: fonts.sans },
});
