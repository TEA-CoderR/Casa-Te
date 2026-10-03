import { useState } from 'react';
import { Image, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { CategoryIcon } from '@/components/CategoryIcon';
import { StoreSheet, storeShortName } from '@/components/StoreSheet';
import { Icon } from '@/components/Icon';
import { MenuSheet } from '@/components/MenuSheet';
import { Loading, Notice } from '@/components/UI';
import { demoHomeImage } from '@/data/productImages';
import { cardShadow, colors, fonts } from '@/config/theme';
import { fetchCategories, fetchProducts, imageUrl } from '@/lib/api';
import { useLayout, useStores } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';
import { cartItemCount, useCartStore } from '@/store/cart';


export default function HomeScreen() {
  const { selected } = useStores();
  const [storeSheet, setStoreSheet] = useState(false);
  const [heroWidth, setHeroWidth] = useState(0);
  const [menu, setMenu] = useState(false);
  const storeName = storeShortName(selected);
  const { columns, wide } = useLayout();
  const count = cartItemCount(useCartStore((s) => s.items));
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);
  const featured = useQuery(selected ? `featured:${selected.id}` : null,
    // Products starred "In evidenza" in the admin; while none is starred, the start of the catalogue.
    async () => {
      const picked = await fetchProducts({ storeId: selected?.id ?? null, featured: true, sort: 'featured', pageSize: columns * 2 });
      return picked.items.length ? picked : fetchProducts({ storeId: selected?.id ?? null, sort: 'featured', pageSize: columns * 2 });
    });
  const value = useQuery(selected ? `value:${selected.id}` : null,
    () => fetchProducts({ storeId: selected?.id ?? null, sort: 'price_asc', pageSize: columns * 3 }));
  // Rows end on a full line, and the second rail never repeats products already featured above.
  const fullRows = <T,>(list: T[]) => list.length >= columns ? list.slice(0, list.length - (list.length % columns)) : list;
  const featuredIds = new Set((featured.data?.items ?? []).map((p) => p.id));
  const valueItems = fullRows((value.data?.items ?? []).filter((p) => !featuredIds.has(p.id)).slice(0, columns));
  const refresh = () => { void categories.refetch(); void featured.refetch(); void value.refetch(); };
  const productGrid = (items: NonNullable<typeof featured.data>['items']) => <View style={styles.grid}>{items.map((product) =>
    <View key={product.id} style={{ width: `${100 / columns}%`, paddingHorizontal: 6, flexDirection: 'row' }}>
      <ProductCard product={product} /></View>)}</View>;
  // Up to 8 departments chosen in the admin ("Mostra in home"); the first 8 when none is chosen.
  const allTop = (categories.data ?? []).filter((c) => !c.parent_id);
  const chosen = allTop.filter((c) => c.show_on_home);
  const topCategories = (chosen.length ? chosen : allTop).slice(0, 8);
  // The photo is 3:2 with the objects on the right: on narrow screens anchor it right instead of centring on the wall.
  const heroHeight = wide ? 520 : 330;
  const photoWidth = heroHeight * 1.5;
  const heroImageStyle = heroWidth && heroWidth < photoWidth
    ? { width: photoWidth, height: heroHeight, left: heroWidth - photoWidth, borderRadius: wide ? 18 : 0 }
    : wide ? { borderRadius: 18 } : undefined;
  // Each department gets a line drawing on the same warm stone tone, like the photo tiles of the design.
  const tones = ['#F1ECE4'];
  const categoryItem = (category: CategoryRow, index: number, width?: `${number}%`) =>
    <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={`Categoria ${category.name}`}
      style={({ pressed }) => [styles.category, width ? { width } : { minWidth: 82 }, { opacity: pressed ? 0.7 : 1 }]}
      onPress={() => router.push({ pathname: '/catalog', params: { category: category.id } })}>
      <View style={[styles.circle, { backgroundColor: tones[index % tones.length] }, wide && { width: 104, height: 104, borderRadius: 52 }]}>
        {category.image_path
          // Cover photo from the admin; white studio backgrounds melt into the stone tone.
          ? <Image source={{ uri: imageUrl(category.image_path) ?? undefined }} resizeMode="cover" accessibilityIgnoresInvertColors
              style={[StyleSheet.absoluteFill, { mixBlendMode: 'multiply' } as object]} />
          : <CategoryIcon slug={category.slug} name={category.name} size={wide ? 44 : 30} strokeWidth={1.25} />}
      </View>
      <Text style={[styles.categoryLabel, wide && { fontSize: 16 }]} numberOfLines={1}>{category.name}</Text>
    </Pressable>;

  return <Screen refreshing={featured.loading && !!featured.data} onRefresh={refresh} contentContainerStyle={{ paddingTop: 6 }}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    <MenuSheet visible={menu} onClose={() => setMenu(false)} onStores={() => setStoreSheet(true)} />

    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Apri menu" onPress={() => setMenu(true)} style={styles.iconButton}>
        <Icon name="menu" size={24} strokeWidth={1.6} />
      </Pressable>
      <View style={styles.brand}>
        <Text style={[styles.wordmark, wide && { fontSize: 38 }]} accessibilityRole="header">Casa & Te</Text>
        <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button" style={styles.storeLink}
          accessibilityLabel={`Negozio selezionato: ${storeName}. Cambia negozio`}>
          <Icon name="pin" size={13} color={colors.green} strokeWidth={2} />
          <Text style={styles.storeText} numberOfLines={1}>Ritiro a {storeName || 'scegli negozio'}</Text>
          <Icon name="chevron" size={12} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={count ? `Carrello, ${count} articoli` : 'Carrello'} onPress={() => router.push('/cart')} style={styles.iconButton}>
        <Icon name="cart" size={24} />
        {count > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text></View>}
      </Pressable>
    </View>

    <View onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)} style={wide ? undefined : { marginHorizontal: -20 }}>
    <ImageBackground source={demoHomeImage} resizeMode="cover" style={[styles.hero, wide ? styles.heroWide : styles.heroPhone]}
      imageStyle={heroImageStyle}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
        <Defs><LinearGradient id="shade" x1="0" y1="0" x2={wide ? '1' : '0.35'} y2={wide ? '0.5' : '1'}>
          <Stop offset="0" stopColor="#1A140C" stopOpacity="0.72" />
          <Stop offset="0.6" stopColor="#1A140C" stopOpacity="0.4" />
          <Stop offset="1" stopColor="#1A140C" stopOpacity="0.12" />
        </LinearGradient></Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#shade)" rx={wide ? 18 : 0} />
      </Svg>
      <View style={[styles.heroCopy, wide && { padding: 48, maxWidth: 620 }]}>
        <Text style={[styles.heroTitle, wide && styles.heroTitleWide]}>La bellezza{'\n'}vive con te.</Text>
        <Text style={[styles.heroText, wide && { fontSize: 19, lineHeight: 27 }]}>Casa, stile e ispirazione{'\n'}per ogni momento{'\n'}della tua vita.</Text>
      </View>
      <Pressable accessibilityRole="search" accessibilityLabel="Cerca prodotti" onPress={() => router.push({ pathname: '/catalog', params: { search: '1' } })}
        style={[styles.search, wide && { left: 48, right: undefined, width: 480, bottom: 40 }]}>
        <Icon name="search" color={colors.text} size={19} /><Text style={styles.searchText}>Cosa stai cercando?</Text>
      </Pressable>
    </ImageBackground>
    </View>

    {!!topCategories.length && (wide
      ? <View style={[styles.categories, { marginTop: 40 }]}>{topCategories.map((c, i) => categoryItem(c, i, `${100 / topCategories.length}%`))}</View>
      : <View style={[styles.categories, { marginTop: 18, rowGap: 14 }]}>{topCategories.map((c, i) => categoryItem(c, i, '25%'))}</View>)}

    <View style={styles.section}>
      <Text style={[styles.sectionTitle, wide && { fontSize: 30 }]} accessibilityRole="header">In evidenza</Text>
      <Pressable onPress={() => router.push('/catalog')} style={styles.seeAll} accessibilityRole="link">
        <Text style={styles.seeAllText}>Scopri tutto</Text><Icon name="chevron" color={colors.green} size={14} strokeWidth={2} /></Pressable>
    </View>
    {featured.error && !featured.data ? <Notice tone="error" message="Impossibile caricare i prodotti. Controlla la connessione e ricarica la pagina." />
      : !featured.data ? <Loading /> : productGrid(fullRows(featured.data.items))}

    <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button" style={[styles.banner, wide && { padding: 28 }]}>
      <View style={styles.bannerIcon}><Icon name="store" size={24} color={colors.green} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.bannerTitle}>Ritiro gratuito in negozio</Text>
        <Text style={styles.bannerText}>Ordina online e ritira a {storeName || 'Arezzo o Lucca'} quando è pronto. Spedizione a casa gratuita da €66 (fino a 10 kg).</Text>
      </View>
      <Icon name="chevron" size={18} color={colors.text} />
    </Pressable>

    {valueItems.length >= Math.min(columns, 2) && <>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, wide && { fontSize: 30 }]} accessibilityRole="header">Piccoli prezzi</Text>
      </View>
      {productGrid(valueItems)}
    </>}

    <View style={styles.footer}>
      <View style={[styles.footerRow, wide && { flexDirection: 'row' }]}>
        <View style={[{ gap: 8 }, wide && { flex: 1.4 }]}>
          <Text style={[styles.wordmark, { fontSize: 24, textAlign: 'left' }]}>Casa & Te</Text>
          <Text style={styles.footerText}>Articoli per la casa, pulizia e organizzazione.{'\n'}Negozi ad Arezzo e Lucca: per domande sul tuo ordine chiedi in negozio.</Text>
        </View>
        <View style={[styles.footerCol, wide && { flex: 1 }]}>
          <Text style={styles.footerHead}>Negozio online</Text>
          {([['Catalogo', '/catalog'], ['Carrello', '/cart'], ['I miei ordini', '/orders']] as const).map(([label, href]) =>
            <Pressable key={href} onPress={() => router.push(href)}><Text style={styles.footerLink}>{label}</Text></Pressable>)}
        </View>
        <View style={[styles.footerCol, wide && { flex: 1 }]}>
          <Text style={styles.footerHead}>Informazioni</Text>
          <Pressable onPress={() => setStoreSheet(true)}><Text style={styles.footerLink}>Negozi, indirizzi e orari</Text></Pressable>
          {([['Spedizioni e ritiro', 'shipping'], ['Condizioni di vendita', 'terms'], ['Privacy', 'privacy']] as const).map(([label, doc]) =>
            <Pressable key={doc} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc } })}><Text style={styles.footerLink}>{label}</Text></Pressable>)}
        </View>
      </View>
      <Text style={styles.copyright}>© {new Date().getFullYear()} CASA & TE · Pagamenti gestiti da Stripe</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  brand: { flex: 1, alignItems: 'center' },
  wordmark: { fontSize: 30, fontFamily: fonts.display, color: colors.text, textAlign: 'center', letterSpacing: -0.2 },
  storeLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, maxWidth: 240 },
  storeText: { fontSize: 12, color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500', flexShrink: 1 },
  badge: { position: 'absolute', top: 3, right: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.badge,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  hero: { backgroundColor: '#D9CBB4', overflow: 'hidden' },
  heroPhone: { height: 330 },
  heroWide: { height: 520, borderRadius: 18 },
  heroCopy: { padding: 20, paddingTop: 52 },
  heroTitle: { fontSize: 42, lineHeight: 43, color: '#FFFFFF', fontFamily: fonts.serif, letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 12 },
  heroTitleWide: { fontSize: 76, lineHeight: 78 },
  heroText: { marginTop: 10, fontSize: 18, lineHeight: 22, color: '#FFFFFF', fontFamily: fonts.serif, textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 8 },
  search: { position: 'absolute', left: 16, right: 16, bottom: 14, flexDirection: 'row', gap: 12, alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 18, height: 46, ...cardShadow },
  searchText: { fontSize: 15, color: colors.muted, fontFamily: fonts.sans },
  categories: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  category: { alignItems: 'center', paddingHorizontal: 4, gap: 8 },
  circle: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E2D6', overflow: 'hidden' },
  categoryLabel: { fontSize: 14.5, fontFamily: fonts.serif, color: colors.text, textAlign: 'center' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 12 },
  sectionTitle: { fontSize: 25, fontFamily: fonts.serif, color: colors.text },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, marginRight: -8 },
  seeAllText: { color: colors.green, fontSize: 13, fontFamily: fonts.sansMedium, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 12 },
  banner: { marginTop: 34, backgroundColor: colors.sand, borderRadius: 14, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  bannerIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 19, fontFamily: fonts.serif, color: colors.text },
  bannerText: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 4, fontFamily: fonts.sans },
  footer: { marginTop: 48, paddingTop: 28, borderTopWidth: 1, borderColor: colors.line, gap: 24 },
  footerRow: { gap: 24 },
  footerCol: { gap: 6 },
  footerHead: { fontSize: 16, fontFamily: fonts.serif, color: colors.text, marginBottom: 2 },
  footerLink: { fontSize: 14, color: colors.muted, paddingVertical: 4, fontFamily: fonts.sans },
  footerText: { fontSize: 13, color: colors.muted, lineHeight: 19, fontFamily: fonts.sans },
  copyright: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans },
});
