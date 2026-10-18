import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { orderStatusLabel, type CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { CategoryIcon } from '@/components/CategoryIcon';
import { atPlace, StoreSheet, storeShortName } from '@/components/StoreSheet';
import { StoreCard } from '@/components/StoreCard';
import { Icon, type IconName } from '@/components/Icon';
import { Loading, Notice } from '@/components/UI';
import { BrandHeader, HangingCard, HeaderButton, HeaderSearch, StatusBand } from '@/components/BrandHeader';
import { ProductImage } from '@/components/ProductImage';
import { colors, fonts } from '@/config/theme';
import { fetchCategories, fetchCategoryCounts, fetchCategoryCovers, fetchOffers, fetchOrders, fetchProducts, fetchProfile, imageUrl, type CatalogProduct, type OrderWithItems } from '@/lib/api';
import { useClubSettings, useDelivery, useLayout, useStores } from '@/lib/hooks';
import { useQuery, useRefetchOnFocus } from '@/lib/useQuery';
import { useUser } from '@/store/session';
import { HomeDesktop } from '@/components/site/HomeDesktop';
import { ALL_PRODUCTS } from '@/lib/links';

/** Desktop web gets the catalogue-style home; phones and the native app keep the phone home. */
export default function HomeScreen() {
  const { wide } = useLayout();
  return wide ? <HomeDesktop /> : <HomePhone />;
}

const ACTIVE = new Set(['paid', 'picking', 'ready', 'shipped']);
/** Steps of an order, for the progress bar on the order card (pickup and delivery both have four). */
const STEP: Record<string, number> = { paid: 1, picking: 2, ready: 3, shipped: 3 };
/** Department tile tints (design F), each with a dark ink of the same hue for its text. */
const TINTS = [
  { bg: '#F4DED6', ink: '#5B2414' }, { bg: '#DCE9F2', ink: '#173F5C' }, { bg: '#F5E6C8', ink: '#5A3A08' }, { bg: '#DCE7D3', ink: '#1F4127' },
  { bg: '#ECE6F3', ink: '#3E2A63' }, { bg: '#E2EEEC', ink: '#1C4744' }, { bg: '#F3E3EA', ink: '#5E2340' }, { bg: '#E9E6DC', ink: '#3F3A2A' },
];

function HomePhone() {
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
  const openCatalog = (params: Record<string, string>) => router.push({ pathname: '/catalog', params: { offerte: '', evidenza: '', category: '', ...params } });
  const firstName = profile.data?.full_name?.trim().split(/\s+/)[0] ?? '';
  const active = (orders.data ?? []).find((o) => ACTIVE.has(o.status));

  // Hero carousel (design F): offers, free pickup, a department — real data only.
  const dept = topCategories.find((c) => coverFor(c)?.image) ?? topCategories[0];
  const deptCount = dept ? countFor(dept) : 0;
  const slides: Array<{ key: string; title: string; text: string; cta: string; bg: string; ink: string; image?: string | null; product?: CatalogProduct; onPress: () => void }> = [
    ...(offerItems.length ? [{ key: 'offers', title: 'Le nostre migliori offerte', text: 'Sempre aggiornate, nel tuo negozio', cta: 'Scopri', bg: '#DCE7D3', ink: colors.green, product: offerItems[0], onPress: () => openCatalog({ offerte: '1' }) }] : []),
    { key: 'pickup', title: 'Ritiro sempre gratis', text: storeName ? `Ordina ora, ritira a ${storeName}` : 'Ordina ora, ritira nel tuo negozio', cta: 'Come funziona', bg: colors.yellow, ink: colors.text, product: featured.data?.items[0], onPress: () => router.push({ pathname: '/legal/[doc]', params: { doc: 'shipping' } }) },
    ...(dept ? [{ key: 'dept', title: dept.name, text: deptCount ? `${deptCount.toLocaleString('it-IT')} prodotti nel tuo negozio` : 'Scopri il reparto', cta: `Vai a ${dept.name}`, bg: '#F4DED6', ink: '#5B2414', image: coverFor(dept)?.image, onPress: () => openCatalog({ category: dept.id }) }] : []),
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

  const pill = (label: string, icon: IconName, onPress: () => void, sale?: boolean) =>
    <Pressable key={label} onPress={onPress} accessibilityRole="link"
      style={({ pressed }) => [styles.pill, sale && styles.pillSale, pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={18} color={sale ? '#FFFFFF' : colors.green} strokeWidth={sale ? 2.2 : 2} />
      <Text style={[styles.pillText, sale && { color: '#FFFFFF' }]}>{label}</Text>
    </Pressable>;
  const sectionHead = (id: string, title: string, link: string, onPress: () => void) => <View style={styles.section}>
    <Text style={styles.sectionTitle} accessibilityRole="header" nativeID={id}>{title}</Text>
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}><Text style={styles.link}>{link}</Text></Pressable>
  </View>;

  const header = <BrandHeader logo inScroll pad={[16, 20, 40]} right={<HeaderButton icon="heart" label="Preferiti" onPress={() => router.push('/favorites')} />}>
    <Text style={styles.hello} accessibilityRole="header">{firstName ? `Ciao, ${firstName}` : 'Ciao!'}</Text>
    <Text style={styles.helloSub}>Cosa ti serve per casa oggi?</Text>
    <Pressable onPress={() => openCatalog({ search: '1' })} accessibilityRole="search" accessibilityLabel="Cerca prodotti"
      style={({ pressed }) => [styles.search, pressed && { opacity: 0.95 }]}>
      <Icon name="search" size={21} color={colors.text} strokeWidth={2.1} />
      <Text style={styles.searchText} numberOfLines={1}>{totalProducts ? `Cerca tra ${totalProducts.toLocaleString('it-IT')} prodotti` : 'Cerca tra i nostri prodotti'}</Text>
      <Pressable onPress={() => openCatalog({ search: '1', code: '1' })} accessibilityRole="button" accessibilityLabel="Cerca per codice a barre" hitSlop={4} style={styles.scan}>
        <Icon name="scan" size={19} color={colors.text} strokeWidth={2} />
      </Pressable>
    </Pressable>
  </BrandHeader>;

  return <Screen header={<StatusBand />} top={header} ground={colors.page} refreshing={featured.loading && !!featured.data} onRefresh={refresh}
    contentContainerStyle={{ padding: 0, paddingBottom: 24 }}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    <View style={{ marginTop: -30, marginHorizontal: 16 }}><StoreCard onPress={() => setStoreSheet(true)} /></View>

    {active && <Pressable onPress={() => router.push(`/order/${active.id}`)} accessibilityRole="link" style={({ pressed }) => [styles.order, pressed && { opacity: 0.9 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={styles.orderTitle} numberOfLines={1}>{active.status === 'ready' && active.fulfilment === 'store' ? 'Il tuo ordine è pronto al ritiro' : orderStatusLabel(active.status, active.fulfilment)}</Text>
        <Icon name="chevron" size={20} color={colors.text} strokeWidth={2.2} />
      </View>
      <Text style={styles.orderSub}>{active.order_number}{active.status === 'ready' && active.fulfilment === 'store' ? ' · mostra il codice in cassa' : ' · segui l’ordine'}</Text>
      <View style={styles.bars}>{[1, 2, 3, 4].map((i) => <View key={i} style={[styles.bar, i <= (STEP[active.status] ?? 1) && styles.barOn]} />)}</View>
    </Pressable>}

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} style={{ flexGrow: 0 }}>
      {pill('Offerte', 'percent', () => openCatalog({ offerte: '1' }), true)}
      {pill('Volantino', 'flyer', () => router.push('/volantino'))}
      {pill('Ordini', 'box', () => router.push('/orders'))}
      {club.enabled ? pill('Club', 'card', () => router.push('/club')) : pill('Preferiti', 'heart', () => router.push('/favorites'))}
    </ScrollView>

    {slides.length > 0 && <View style={{ marginTop: 20 }}>
      <View style={styles.hero}>
        <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScrollBeginDrag={() => { touched.current = true; }}
          onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / slideWidth))}>
          {slides.map((s) => <Pressable key={s.key} onPress={s.onPress} accessibilityRole="link" accessibilityLabel={`${s.title}. ${s.text}. ${s.cta}`}
            style={[styles.slide, { width: slideWidth, backgroundColor: s.bg }]}>
            {(s.product || s.image) && <View style={[styles.slideArt, { backgroundColor: s.bg }]}>
              {s.image ? <Image source={{ uri: s.image }} resizeMode="contain" style={{ width: '100%', height: '100%', mixBlendMode: 'multiply' } as object} accessibilityIgnoresInvertColors />
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
      <View style={styles.departments}>{topCategories.map((category, i) => {
        const tint = TINTS[i % TINTS.length];
        const cover = coverFor(category);
        const n = countFor(category);
        return <Pressable key={category.id} accessibilityRole="link" accessibilityLabel={`Reparto ${category.name}${n ? `, ${n} prodotti` : ''}`}
          style={({ pressed }) => [styles.department, { backgroundColor: tint.bg }, pressed && { opacity: 0.85 }]} onPress={() => openCatalog({ category: category.id })}>
          {/* Web: every view is its own stacking context, so the tile colour is painted right behind the photo for `multiply`. */}
          <View style={[styles.departmentArt, { backgroundColor: tint.bg }]}>
            {/* Design F: a real product photo of the department (featured first), blended into the tile colour. */}
            {cover?.image
              ? <Image source={{ uri: cover.image }} resizeMode="contain" accessibilityIgnoresInvertColors style={[StyleSheet.absoluteFill, { mixBlendMode: 'multiply' } as object]} />
              : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><CategoryIcon slug={category.slug} name={category.name} size={44} strokeWidth={1.3} /></View>}
          </View>
          <Text style={[styles.departmentName, { color: tint.ink }]} numberOfLines={1}>{category.name}</Text>
          {n > 0 && <Text style={[styles.departmentCount, { color: tint.ink }]}>{n.toLocaleString('it-IT')} prodotti</Text>}
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

    <View style={styles.pickup}>
      <Text style={styles.pickupTitle} accessibilityRole="header">Il ritiro in negozio è gratis</Text>
      <View style={{ gap: 14, marginTop: 14 }}>
        {([
          ['cart', 'Ordina e paga in app', 'Prezzi e disponibilità del tuo negozio'],
          ['mail', 'Ti scriviamo quando è pronto', 'Ricevi un’email con il codice dell’ordine'],
          ['store', 'Ritira entro 14 giorni', selected?.opening_hours ?? 'Negli orari del negozio'],
        ] as const).map(([icon, title, text]) => <View key={title} style={styles.step}>
          <View style={styles.stepIcon}><Icon name={icon} size={18} color={colors.green} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepText}>{text}</Text></View>
        </View>)}
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
  hello: { fontSize: 34, lineHeight: 38, fontFamily: fonts.display, color: '#FFFFFF', letterSpacing: -0.3, marginTop: 20 },
  helloSub: { fontSize: 15.5, fontFamily: fonts.sans, color: colors.onBrand, marginTop: 4 },
  search: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12, height: 54, paddingLeft: 18, paddingRight: 8, borderRadius: 27, backgroundColor: '#FFFFFF',
    shadowColor: '#0A180C', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  searchText: { flex: 1, fontSize: 15.5, fontFamily: fonts.sansMedium, color: colors.muted },
  scan: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
  order: { marginHorizontal: 16, marginTop: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.yellow },
  orderTitle: { flexShrink: 1, fontSize: 15, fontFamily: fonts.heavy, color: colors.text },
  orderSub: { fontSize: 13, fontFamily: fonts.sansSemiBold, color: '#4A4512', marginTop: 2 },
  bars: { flexDirection: 'row', gap: 4, marginTop: 10 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(24,32,26,0.18)' },
  barOn: { backgroundColor: colors.text },
  pills: { paddingHorizontal: 16, paddingTop: 18, gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingLeft: 12, paddingRight: 16, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  pillSale: { backgroundColor: colors.sale, borderColor: colors.sale },
  pillText: { fontSize: 14.5, fontFamily: fonts.sansBold, color: colors.text },
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
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#CFC9BA' },
  dotOn: { width: 22, backgroundColor: colors.text },
  section: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12, gap: 12 },
  sectionTitle: { fontSize: 25, lineHeight: 30, fontFamily: fonts.display, color: colors.text },
  link: { fontSize: 14, fontFamily: fonts.sansBold, color: colors.green, textDecorationLine: 'underline' },
  rail: { paddingHorizontal: 16, gap: 10, paddingBottom: 1 },
  railItem: { width: 162, flexDirection: 'row' },
  departments: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  department: { width: '48.6%', height: 104, borderRadius: 20, overflow: 'hidden', padding: 14 },
  departmentName: { fontSize: 16, fontFamily: fonts.heavy },
  departmentCount: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, opacity: 0.8, marginTop: 1 },
  departmentArt: { position: 'absolute', right: -6, bottom: -8, width: 92, height: 92 },
  pickup: { marginHorizontal: 16, marginTop: 28, padding: 20, borderRadius: 24, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: colors.line },
  pickupTitle: { fontSize: 22, lineHeight: 27, fontFamily: fonts.display, color: colors.text },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8EFE3', alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 15, fontFamily: fonts.sansBold, color: colors.text },
  stepText: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.sans, color: colors.muted },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, paddingHorizontal: 20, paddingTop: 22 },
  footerLink: { fontSize: 13, color: colors.green, fontFamily: fonts.sansSemiBold, textDecorationLine: 'underline' },
});
