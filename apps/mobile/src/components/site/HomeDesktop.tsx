import { useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { CategoryRow } from '@casa-te/shared';
import { colors, fonts } from '@/config/theme';
import { Icon, type IconName } from '@/components/Icon';
import { ProductCard } from '@/components/ProductCard';
import { ProductImage } from '@/components/ProductImage';
import { CategoryIcon } from '@/components/CategoryIcon';
import { atPlace, StoreSheet, storeShortName } from '@/components/StoreSheet';
import { Loading, Notice } from '@/components/UI';
import { demoHomeImage } from '@/data/productImages';
import { fetchCategories, fetchCategoryCounts, fetchCategoryCovers, fetchProducts, imageUrl, type CatalogProduct } from '@/lib/api';
import { useLayout, useStores } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';
import { SiteFooter } from './SiteFooter';
import { homeDepartments, transition, Wrap, type WebState } from './shared';

const PHOTO_RATIO = 1086 / 1448;
/** Department tiles are hidden for now (owner is trying the home without them); flip to bring them back. */
const SHOW_DEPARTMENTS = false;
const articles = (n: number) => `${n} ${n === 1 ? 'articolo' : 'articoli'}`;

/** Desktop home as a printed catalogue: cover, department tiles, then product spreads. */
export function HomeDesktop() {
  const { width } = useLayout();
  const { height } = useWindowDimensions();
  const { selected } = useStores();
  const [storeSheet, setStoreSheet] = useState(false);
  const store = storeShortName(selected);
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);
  const counts = useQuery('category-counts', fetchCategoryCounts);
  const featured = useQuery(selected ? `featured-desk:${selected.id}` : null, async () => {
    // Products starred "In evidenza" in the admin; while none is starred, the start of the catalogue.
    const picked = await fetchProducts({ storeId: selected?.id ?? null, featured: true, sort: 'featured', pageSize: 5 });
    return picked.items.length >= 3 ? picked : fetchProducts({ storeId: selected?.id ?? null, sort: 'featured', pageSize: 5 });
  });
  const value = useQuery(selected ? `value-desk:${selected.id}` : null,
    () => fetchProducts({ storeId: selected?.id ?? null, sort: 'price_asc', pageSize: 12 }));

  const all = categories.data ?? [];
  const departments = homeDepartments(all);
  const total = (d: CategoryRow) => (counts.data?.[d.id] ?? 0)
    + all.filter((c) => c.parent_id === d.id).reduce((s, c) => s + (counts.data?.[c.id] ?? 0), 0);
  const featuredItems = featured.data?.items ?? [];
  // Department photos avoid the products already shown in "In evidenza".
  const featuredSkus = featuredItems.map((p) => p.sku);
  const covers = useQuery(featured.data ? `category-covers:${featuredSkus.join(',')}` : null, () => fetchCategoryCovers(featuredSkus));
  const featuredIds = new Set(featuredItems.map((p) => p.id));
  const perRow = width >= 1280 ? 5 : 4;
  const valueItems = (value.data?.items ?? []).filter((p) => !featuredIds.has(p.id)).slice(0, perRow);

  // Cover: the owner's photograph edge to edge, cropped to keep the skyline and the table.
  // The cover fills the window under the masthead, so the fold falls cleanly before the departments.
  const coverHeight = Math.round(Math.max(460, Math.min(720, height - 133)));
  const photoHeight = width * PHOTO_RATIO;
  const coverImage = photoHeight > coverHeight
    ? { width, height: photoHeight, top: -(photoHeight - coverHeight) * 0.3 }
    : undefined;

  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 0 }}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />

    <ImageBackground source={demoHomeImage} resizeMode="cover" imageStyle={coverImage} style={[styles.cover, { height: coverHeight }]}
      accessibilityIgnoresInvertColors>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
        <Defs>
          <LinearGradient id="coverShade" x1="0" y1="0" x2="0.9" y2="0.35">
            <Stop offset="0" stopColor="#1A140C" stopOpacity="0.62" />
            <Stop offset="0.55" stopColor="#1A140C" stopOpacity="0.22" />
            <Stop offset="1" stopColor="#1A140C" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="coverFoot" x1="0" y1="0.45" x2="0" y2="1">
            <Stop offset="0" stopColor="#1A140C" stopOpacity="0" />
            <Stop offset="1" stopColor="#1A140C" stopOpacity="0.45" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#coverShade)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#coverFoot)" />
      </Svg>
      <Wrap style={styles.coverInner}>
        <Text style={styles.coverTitle} accessibilityRole="header">La bellezza{'\n'}vive con te.</Text>
        <Text style={styles.coverText}>Casa, stile e ispirazione per ogni momento della tua vita.</Text>
        <View style={styles.coverActions}>
          <Pressable onPress={() => router.push('/catalog')} accessibilityRole="link"
            style={({ hovered }: WebState) => [styles.coverButton, hovered && { backgroundColor: colors.stone }, transition('background-color')]}>
            <Text style={styles.coverButtonText}>Sfoglia il catalogo</Text>
            <Icon name="arrow" size={17} color={colors.green} strokeWidth={1.6} />
          </Pressable>
          <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button" style={styles.coverLink}>
            {({ hovered }: WebState) =>
              <Text style={[styles.coverLinkText, hovered && { textDecorationLine: 'underline' }]}>Ritiro gratuito {atPlace(store || 'Arezzo e Lucca')}</Text>}
          </Pressable>
        </View>
      </Wrap>
    </ImageBackground>

    {SHOW_DEPARTMENTS && !!departments.length && <Departments departments={departments} total={total} countsReady={!!counts.data}
      cover={(d) => d.image_path ? imageUrl(d.image_path) : covers.data?.[d.id]?.image ?? null}
      sku={(d) => covers.data?.[d.id]?.sku ?? null} />}

    <Wrap style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.h2} accessibilityRole="header">In evidenza</Text>
        <MoreLink label="Tutto il catalogo" onPress={() => router.push('/catalog')} />
      </View>
      {featured.error && !featured.data
        ? <Notice tone="error" message="Impossibile caricare i prodotti. Controlla la connessione e ricarica la pagina." />
        : !featured.data ? <Loading /> : <Spread items={featuredItems} />}
    </Wrap>

    <View style={styles.band}>
      <Wrap style={styles.bandInner}>
        <View style={{ flex: 1.1, paddingRight: 64 }}>
          <Text style={styles.bandTitle}>Ritiro gratuito{'\n'}{atPlace(store || 'Arezzo e Lucca')}.</Text>
          <Text style={styles.bandText}>Ordina online e passa in negozio quando il tuo ordine è pronto. Il ritiro non costa nulla.</Text>
          <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button"
            style={({ hovered }: WebState) => [styles.bandButton, hovered && { backgroundColor: 'rgba(255,255,255,0.12)' }, transition('background-color')]}>
            <Icon name="store" size={18} color="#FFFFFF" strokeWidth={1.5} />
            <Text style={styles.bandButtonText}>Cambia negozio</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          {([['store', 'Ritiro in negozio', 'Sempre gratuito, nei nostri negozi di Arezzo e Lucca'],
             ['truck', 'Spedizione a casa', 'Gratuita da €66 per ordini fino a 10 kg'],
             ['shield', 'Pagamento sicuro', 'Gestito da Stripe, i dati della carta non passano da noi']] as Array<[IconName, string, string]>)
            .map(([icon, title, text], i) => <View key={title} style={[styles.fact, i === 0 && { borderTopWidth: 0 }]}>
              <Icon name={icon} size={24} color="#FFFFFF" strokeWidth={1.2} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.factTitle}>{title}</Text>
                <Text style={styles.factText}>{text}</Text>
              </View>
            </View>)}
        </View>
      </Wrap>
    </View>

    {valueItems.length >= 3 && <Wrap style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.h2} accessibilityRole="header">Piccoli prezzi</Text>
        {valueItems.length >= perRow && <MoreLink label="Dal prezzo più basso" onPress={() => router.push({ pathname: '/catalog', params: { sort: 'price_asc' } })} />}
      </View>
      <View style={styles.row}>
        {valueItems.map((p) => <View key={p.id} style={{ flex: 1, flexDirection: 'row' }}><ProductCard product={p} /></View>)}
        {valueItems.length < perRow && <Pressable onPress={() => router.push({ pathname: '/catalog', params: { sort: 'price_asc' } })} accessibilityRole="link"
          style={({ hovered }: WebState) => [styles.closer, { flex: perRow - valueItems.length }, hovered && { backgroundColor: '#EDE6DA' }, transition('background-color')]}>
          <Text style={styles.closerTitle}>Tutto il catalogo,{'\n'}dal prezzo più basso.</Text>
          <View style={styles.more}><Text style={styles.moreText}>Sfoglia</Text><Icon name="arrow" size={16} color={colors.green} strokeWidth={1.6} /></View>
        </Pressable>}
      </View>
    </Wrap>}

    <SiteFooter />
  </ScrollView>;
}

function MoreLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="link" style={styles.more}>
    {({ hovered }: WebState) => <>
      <Text style={[styles.moreText, hovered && { textDecorationLine: 'underline' }]}>{label}</Text>
      <View style={[hovered && { transform: [{ translateX: 4 }] }, transition('transform')]}>
        <Icon name="arrow" size={16} color={colors.green} strokeWidth={1.6} /></View>
    </>}
  </Pressable>;
}

/** Departments as photo tiles on stone plates, in one row when they fit. */
function Departments({ departments, total, countsReady, cover, sku }: {
  departments: CategoryRow[]; total: (d: CategoryRow) => number; countsReady: boolean;
  cover: (d: CategoryRow) => string | null; sku: (d: CategoryRow) => string | null;
}) {
  const open = (d: CategoryRow) => router.push({ pathname: '/catalog', params: { category: d.id } });
  const tile = (d: CategoryRow) => {
    const image = cover(d);
    return <Pressable key={d.id} onPress={() => open(d)} accessibilityRole="link"
      accessibilityLabel={`${d.name}${countsReady ? `, ${articles(total(d))}` : ''}`} style={{ flex: 1 }}>
      {({ hovered }: WebState) => <View style={{ flex: 1 }}>
        <View style={styles.tilePlate}>
          <View style={[StyleSheet.absoluteFill, styles.tileInner, hovered && { transform: [{ scale: 1.04 }] }, transition('transform', 700)]}>
            {image
              ? <Image source={{ uri: image }} resizeMode={d.image_path ? 'cover' : 'contain'} accessibilityIgnoresInvertColors
                  style={[d.image_path ? StyleSheet.absoluteFill : { width: '72%', height: '72%' },
                    { mixBlendMode: 'multiply' } as object]} />
              : sku(d)
                ? <View style={{ width: '70%' }}><ProductImage uri={null} sku={sku(d)} label={d.name} inset={0} blend /></View>
                : <CategoryIcon slug={d.slug} name={d.name} size={72} strokeWidth={0.9} />}
          </View>
        </View>
        <View style={styles.tileCaption}>
          <Text style={[styles.tileName, hovered && { color: colors.green }, transition('color')]} numberOfLines={1}>{d.name}</Text>
          <View style={[{ opacity: hovered ? 1 : 0.35 }, hovered && { transform: [{ translateX: 3 }] }, transition('opacity, transform')]}>
            <Icon name="arrow" size={18} color={colors.green} strokeWidth={1.5} /></View>
        </View>
        {countsReady && <Text style={styles.tileCount}>{articles(total(d))}</Text>}
      </View>}
    </Pressable>;
  };
  const rows = (list: CategoryRow[], perRow: number) => Array.from({ length: Math.ceil(list.length / perRow) }, (_, r) =>
    <View key={r} style={styles.tileRow}>
      {list.slice(r * perRow, r * perRow + perRow).map((d) => tile(d))}
      {Array.from({ length: perRow - list.slice(r * perRow, r * perRow + perRow).length }, (_, k) => <View key={`pad${k}`} style={{ flex: 1 }} />)}
    </View>);

  return <Wrap style={styles.section}>
    <View style={styles.sectionHead}>
      <Text style={styles.h2} accessibilityRole="header">Scegli il reparto</Text>
      <MoreLink label="Tutti i prodotti" onPress={() => router.push('/catalog')} />
    </View>
    {/* One row up to six departments (unlike the featured spread below), rows of four beyond that. */}
    <View style={{ gap: 40 }}>{rows(departments, departments.length <= 6 ? departments.length : 4)}</View>
  </Wrap>;
}

/** Featured spread: one product at feature size beside a 2 × 2 block, like a catalogue double page. */
function Spread({ items }: { items: CatalogProduct[] }) {
  if (items.length < 5) return <View style={styles.row}>
    {items.map((p) => <View key={p.id} style={{ flex: 1, flexDirection: 'row' }}><ProductCard product={p} /></View>)}
  </View>;
  const [lead, ...rest] = items;
  return <View style={styles.spread}>
    <View style={{ flex: 1, flexDirection: 'row' }}><ProductCard product={lead} variant="feature" /></View>
    <View style={{ flex: 1, gap: 40 }}>
      {[rest.slice(0, 2), rest.slice(2, 4)].map((pair, i) => <View key={i} style={styles.row}>
        {pair.map((p) => <View key={p.id} style={{ flex: 1, flexDirection: 'row' }}><ProductCard product={p} /></View>)}
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  cover: { width: '100%', backgroundColor: '#C9B79A', overflow: 'hidden', justifyContent: 'flex-end' },
  coverInner: { paddingBottom: 64 },
  coverTitle: { fontSize: 92, lineHeight: 90, letterSpacing: -2, color: '#FFFFFF', fontFamily: fonts.serif, maxWidth: 760 },
  coverText: { marginTop: 18, fontSize: 22, lineHeight: 30, color: '#FFFFFF', fontFamily: fonts.serif, maxWidth: 600, opacity: 0.94 },
  coverActions: { flexDirection: 'row', alignItems: 'center', gap: 28, marginTop: 34 },
  coverButton: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, paddingHorizontal: 28, borderRadius: 2, backgroundColor: '#FFFFFF' },
  coverButtonText: { fontSize: 15, letterSpacing: 0.3, color: colors.green, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  coverLink: { height: 52, justifyContent: 'center' },
  coverLinkText: { fontSize: 15, color: '#FFFFFF', fontFamily: fonts.sansMedium, fontWeight: '500' },

  section: { marginTop: 112 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36,
    paddingBottom: 18, borderBottomWidth: 1, borderColor: colors.text },
  h2: { fontSize: 56, lineHeight: 58, letterSpacing: -1, fontFamily: fonts.serif, color: colors.text },
  headNote: { fontSize: 13.5, color: colors.muted, fontFamily: fonts.sans, paddingBottom: 6 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 },
  moreText: { fontSize: 14, color: colors.green, fontFamily: fonts.sansSemiBold, fontWeight: '600', letterSpacing: 0.2 },

  tileRow: { flexDirection: 'row', gap: 28 },
  tilePlate: { backgroundColor: colors.photo, borderRadius: 4, overflow: 'hidden', aspectRatio: 0.88, borderWidth: 1, borderColor: colors.photoLine },
  tileInner: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.photo },
  tileCaption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, gap: 12 },
  tileName: { flexShrink: 1, fontSize: 26, lineHeight: 30, fontFamily: fonts.serif, color: colors.text },
  tileCount: { fontSize: 13.5, color: colors.muted, fontFamily: fonts.sans, marginTop: 2 },
  spread: { flexDirection: 'row', gap: 40 },
  closer: { backgroundColor: colors.stone, borderRadius: 4, padding: 36, justifyContent: 'space-between', minHeight: 260 },
  closerTitle: { fontSize: 34, lineHeight: 38, letterSpacing: -0.5, fontFamily: fonts.serif, color: colors.text },
  row: { flexDirection: 'row', gap: 28 },

  band: { marginTop: 128, backgroundColor: colors.green },
  bandInner: { flexDirection: 'row', paddingVertical: 88, alignItems: 'center' },
  bandTitle: { fontSize: 54, lineHeight: 58, letterSpacing: -1, color: '#FFFFFF', fontFamily: fonts.serif },
  bandText: { marginTop: 20, fontSize: 17, lineHeight: 26, color: 'rgba(255,255,255,0.86)', fontFamily: fonts.sans, maxWidth: 460 },
  bandButton: { marginTop: 32, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 24,
    borderRadius: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  bandButtonText: { fontSize: 14.5, color: '#FFFFFF', fontFamily: fonts.sansSemiBold, fontWeight: '600', letterSpacing: 0.2 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 20, paddingVertical: 24, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  factTitle: { fontSize: 24, color: '#FFFFFF', fontFamily: fonts.serif },
  factText: { fontSize: 14.5, lineHeight: 21, color: 'rgba(255,255,255,0.8)', fontFamily: fonts.sans },
});

