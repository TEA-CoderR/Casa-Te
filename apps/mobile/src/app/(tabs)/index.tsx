import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import type { CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { CategoryPhoto } from '@/components/CategoryNav';
import { atPlace, StoreSheet, storeShortName } from '@/components/StoreSheet';
import { storeStatus } from '@/components/StoreCard';
import { BandWatermark, ClubPass, ClubRow } from '@/components/ClubPass';
import { OrderTicket } from '@/components/OrderTicket';
import { Icon } from '@/components/Icon';
import { Loading, Notice, PillButton, SearchField } from '@/components/UI';
import { BrandLogo } from '@/components/BrandLogo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProductImage } from '@/components/ProductImage';
import { RemoteImage } from '@/components/RemoteImage';
import { colors, fonts, radius, type } from '@/config/theme';
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

const ACTIVE = new Set(['paid', 'picking', 'ready', 'shipped']);
function HomePhone() {
  const insets = useSafeAreaInsets();
  // Light status bar over the green band while Home is on screen.
  useFocusEffect(useCallback(() => { setStatusBarStyle('light'); return () => setStatusBarStyle('dark'); }, []));
  const { selected, canChoose, allStores } = useStores();
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

  // Carousel: the offers and a department — real data only (free pickup is already said in the band).
  const dept = topCategories.find((c) => coverFor(c)?.image) ?? topCategories[0];
  const deptCount = dept ? countFor(dept) : 0;
  const slides: Array<{ key: string; title: string; text: string; cta: string; bg: string; ink: string; image?: string | null; product?: CatalogProduct; onPress: () => void }> = [
    ...(offerItems.length ? [{ key: 'offers', title: 'Le nostre migliori offerte', text: 'Sempre aggiornate, nel tuo negozio', cta: 'Scopri', bg: '#EAF0E4', /* ui-check: allow (home banner, sage) */ ink: colors.green, product: offerItems[0], onPress: () => openCatalog({ offerte: '1' }) }] : []),
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

  const sectionHead = (id: string, title: string, link: string, onPress: () => void) => <View style={styles.section}>
    <Text style={[styles.sectionTitle, { flexShrink: 1 }]} accessibilityRole="header" nativeID={id}>{title}</Text>
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}><Text style={styles.link}>{link}</Text></Pressable>
  </View>;

  // Home (November 2026): the green zone names the store in large type over the monogram texture, the search below;
  // the order in progress (or the carousel) hangs from its edge, as the member's card does on Profilo.
  const short = storeShortName(selected);
  const [, city = '', place = short] = short.match(/^(\S+)\s+(.+)$/) ?? [];
  const status = storeStatus(selected?.opening_hours);
  const header = <View style={[styles.band, { paddingBottom: active ? 66 : 20 }]}>
    <BandWatermark top={-6} />
    <View style={styles.bandRow}>
      <BrandLogo width={96} color={colors.bandLogo} />
      <View style={{ flex: 1 }} />
      <Pressable onPress={() => router.push('/favorites')} accessibilityRole="button" accessibilityLabel="Preferiti" hitSlop={4}
        style={({ pressed }) => [styles.bandButton, pressed && { opacity: 0.7 }]}><Icon name="heart" size={21} color={colors.bandText} strokeWidth={1.9} /></Pressable>
    </View>
    <Pressable onPress={() => setStoreSheet(true)} disabled={!!selected && !canChoose} accessibilityRole={selected && !canChoose ? 'text' : 'button'}
      accessibilityLabel={selected ? `Il tuo negozio: ${short}${canChoose ? '. Cambia negozio' : ''}` : 'Scegli il tuo negozio'} style={({ pressed }) => [styles.storeHero, pressed && { opacity: 0.85 }]}>
      <View style={styles.storeTop}>
        <Text style={styles.storeKicker} numberOfLines={1}>{selected ? `RITIRO GRATIS${city ? ` · ${city.toUpperCase()}` : ''}` : 'IL TUO NEGOZIO'}</Text>
        {(canChoose || !selected) && <PillButton onDark title={selected ? 'Cambia' : 'Scegli'} />}
      </View>
      <Text style={styles.storePlace} numberOfLines={1} adjustsFontSizeToFit>{selected ? place : 'Scegli il negozio'}</Text>
      {!!status && <View style={styles.storeStatus}>
        {status.open !== null && <View style={[styles.storeDot, !status.open && { backgroundColor: colors.bandMuted }]} />}
        <Text style={styles.storeStatusText} numberOfLines={1}>{status.text}</Text>
      </View>}
    </Pressable>
    <SearchField onPress={() => openCatalog({ search: '1' })} style={{ marginTop: 20 }}
      right={<Pressable onPress={() => openCatalog({ search: '1', code: '1' })} accessibilityRole="button" accessibilityLabel="Cerca per codice a barre" hitSlop={4} style={styles.scan}>
        <Icon name="scan" size={19} color={colors.text} strokeWidth={2} />
      </Pressable>} />
  </View>;

  return <Screen header={<View style={{ height: insets.top, backgroundColor: colors.band }} />} top={header} ground={colors.page} refreshing={featured.loading && !!featured.data} onRefresh={refresh}
    contentContainerStyle={{ padding: 0, paddingBottom: 24 }}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    {/* The order in progress: the lime ticket hanging from the band (as on the order list and the order page). */}
    {active && <OrderTicket order={active} storeName={allStores.find((x) => x.id === active.store_id)?.name.replace(/^CASA & TE\s*/, '')} onPress={() => router.push(`/order/${active.id}`)} style={{ marginHorizontal: 16, marginTop: -50 }} />}

    {!!topCategories.length && <View style={{ paddingTop: active ? 28 : 24, paddingHorizontal: 16 }}>
      <View style={[styles.section, { paddingHorizontal: 0 }]}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Reparti</Text>
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

    {slides.length > 0 && <View style={{ marginTop: 32 }}>
      <View style={styles.hero}>
        <ScrollView ref={pager} horizontal pagingEnabled scrollEnabled={slides.length > 1} showsHorizontalScrollIndicator={false} onScrollBeginDrag={() => { touched.current = true; }}
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
              <View style={styles.slideCta}><Text style={styles.slideCtaText}>{s.cta}</Text></View>
            </View>
          </Pressable>)}
        </ScrollView>
      </View>
      {slides.length > 1 && <View style={styles.dots}>{slides.map((s, i) =>
        <Pressable key={s.key} accessibilityRole="button" accessibilityLabel={`Mostra ${s.title}`}
          onPress={() => { touched.current = true; setSlide(i); pager.current?.scrollTo({ x: i * slideWidth, animated: true }); }}
          style={styles.dotHit}><View style={[styles.dot, i === slide && styles.dotOn]} /></Pressable>)}</View>}
    </View>}


    {/* Offers: the same cards as "In evidenza", side by side; one or two alone look broken, the banner still links them. */}
    {offerItems.length >= 3 && <View style={{ paddingTop: 32 }}>
      {sectionHead('h-offerte', 'Offerte', 'Vedi tutti', () => openCatalog({ offerte: '1' }))}
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

    <View style={{ paddingTop: 32 }}>
      {sectionHead('h-evidenza', 'In evidenza', 'Vedi tutti', () => featured.data?.picked ? openCatalog({ evidenza: '1' }) : router.push(ALL_PRODUCTS))}
      {featured.error && !featured.data ? <View style={{ paddingHorizontal: 16 }}><Notice tone="error" message="Impossibile caricare i prodotti. Controlla la connessione e riprova." /></View>
        : !featured.data ? <Loading /> : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.rail}>
          {featured.data.items.map((product) => <View key={product.id} style={styles.railItem}><ProductCard product={product} rail /></View>)}
        </ScrollView>}
    </View>


    {/* The Club: members get their card in one row (the barcode opens on tap), the others the lime card. */}
    {(club.enabled || !!profile.data?.club_member_since) && (profile.data?.club_member_since
      ? (profile.data.member_card_number
        ? <ClubRow card={profile.data.member_card_number} title="Tessera Soci" text="Mostrala in cassa" style={{ marginHorizontal: 16, marginTop: 32 }} />
        : <ClubRow title="Tessera Soci" text="Collega la tessera del negozio" onPress={() => router.push('/club')} style={{ marginHorizontal: 16, marginTop: 32 }} />)
      : <ClubPass kicker="CASA & TE CLUB" title={'Prezzi Soci su tutto\nil catalogo.'} action="Scopri il Club"
        onPress={() => router.push('/club')} style={{ marginHorizontal: 16, marginTop: 32, height: 200 }} />)}

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
  storeKicker: { flexShrink: 1, ...type.kicker, color: colors.bandMuted },
  storePlace: { ...type.display, color: colors.bandText, marginTop: 4 },
  storeStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  storeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.bandLogo },
  storeStatusText: { ...type.small, fontFamily: fonts.sansMedium, color: colors.bandMuted },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  bandButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bandButton, alignItems: 'center', justifyContent: 'center' },
  scan: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
  hero: { marginHorizontal: 16, height: 196, borderRadius: radius.lg, overflow: 'hidden' },
  slide: { height: 196 },
  slideArt: { position: 'absolute', right: 6, bottom: 0, width: 168, height: 180 },
  slideText: { position: 'absolute', left: 22, top: 22, width: 186 },
  slideTitle: { ...type.section },
  slideBody: { ...type.small, fontFamily: fonts.sansMedium, marginTop: 6, opacity: 0.85 },
  slideCta: { alignSelf: 'flex-start', height: 44, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: colors.green, justifyContent: 'center', marginTop: 14 },
  slideCtaText: { fontSize: 15, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 2, marginTop: 4 },
  dotHit: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D0D0CB' },
  dotOn: { width: 22, backgroundColor: colors.text },
  section: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12, gap: 12 },
  sectionTitle: { ...type.section, color: colors.text },
  link: { fontSize: 14, fontFamily: fonts.sansBold, color: colors.green, textDecorationLine: 'underline' },
  rail: { paddingHorizontal: 16, gap: 10, paddingBottom: 1 },
  railItem: { width: 162, flexDirection: 'row' },
  // Flyer: one white plate, the cover on the left.
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginTop: 32, padding: 16, borderRadius: radius.md,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  plateTitle: { ...type.cardTitle, color: colors.text },
  plateText: { ...type.small, color: colors.muted, marginTop: 2 },
  flyerCover: { width: 46, aspectRatio: 0.71, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.well },
  departments: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, rowGap: 14 },
  department: { paddingHorizontal: 4 },
  departmentName: { marginTop: 6, ...type.small, textAlign: 'center', fontFamily: fonts.sansSemiBold, color: colors.text },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, paddingHorizontal: 20, paddingTop: 22 },
  footerLink: { fontSize: 13, color: colors.green, fontFamily: fonts.sansSemiBold, textDecorationLine: 'underline' },
});
