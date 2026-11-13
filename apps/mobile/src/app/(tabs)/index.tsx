import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { orderStatusLabel, type CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { CategoryPhoto } from '@/components/CategoryNav';
import { atPlace, StoreSheet, storeShortName } from '@/components/StoreSheet';
import { storeStatus } from '@/components/StoreCard';
import { BandWatermark, ClubPass } from '@/components/ClubPass';
import { Icon, type IconName } from '@/components/Icon';
import { Loading, Notice } from '@/components/UI';
import { BrandLogo } from '@/components/BrandLogo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProductImage } from '@/components/ProductImage';
import { RemoteImage } from '@/components/RemoteImage';
import { colors, fonts } from '@/config/theme';
import { fetchCategories, fetchCategoryCounts, fetchCategoryCovers, fetchFlyers, fetchOffers, fetchOrders, fetchProducts, fetchProfile, imageUrl, type CatalogProduct, type OrderWithItems } from '@/lib/api';
import { useClubSettings, useDelivery, useLayout, useStores } from '@/lib/hooks';
import { useQuery, useRefetchOnFocus } from '@/lib/useQuery';
import { useUser } from '@/store/session';
import { HomeDesktop } from '@/components/site/HomeDesktop';
import { ALL_PRODUCTS, productList } from '@/lib/links';

/** Desktop web gets the catalogue-style home; phones and the native app keep the phone home. */
export default function HomeScreen() {
  const { wide } = useLayout();
  return wide ? <HomeDesktop /> : <HomePhone />;
}

const CLUB_CARD = require('../../../assets/club-card.webp');
const ACTIVE = new Set(['paid', 'picking', 'ready', 'shipped']);
/** Steps of an order, for the progress bar on the order card (pickup and delivery both have four). */
const STEP: Record<string, number> = { paid: 1, picking: 2, ready: 3, shipped: 3 };
function HomePhone() {
  const insets = useSafeAreaInsets();
  // Light status bar over the green band while Home is on screen.
  useFocusEffect(useCallback(() => { setStatusBarStyle('light'); return () => setStatusBarStyle('dark'); }, []));
  const { selected } = useStores();
  const user = useUser();
  const { width } = useWindowDimensions();
  const [storeSheet, setStoreSheet] = useState(false);
  const storeName = storeShortName(selected).replace(/^(\S+)\s+(?!·)/, '$1 · ');
  const club = useClubSettings();
  const profile = useQuery(user ? `profile:${user.id}` : null, () => fetchProfile(user!.id));
  const orders = useQuery<OrderWithItems[]>(user ? `orders:list:${user.id}` : null, fetchOrders);
  useRefetchOnFocus(orders.refetch);
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);
  const counts = useQuery('category-counts', fetchCategoryCounts);
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
  const flyer = flyers.data?.[0];
  const flyerUntil = flyer?.valid_to ? new Date(`${flyer.valid_to}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : null;
  const refresh = () => { void categories.refetch(); void featured.refetch(); void offers.refetch(); void orders.refetch(); };
  // Up to 8 departments chosen in the admin ("Mostra in home"); the first 6 when none is chosen.
  const all = categories.data ?? [];
  const allTop = all.filter((c) => !c.parent_id);
  const chosen = allTop.filter((c) => c.show_on_home);
  const topCategories = (chosen.length ? chosen : allTop).slice(0, chosen.length ? 8 : 6);
  const countFor = (top: CategoryRow) => {
    const ids = new Set([top.id, ...all.filter((c) => c.parent_id === top.id).map((c) => c.id)]);
    return [...ids].reduce((sum, id) => sum + (counts.data?.[id] ?? 0), 0);
  };
  const totalProducts = Object.values(counts.data ?? {}).reduce((a, b) => a + b, 0);
  const coverFor = (top: CategoryRow) => covers.data?.[top.id]?.image
    ? covers.data[top.id] : all.filter((c) => c.parent_id === top.id).map((c) => covers.data?.[c.id]).find((c) => c?.image);
  // Lists (a department, the offers, "In evidenza") open as their own screen, so back returns here; search opens on Categorie.
  const openCatalog = (params: Record<string, string>) => params.search
    ? router.push({ pathname: '/catalog', params: { offerte: '', evidenza: '', category: '', ...params } })
    : router.push(productList(params));
  const firstName = profile.data?.full_name?.trim().split(/\s+/)[0] ?? '';
  const active = (orders.data ?? []).find((o) => ACTIVE.has(o.status));

  // Hero carousel (design F): offers, free pickup, a department — real data only.
  const dept = topCategories.find((c) => coverFor(c)?.image) ?? topCategories[0];
  const deptCount = dept ? countFor(dept) : 0;
  const slides: Array<{ key: string; title: string; text: string; cta: string; bg: string; ink: string; image?: string | null; product?: CatalogProduct; onPress: () => void }> = [
    ...(offerItems.length ? [{ key: 'offers', title: 'Le nostre migliori offerte', text: 'Sempre aggiornate, nel tuo negozio', cta: 'Scopri', bg: '#EAF0E4', /* ui-check: allow (home banner, sage) */ ink: colors.green, product: offerItems[0], onPress: () => openCatalog({ offerte: '1' }) }] : []),
    { key: 'pickup', title: 'Ritiro sempre gratis', text: storeName ? `Ordina ora, ritira a ${storeName}` : 'Ordina ora, ritira nel tuo negozio', cta: 'Come funziona', bg: '#F2F3EE', /* ui-check: allow (home banner, stone) */ ink: colors.green, product: featured.data?.items[0], onPress: () => router.push({ pathname: '/legal/[doc]', params: { doc: 'shipping' } }) },
    ...(dept ? [{ key: 'dept', title: dept.name, text: 'Scopri il reparto nel tuo negozio', cta: `Vai a ${dept.name}`, bg: '#F4F1EC', /* ui-check: allow (home banner, warm stone) */ ink: colors.text, image: coverFor(dept)?.image, onPress: () => openCatalog({ category: dept.id }) }] : []),
  ];
  const slideWidth = width - 32;
  const [slide, setSlide] = useState(0);
  const pager = useRef<ScrollView>(null);
  const touched = useRef(false);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => {
      if (touched.current) return;
      setSlide((i) => { const next = (i + 1) % slides.length; pager.current?.scrollTo({ x: next * slideWidth, animated: true }); return next; });
    }, 5000);
    return () => clearInterval(t);
  }, [slides.length, slideWidth]);

  const quick = (label: string, icon: IconName, onPress: () => void) =>
    <Pressable key={label} onPress={onPress} accessibilityRole="link" accessibilityLabel={label}
      style={({ pressed }) => [styles.quickItem, pressed && { opacity: 0.75 }]}>
      <View style={styles.quickSign}><Icon name={icon} size={24} color="#FFFFFF" strokeWidth={1.9} /></View>
      <Text style={styles.quickText} numberOfLines={1}>{label}</Text>
    </Pressable>;
  const sectionHead = (id: string, title: string, link: string, onPress: () => void, kicker?: string) => <View style={styles.section}>
    <View style={{ flexShrink: 1 }}>{!!kicker && <Text style={styles.kicker}>{kicker}</Text>}<Text style={styles.sectionTitle} accessibilityRole="header" nativeID={id}>{title}</Text></View>
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}><Text style={styles.link}>{link}</Text></Pressable>
  </View>;

  // Home (November 2026): the green zone names the store in large type over the monogram texture, the search below;
  // the order in progress (or the carousel) hangs from its edge, as the member's card does on Profilo.
  const short = storeShortName(selected);
  const [, city = '', place = short] = short.match(/^(\S+)\s+(.+)$/) ?? [];
  const status = storeStatus(selected?.opening_hours);
  const header = <View style={[styles.band, { paddingBottom: 66 }]}>
    <BandWatermark top={-6} />
    <View style={styles.bandRow}>
      <BrandLogo width={96} color={colors.bandLogo} />
      <View style={{ flex: 1 }} />
      <Pressable onPress={() => router.push('/favorites')} accessibilityRole="button" accessibilityLabel="Preferiti" hitSlop={4}
        style={({ pressed }) => [styles.bandButton, pressed && { opacity: 0.7 }]}><Icon name="heart" size={21} color={colors.bandText} strokeWidth={1.9} /></Pressable>
    </View>
    <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button"
      accessibilityLabel={selected ? `Il tuo negozio: ${short}. Cambia negozio` : 'Scegli il tuo negozio'} style={({ pressed }) => [styles.storeHero, pressed && { opacity: 0.85 }]}>
      <View style={styles.storeTop}>
        <Text style={styles.storeKicker} numberOfLines={1}>{selected ? `RITIRO GRATIS${city ? ` · ${city.toUpperCase()}` : ''}` : 'IL TUO NEGOZIO'}</Text>
        <View style={styles.storeChange}><Text style={styles.storeChangeText}>{selected ? 'Cambia' : 'Scegli'}</Text></View>
      </View>
      <Text style={styles.storePlace} numberOfLines={1} adjustsFontSizeToFit>{selected ? place : 'Scegli il negozio'}</Text>
      {!!status && <View style={styles.storeStatus}>
        {status.open !== null && <View style={[styles.storeDot, !status.open && { backgroundColor: colors.bandMuted }]} />}
        <Text style={styles.storeStatusText} numberOfLines={1}>{status.text}</Text>
      </View>}
    </Pressable>
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
    {/* The order in progress: a lime ticket hanging from the band (the logo's colours reversed, like the member's card). */}
    {active && <Pressable onPress={() => router.push(`/order/${active.id}`)} accessibilityRole="link" style={({ pressed }) => [styles.ticket, pressed && { transform: [{ scale: 0.985 }] }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={styles.ticketKicker} numberOfLines={1}>ORDINE {active.order_number}</Text>
        <Icon name="chevron" size={18} color={colors.band} strokeWidth={2.4} />
      </View>
      <Text style={styles.ticketTitle} numberOfLines={1}>{active.status === 'ready' && active.fulfilment === 'store' ? 'Pronto al ritiro' : orderStatusLabel(active.status, active.fulfilment)}</Text>
      <Text style={styles.ticketSub} numberOfLines={1}>{active.status === 'ready' && active.fulfilment === 'store' ? 'Mostra il codice in cassa' : 'Segui l’ordine'}</Text>
      <View style={styles.bars}>{[1, 2, 3, 4].map((i) => <View key={i} style={[styles.bar, i <= (STEP[active.status] ?? 1) && styles.barOn]} />)}</View>
    </Pressable>}

    {slides.length > 0 && <View style={{ marginTop: active ? 20 : -50 }}>
      <View style={[styles.hero, !active && styles.heroHung]}>
        <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScrollBeginDrag={() => { touched.current = true; }}
          onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / slideWidth))}>
          {slides.map((s) => <Pressable key={s.key} onPress={s.onPress} accessibilityRole="link" accessibilityLabel={`${s.title}. ${s.text}. ${s.cta}`}
            style={[styles.slide, { width: slideWidth, backgroundColor: s.bg }]}>
            {(s.product || s.image) && <View style={[styles.slideArt, { backgroundColor: s.bg }]}>
              {s.image ? <RemoteImage uri={s.image} style={{ width: '100%', height: '100%', mixBlendMode: 'multiply' } as object} />
                : <ProductImage uri={s.product!.image} sku={s.product!.sku} inset={0} aspect={168 / 180} blend backdrop={s.bg} />}
            </View>}
            <View style={styles.slideText}>
              <Text style={[styles.slideTitle, { color: s.ink }]}>{s.title}</Text>
              <Text style={[styles.slideBody, { color: s.ink }]}>{s.text}</Text>
              <View style={styles.slideCta}><Text style={styles.slideCtaText}>{s.cta}</Text><Icon name="arrow" size={15} color="#FFFFFF" strokeWidth={2.4} /></View>
            </View>
          </Pressable>)}
        </ScrollView>
      </View>
      {slides.length > 1 && <View style={styles.dots}>{slides.map((s, i) =>
        <Pressable key={s.key} accessibilityRole="button" accessibilityLabel={`Mostra ${s.title}`}
          onPress={() => { touched.current = true; setSlide(i); pager.current?.scrollTo({ x: i * slideWidth, animated: true }); }}
          style={styles.dotHit}><View style={[styles.dot, i === slide && styles.dotOn]} /></Pressable>)}</View>}
    </View>}

    {!!topCategories.length && <View style={{ paddingTop: 22, paddingHorizontal: 16 }}>
      <View style={[styles.section, { paddingHorizontal: 0 }]}>
        <View><Text style={styles.kicker}>NEL TUO NEGOZIO</Text><Text style={styles.sectionTitle} accessibilityRole="header">Reparti</Text></View>
        <Pressable onPress={() => router.push(ALL_PRODUCTS)} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.link}>{allTop.length > topCategories.length ? `Tutti i ${allTop.length} reparti` : 'Tutti i reparti'}</Text></Pressable>
      </View>
      {/* Departments as product photos on white plates, like the Categorie tab: 4 across for 8, 3 across for 6. */}
      <View style={styles.departments}>{topCategories.map((category) => {
        const cover = coverFor(category);
        const n = countFor(category);
        const across = topCategories.length % 4 === 0 ? 4 : 3;
        return <Pressable key={category.id} accessibilityRole="link" accessibilityLabel={`Reparto ${category.name}`}
          style={({ pressed }) => [styles.department, { width: `${100 / across}%` }, pressed && { opacity: 0.75 }]} onPress={() => openCatalog({ category: category.id })}>
          <CategoryPhoto image={cover?.image} slug={category.slug} name={category.name} radius={16} />
          <Text style={styles.departmentName} numberOfLines={1}>{category.name}</Text>
        </Pressable>;
      })}</View>
    </View>}

    {/* Offers: the same cards as "In evidenza", side by side. */}
    {offerItems.length > 0 && <View style={{ paddingTop: 28 }}>
      {sectionHead('h-offerte', 'Offerte', 'Vedi tutte', () => openCatalog({ offerte: '1' }), 'QUESTA SETTIMANA')}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.rail}>
        {offerItems.map((product) => <View key={product.id} style={styles.railItem}><ProductCard product={product} rail /></View>)}
      </ScrollView>
    </View>}

    {/* The flyer while one is published: its cover, the title and the dates. */}
    {!!flyer && !!flyer.pages[0] && <Pressable onPress={() => router.push('/volantino')} accessibilityRole="link"
      accessibilityLabel={`Volantino ${flyer.title}${flyerUntil ? `, fino al ${flyerUntil}` : ''}`} style={({ pressed }) => [styles.plateRow, pressed && { opacity: 0.85 }]}>
      <View style={styles.flyerCover}><RemoteImage uri={flyer.pages[0]} style={{ width: '100%', height: '100%' }} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.plateTitle}>Volantino</Text>
        <Text style={styles.plateText} numberOfLines={2}>{flyer.title}{flyerUntil ? `, fino al ${flyerUntil}` : ''}</Text>
      </View>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>}

    <View style={{ paddingTop: 28 }}>
      {sectionHead('h-evidenza', 'In evidenza', 'Vedi tutti', () => featured.data?.picked ? openCatalog({ evidenza: '1' }) : router.push(ALL_PRODUCTS), 'SCELTI PER TE')}
      {featured.error && !featured.data ? <View style={{ paddingHorizontal: 16 }}><Notice tone="error" message="Impossibile caricare i prodotti. Controlla la connessione e riprova." /></View>
        : !featured.data ? <Loading /> : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.rail}>
          {featured.data.items.map((product) => <View key={product.id} style={styles.railItem}><ProductCard product={product} rail /></View>)}
        </ScrollView>}
    </View>


    {/* The Club as the lime card: members are sent to their card on Profilo, the others to the Club. */}
    {(club.enabled || !!profile.data?.club_member_since) && (profile.data?.club_member_since
      ? <ClubPass kicker="CASA & TE CLUB" title={'La tua tessera\nè nel Profilo.'} action="Apri la tessera"
        onPress={() => router.push('/profile')} style={{ marginHorizontal: 16, marginTop: 30, height: 200 }} />
      : <ClubPass kicker="CASA & TE CLUB" title={'Prezzi Soci su tutto\nil catalogo.'} action="Scopri il Club"
        onPress={() => router.push('/club')} style={{ marginHorizontal: 16, marginTop: 30, height: 200 }} />)}

    <View style={styles.footer}>
      {([['Privacy', 'privacy'], ['Termini di vendita', 'terms'], ['Spedizioni e ritiro', 'shipping']] as const).map(([label, doc]) =>
        <Pressable key={doc} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc } })} accessibilityRole="link" hitSlop={6}>
          <Text style={styles.footerLink}>{label}</Text></Pressable>)}
      <Pressable onPress={() => Linking.openURL('mailto:shoponline@casa-te.com')} accessibilityRole="link" hitSlop={6}><Text style={styles.footerLink}>Contatti</Text></Pressable>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.band, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 54, overflow: 'hidden' },
  storeHero: { marginTop: 18, paddingHorizontal: 4 },
  storeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  storeKicker: { flexShrink: 1, fontSize: 12.5, letterSpacing: 1.8, fontFamily: fonts.sansSemiBold, color: colors.bandMuted },
  storeChange: { height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center' },
  storeChangeText: { fontSize: 13.5, fontFamily: fonts.sansSemiBold, color: colors.bandText },
  storePlace: { fontSize: 42, lineHeight: 48, letterSpacing: -1.4, fontFamily: fonts.display, color: colors.bandText, marginTop: 6 },
  storeStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  storeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.bandLogo },
  storeStatusText: { fontSize: 14.5, fontFamily: fonts.sansMedium, color: colors.bandMuted },
  ticket: { marginHorizontal: 16, marginTop: -50, paddingTop: 16, paddingBottom: 18, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.bandLogo,
    shadowColor: '#143019', shadowOpacity: 0.3, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  ticketKicker: { flexShrink: 1, fontSize: 11.5, letterSpacing: 2, fontFamily: fonts.sansBold, color: colors.band },
  ticketTitle: { fontSize: 24, lineHeight: 29, letterSpacing: -0.6, fontFamily: fonts.display, color: colors.band, marginTop: 6 },
  ticketSub: { fontSize: 14, fontFamily: fonts.sansMedium, color: colors.band, opacity: 0.8, marginTop: 1 },
  heroHung: { shadowColor: '#143019', shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  kicker: { fontSize: 11.5, letterSpacing: 1.8, fontFamily: fonts.sansBold, color: colors.muted, marginBottom: 2 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  bandButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bandButton, alignItems: 'center', justifyContent: 'center' },
  hello: { fontSize: 30, lineHeight: 36, fontFamily: fonts.display, color: '#FFFFFF', letterSpacing: -0.6, marginTop: 18 },
  helloSub: { fontSize: 15.5, fontFamily: fonts.sans, color: colors.onBrand, marginTop: 2 },
  // Outlined like the sign-in fields.
  search: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, paddingLeft: 18, paddingRight: 6, borderRadius: 26, backgroundColor: '#FFFFFF' },
  searchText: { flex: 1, fontSize: 15.5, fontFamily: fonts.sansMedium, color: colors.muted },
  scan: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
  // The order in progress: deep green with the lime signal on the progress bars.
  order: { marginHorizontal: 16, marginTop: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.green },
  orderTitle: { flexShrink: 1, fontSize: 15, fontFamily: fonts.heavy, color: '#FFFFFF' },
  orderSub: { fontSize: 13, fontFamily: fonts.sansSemiBold, color: colors.onBrand, marginTop: 2 },
  bars: { flexDirection: 'row', gap: 4, marginTop: 14 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(31,65,39,0.16)' },
  barOn: { backgroundColor: colors.band },
  quick: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 22 },
  quickItem: { flex: 1, alignItems: 'center', gap: 8 },
  quickSign: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 13, fontFamily: fonts.sansSemiBold, color: colors.text },
  hero: { marginHorizontal: 16, height: 196, borderRadius: 24, overflow: 'hidden' },
  slide: { height: 196 },
  slideArt: { position: 'absolute', right: 6, bottom: 0, width: 168, height: 180 },
  slideText: { position: 'absolute', left: 22, top: 22, width: 186 },
  slideTitle: { fontSize: 25, lineHeight: 28, fontFamily: fonts.display },
  slideBody: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.sansMedium, marginTop: 6, opacity: 0.85 },
  slideCta: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.text, marginTop: 14 },
  slideCtaText: { fontSize: 13.5, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 2, marginTop: 4 },
  dotHit: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D0D0CB' },
  dotOn: { width: 22, backgroundColor: colors.text },
  section: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12, gap: 12 },
  sectionTitle: { fontSize: 25, lineHeight: 30, fontFamily: fonts.display, color: colors.text },
  link: { fontSize: 14, fontFamily: fonts.sansBold, color: colors.green, textDecorationLine: 'underline' },
  rail: { paddingHorizontal: 16, gap: 10, paddingBottom: 1 },
  railItem: { width: 162, flexDirection: 'row' },
  // Flyer and Club: one white plate each, picture on the left.
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginTop: 24, padding: 14, borderRadius: 20,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  plateTitle: { fontSize: 16, lineHeight: 21, fontFamily: fonts.sansBold, color: colors.text },
  plateText: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.sans, color: colors.muted, marginTop: 2 },
  flyerCover: { width: 46, aspectRatio: 0.71, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.well },
  clubCard: { width: 64, height: 40, borderRadius: 4 },
  departments: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, rowGap: 14 },
  department: { paddingHorizontal: 4 },
  departmentName: { marginTop: 6, fontSize: 13, textAlign: 'center', fontFamily: fonts.sansSemiBold, color: colors.text },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, paddingHorizontal: 20, paddingTop: 22 },
  footerLink: { fontSize: 13, color: colors.green, fontFamily: fonts.sansSemiBold, textDecorationLine: 'underline' },
});
