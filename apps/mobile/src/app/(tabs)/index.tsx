import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  const delivery = useDelivery();
  const user = useUser();
  const { width } = useWindowDimensions();
  const [storeSheet, setStoreSheet] = useState(false);
  const storeName = storeShortName(selected);
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
  // Up to 8 departments chosen in the admin ("Mostra in home"); the first 8 when none is chosen.
  const all = categories.data ?? [];
  const allTop = all.filter((c) => !c.parent_id);
  const chosen = allTop.filter((c) => c.show_on_home);
  const topCategories = (chosen.length ? chosen : allTop).slice(0, 8);
  const countFor = (top: CategoryRow) => {
    const ids = new Set([top.id, ...all.filter((c) => c.parent_id === top.id).map((c) => c.id)]);
    return [...ids].reduce((sum, id) => sum + (counts.data?.[id] ?? 0), 0);
  };
  const coverFor = (top: CategoryRow) => covers.data?.[top.id] ?? all.filter((c) => c.parent_id === top.id).map((c) => covers.data?.[c.id]).find((c) => c?.image);
  const openCatalog = (params: Record<string, string>) => router.push({ pathname: '/catalog', params: { offerte: '', evidenza: '', category: '', ...params } });
  const firstName = profile.data?.full_name?.trim().split(/\s+/)[0] ?? '';
  const active = (orders.data ?? []).find((o) => ACTIVE.has(o.status));

  // Hero carousel: real things only — the best offer, free pickup, the featured selection.
  const lead = offerItems[0] ?? featured.data?.items[0];
  const slides: Array<{ key: string; title: string; text: string; cta: string; bg: string; ink: string; product?: CatalogProduct; onPress: () => void }> = [
    ...(offerItems.length ? [{ key: 'offers', title: 'Le nostre migliori offerte', text: 'Sempre aggiornate, nel tuo negozio', cta: 'Vedi le offerte', bg: '#DCE7D3', ink: colors.green, product: offerItems[0], onPress: () => openCatalog({ offerte: '1' }) }] : []),
    { key: 'pickup', title: 'Il ritiro è sempre gratis', text: storeName ? `Ordina ora, ritira ${atPlace(storeName)}` : 'Ordina ora, ritira nel tuo negozio', cta: 'Come funziona', bg: colors.yellow, ink: colors.text, product: featured.data?.items[1] ?? lead, onPress: () => setStoreSheet(true) },
    ...(featured.data?.items.length ? [{ key: 'featured', title: 'Scelti per te', text: 'I prodotti in evidenza questa settimana', cta: 'Scopri', bg: '#F4DED6', ink: '#5B2414', product: featured.data.items[0], onPress: () => featured.data?.picked ? openCatalog({ evidenza: '1' }) : router.push(ALL_PRODUCTS) }] : []),
  ];
  const slideWidth = width - 32;
  const [slide, setSlide] = useState(0);
  const pager = useRef<ScrollView>(null);
  const touched = useRef(false);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => {
      if (touched.current) return;
      setSlide((i) => { const next = (i + 1) % slides.length; pager.current?.scrollTo({ x: next * (slideWidth + 10), animated: true }); return next; });
    }, 5500);
    return () => clearInterval(t);
  }, [slides.length, slideWidth]);

  const pill = (label: string, icon: IconName, onPress: () => void, sale?: boolean) =>
    <Pressable key={label} onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.pill, sale && styles.pillSale, pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={18} color={sale ? '#FFFFFF' : colors.green} strokeWidth={2.1} />
      <Text style={[styles.pillText, sale && { color: '#FFFFFF' }]}>{label}</Text>
    </Pressable>;
  const rail = (items: CatalogProduct[]) => <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railScroll}
    contentContainerStyle={styles.rail}>
    {items.map((product) => <View key={product.id} style={styles.railItem}><ProductCard product={product} /></View>)}
  </ScrollView>;
  const sectionHead = (title: ReactNode, link: string, onPress: () => void) => <View style={styles.section}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>{title}</View>
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}><Text style={styles.link}>{link}</Text></Pressable>
  </View>;

  const header = <BrandHeader logo inScroll overlap={34} right={<HeaderButton icon="heart" label="Preferiti" onPress={() => router.push('/favorites')} />}>
    <View>
      <Text style={styles.hello} accessibilityRole="header">{firstName ? `Ciao, ${firstName}` : 'Benvenuto'}</Text>
      <Text style={styles.helloSub}>Cosa ti serve per casa oggi?</Text>
    </View>
    <HeaderSearch placeholder="Cerca tra i nostri prodotti" onPress={() => openCatalog({ search: '1' })} />
  </BrandHeader>;

  return <Screen header={<StatusBand />} top={header} ground={colors.page} refreshing={featured.loading && !!featured.data} onRefresh={refresh}
    contentContainerStyle={{ padding: 0, paddingBottom: 28 }}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    <HangingCard overlap={22}><StoreCard onPress={() => setStoreSheet(true)} /></HangingCard>

    {active && <Pressable onPress={() => router.push(`/order/${active.id}`)} accessibilityRole="link" style={({ pressed }) => [styles.order, pressed && { opacity: 0.9 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={styles.orderTitle} numberOfLines={1}>{active.status === 'ready' ? 'Il tuo ordine è pronto' : orderStatusLabel(active.status, active.fulfilment)}</Text>
        <Icon name="chevron" size={18} color={colors.text} strokeWidth={2.4} />
      </View>
      <Text style={styles.orderSub}>{active.order_number}{active.status === 'ready' && active.fulfilment === 'store' ? ' · mostra il codice in cassa' : ' · segui l’ordine'}</Text>
      <View style={styles.bars}>{[1, 2, 3, 4].map((i) => <View key={i} style={[styles.bar, i <= (STEP[active.status] ?? 1) && styles.barOn]} />)}</View>
    </Pressable>}

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} style={{ flexGrow: 0 }}>
      {pill('Offerte', 'percent', () => openCatalog({ offerte: '1' }), true)}
      {pill('Volantino', 'flyer', () => router.push('/volantino'))}
      {pill('I miei ordini', 'box', () => router.push('/orders'))}
      {club.enabled ? pill('Club', 'card', () => router.push('/club')) : pill('Preferiti', 'heart', () => router.push('/favorites'))}
    </ScrollView>

    {slides.length > 0 && <View style={{ marginTop: 18 }}>
      <ScrollView ref={pager} horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={slideWidth + 10}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} onScrollBeginDrag={() => { touched.current = true; }}
        onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / (slideWidth + 10)))}>
        {slides.map((s) => <Pressable key={s.key} onPress={s.onPress} accessibilityRole="link" accessibilityLabel={`${s.title}. ${s.text}. ${s.cta}`}
          style={({ pressed }) => [styles.slide, { width: slideWidth, backgroundColor: s.bg }, pressed && { opacity: 0.92 }]}>
          {s.product && <View style={styles.slideArt}><ProductImage uri={s.product.image} sku={s.product.sku} inset={0.04} blend={false} /></View>}
          <View style={styles.slideText}>
            <Text style={[styles.slideTitle, { color: s.ink }]}>{s.title}</Text>
            <Text style={[styles.slideBody, { color: s.ink }]}>{s.text}</Text>
            <View style={styles.slideCta}><Text style={styles.slideCtaText}>{s.cta}</Text><Icon name="arrow" size={15} color="#FFFFFF" strokeWidth={2.4} /></View>
          </View>
        </Pressable>)}
      </ScrollView>
      {slides.length > 1 && <View style={styles.dots}>{slides.map((s, i) =>
        <Pressable key={s.key} accessibilityRole="button" accessibilityLabel={`Mostra ${s.title}`} hitSlop={8}
          onPress={() => { touched.current = true; setSlide(i); pager.current?.scrollTo({ x: i * (slideWidth + 10), animated: true }); }}
          style={styles.dotHit}><View style={[styles.dot, i === slide && styles.dotOn]} /></Pressable>)}</View>}
    </View>}

    {!!topCategories.length && <>
      {sectionHead(<Text style={styles.sectionTitle} accessibilityRole="header">Reparti</Text>, 'Tutti i reparti', () => router.push(ALL_PRODUCTS))}
      <View style={styles.departments}>{topCategories.map((category, i) => {
        const tint = TINTS[i % TINTS.length];
        const cover = coverFor(category);
        const n = countFor(category);
        return <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={`Reparto ${category.name}${n ? `, ${n} prodotti` : ''}`}
          style={({ pressed }) => [styles.department, { backgroundColor: tint.bg }, pressed && { opacity: 0.85 }]} onPress={() => openCatalog({ category: category.id })}>
          <Text style={[styles.departmentName, { color: tint.ink }]} numberOfLines={1}>{category.name}</Text>
          {n > 0 && <Text style={[styles.departmentCount, { color: tint.ink }]}>{n.toLocaleString('it-IT')} prodotti</Text>}
          <View style={styles.departmentArt}>
            {category.image_path
              ? <Image source={{ uri: imageUrl(category.image_path) ?? undefined }} resizeMode="cover" accessibilityIgnoresInvertColors style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
              : cover?.image
                ? <Image source={{ uri: cover.image }} resizeMode="contain" accessibilityIgnoresInvertColors style={[StyleSheet.absoluteFill, { mixBlendMode: 'multiply' } as object]} />
                : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><CategoryIcon slug={category.slug} name={category.name} size={40} strokeWidth={1.3} /></View>}
          </View>
        </Pressable>;
      })}</View>
    </>}

    {offerItems.length > 0 && <>
      {sectionHead(<><View style={styles.percent}><Text style={styles.percentText}>%</Text></View><Text style={styles.sectionTitle} accessibilityRole="header">In offerta</Text></>,
        'Vedi tutte', () => openCatalog({ offerte: '1' }))}
      {rail(offerItems)}
    </>}

    {sectionHead(<Text style={styles.sectionTitle} accessibilityRole="header">In evidenza</Text>, 'Vedi tutti',
      () => featured.data?.picked ? openCatalog({ evidenza: '1' }) : router.push(ALL_PRODUCTS))}
    {featured.error && !featured.data ? <View style={{ paddingHorizontal: 16 }}><Notice tone="error" message="Impossibile caricare i prodotti. Controlla la connessione e riprova." /></View>
      : !featured.data ? <Loading /> : rail(featured.data.items)}

    <View style={styles.pickup}>
      <Text style={styles.pickupTitle} accessibilityRole="header">Il ritiro in negozio è gratis</Text>
      {([
        ['cart', 'Ordina e paga in app', storeName ? `Prezzi e disponibilità ${atPlace(storeName)}` : 'Prezzi e disponibilità del tuo negozio'],
        ['bell', 'Ti scriviamo quando è pronto', 'Ricevi un’email con il codice dell’ordine'],
        ['store', 'Ritira entro 14 giorni', selected?.opening_hours ? `Orari: ${selected.opening_hours}` : 'Negli orari del negozio'],
      ] as const).map(([icon, title, text]) => <View key={title} style={styles.step}>
        <View style={styles.stepIcon}><Icon name={icon} size={18} color={colors.green} strokeWidth={2} /></View>
        <View style={{ flex: 1 }}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepText}>{text}</Text></View>
      </View>)}
      {delivery.open && <Text style={styles.stepNote}>Spedizione a casa gratuita da €66 (fino a 10 kg).</Text>}
    </View>

    <View style={styles.footer}>
      {([['Spedizioni e ritiro', 'shipping'], ['Condizioni di vendita', 'terms'], ['Privacy', 'privacy']] as const).map(([label, doc]) =>
        <Pressable key={doc} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc } })} accessibilityRole="link" hitSlop={6}>
          <Text style={styles.footerLink}>{label}</Text></Pressable>)}
      <Text style={styles.copyright}>© {new Date().getFullYear()} CASA & TE · Pagamenti gestiti da Stripe</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  hello: { fontSize: 32, lineHeight: 38, fontFamily: fonts.display, color: '#FFFFFF', marginTop: 4 },
  helloSub: { fontSize: 15.5, fontFamily: fonts.sansMedium, color: colors.onBrand, marginTop: 2 },
  order: { marginHorizontal: 16, marginTop: 12, padding: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.yellow },
  orderTitle: { flex: 1, fontSize: 15.5, fontFamily: fonts.heavy, color: colors.text },
  orderSub: { fontSize: 13, fontFamily: fonts.sansSemiBold, color: '#4A4512', marginTop: 2 },
  bars: { flexDirection: 'row', gap: 4, marginTop: 10 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(24,32,26,0.18)' },
  barOn: { backgroundColor: colors.text },
  pills: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingLeft: 12, paddingRight: 16, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  pillSale: { backgroundColor: colors.sale, borderColor: colors.sale },
  pillText: { fontSize: 14.5, fontFamily: fonts.sansBold, color: colors.text },
  slide: { height: 188, borderRadius: 24, overflow: 'hidden' },
  slideArt: { position: 'absolute', right: 4, bottom: 0, width: 160, height: 176, mixBlendMode: 'multiply' } as object,
  slideText: { position: 'absolute', left: 20, top: 20, width: 190 },
  slideTitle: { fontSize: 25, lineHeight: 29, fontFamily: fonts.display },
  slideBody: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.sansMedium, marginTop: 6, opacity: 0.88 },
  slideCta: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 38, paddingHorizontal: 15, borderRadius: 19, backgroundColor: colors.text, marginTop: 14 },
  slideCtaText: { fontSize: 13.5, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  dotHit: { width: 28, height: 24, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#CFC9BA' },
  dotOn: { width: 22, backgroundColor: colors.text },
  section: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 24, marginBottom: 12, gap: 12 },
  sectionTitle: { fontSize: 25, lineHeight: 30, fontFamily: fonts.display, color: colors.text },
  percent: { backgroundColor: colors.sale, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 1, alignSelf: 'center' },
  percentText: { fontSize: 15, fontFamily: fonts.heavy, color: '#FFFFFF' },
  link: { fontSize: 14, fontFamily: fonts.sansBold, color: colors.green },
  railScroll: { flexGrow: 0 },
  rail: { paddingHorizontal: 16, gap: 10, paddingBottom: 2 },
  railItem: { width: 162, flexDirection: 'row' },
  departments: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  department: { width: '48.5%', flexGrow: 1, height: 106, borderRadius: 20, overflow: 'hidden', padding: 14 },
  departmentName: { fontSize: 16, fontFamily: fonts.heavy, maxWidth: '70%' },
  departmentCount: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, opacity: 0.85, marginTop: 1 },
  departmentArt: { position: 'absolute', right: -4, bottom: -6, width: 84, height: 84 },
  pickup: { marginHorizontal: 16, marginTop: 28, padding: 20, borderRadius: 24, backgroundColor: '#FFFFFF', gap: 14 },
  pickupTitle: { fontSize: 22, lineHeight: 27, fontFamily: fonts.display, color: colors.text },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 15, fontFamily: fonts.sansBold, color: colors.text },
  stepText: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.sans, color: colors.muted, marginTop: 1 },
  stepNote: { fontSize: 13, fontFamily: fonts.sansMedium, color: colors.muted },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 6, paddingHorizontal: 18, marginTop: 24 },
  footerLink: { fontSize: 13.5, color: colors.green, fontFamily: fonts.sansSemiBold, textDecorationLine: 'underline' },
  copyright: { width: '100%', fontSize: 12, color: colors.faint, fontFamily: fonts.sans, marginTop: 4 },
});
