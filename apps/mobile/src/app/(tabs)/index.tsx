import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { orderStatusLabel, type CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { CategoryPhoto } from '@/components/CategoryNav';
import { atPlace, StoreSheet, storeShortName } from '@/components/StoreSheet';
import { StoreCard } from '@/components/StoreCard';
import { Icon, type IconName } from '@/components/Icon';
import { Loading, Notice } from '@/components/UI';
import { LogoSign } from '@/components/BrandHeader';
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

const ACTIVE = new Set(['paid', 'picking', 'ready', 'shipped']);
/** Steps of an order, for the progress bar on the order card (pickup and delivery both have four). */
const STEP: Record<string, number> = { paid: 1, picking: 2, ready: 3, shipped: 3 };
function HomePhone() {
  const insets = useSafeAreaInsets();
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
      <View style={styles.quickSign}><Icon name={icon} size={24} color={colors.green} strokeWidth={1.8} /></View>
      <Text style={styles.quickText} numberOfLines={1}>{label}</Text>
    </Pressable>;
  const sectionHead = (id: string, title: string, link: string, onPress: () => void) => <View style={styles.section}>
    <Text style={styles.sectionTitle} accessibilityRole="header" nativeID={id}>{title}</Text>
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}><Text style={styles.link}>{link}</Text></Pressable>
  </View>;

  // Home: the one brand moment of the app — a solid deep-green band with the logo in lime, the greeting and the
  // search, rounded at the bottom, with the store card hanging over its edge (like the big Italian grocery apps).
  const header = <View style={styles.band}>
    <View style={styles.bandRow}>
      <LogoSign height={34} />
      <View style={{ flex: 1 }} />
      <Pressable onPress={() => router.push('/favorites')} accessibilityRole="button" accessibilityLabel="Preferiti" hitSlop={4}
        style={({ pressed }) => [styles.bandButton, pressed && { opacity: 0.7 }]}><Icon name="heart" size={21} color={colors.text} strokeWidth={1.9} /></Pressable>
    </View>
    <Text style={styles.hello} accessibilityRole="header">{firstName ? `Ciao, ${firstName}` : 'Ciao!'}</Text>
    <Text style={styles.helloSub}>Cosa ti serve per casa oggi?</Text>
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
    <View style={{ marginTop: 14, marginHorizontal: 16 }}><StoreCard onPress={() => setStoreSheet(true)} /></View>

    {active && <Pressable onPress={() => router.push(`/order/${active.id}`)} accessibilityRole="link" style={({ pressed }) => [styles.order, pressed && { opacity: 0.9 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={styles.orderTitle} numberOfLines={1}>{active.status === 'ready' && active.fulfilment === 'store' ? 'Il tuo ordine è pronto al ritiro' : orderStatusLabel(active.status, active.fulfilment)}</Text>
        <Icon name="chevron" size={20} color={colors.muted} strokeWidth={2.2} />
      </View>
      <Text style={styles.orderSub}>{active.order_number}{active.status === 'ready' && active.fulfilment === 'store' ? ' · mostra il codice in cassa' : ' · segui l’ordine'}</Text>
      <View style={styles.bars}>{[1, 2, 3, 4].map((i) => <View key={i} style={[styles.bar, i <= (STEP[active.status] ?? 1) && styles.barOn]} />)}</View>
    </Pressable>}

    {/* Quick actions: four round signs in one row, all visible at once (no sideways scroll). */}
    <View style={styles.quick}>
      {quick('Offerte', 'percent', () => openCatalog({ offerte: '1' }))}
      {flyers.data?.length ? quick('Volantino', 'flyer', () => router.push('/volantino')) : quick('Preferiti', 'heart', () => router.push('/favorites'))}
      {quick('Ordini', 'box', () => router.push('/orders'))}
      {club.enabled ? quick('Club', 'crown', () => router.push('/club')) : quick('Profilo', 'user', () => router.push('/profile'))}
    </View>

    {slides.length > 0 && <View style={{ marginTop: 20 }}>
      <View style={styles.hero}>
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

    {!!topCategories.length && <View style={{ paddingTop: 16, paddingHorizontal: 16 }}>
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

    <View style={{ paddingTop: 28 }}>
      {sectionHead('h-evidenza', 'In evidenza', 'Vedi tutti', () => featured.data?.picked ? openCatalog({ evidenza: '1' }) : router.push(ALL_PRODUCTS))}
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
  // Home: white like every page; the brand shows in the logo sign, the greens and the lime, in small doses.
  band: { backgroundColor: colors.band, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  bandButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bandButton, alignItems: 'center', justifyContent: 'center' },
  hello: { fontSize: 30, lineHeight: 36, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.6, marginTop: 18 },
  helloSub: { fontSize: 15.5, fontFamily: fonts.sans, color: colors.muted, marginTop: 2 },
  // Outlined like the sign-in fields.
  search: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, paddingLeft: 16, paddingRight: 6, borderRadius: 14, backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#8C9189' },
  searchText: { flex: 1, fontSize: 15.5, fontFamily: fonts.sansMedium, color: colors.muted },
  scan: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
  // The order in progress: deep green with the lime signal on the progress bars.
  order: { marginHorizontal: 16, marginTop: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  orderTitle: { flexShrink: 1, fontSize: 15, fontFamily: fonts.heavy, color: colors.text },
  orderSub: { fontSize: 13, fontFamily: fonts.sansSemiBold, color: colors.muted, marginTop: 2 },
  bars: { flexDirection: 'row', gap: 4, marginTop: 10 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.well },
  barOn: { backgroundColor: colors.green },
  quick: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 22 },
  quickItem: { flex: 1, alignItems: 'center', gap: 8 },
  quickSign: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
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
  departments: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, rowGap: 14 },
  department: { paddingHorizontal: 4 },
  departmentName: { marginTop: 6, fontSize: 13, textAlign: 'center', fontFamily: fonts.sansSemiBold, color: colors.text },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, paddingHorizontal: 20, paddingTop: 22 },
  footerLink: { fontSize: 13, color: colors.green, fontFamily: fonts.sansSemiBold, textDecorationLine: 'underline' },
});
