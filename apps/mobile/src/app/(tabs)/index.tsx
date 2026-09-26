import { ImageBackground, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { Icon } from '@/components/Icon';
import { Loading, Notice } from '@/components/UI';
import { demoHomeImage } from '@/data/productImages';
import { colors } from '@/config/theme';
import { fetchCategories, fetchProducts } from '@/lib/api';
import { useLayout, useStores } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';

export default function HomeScreen() {
  const { selected } = useStores();
  const { columns } = useLayout();
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);
  const featured = useQuery(selected ? `featured:${selected.id}` : null,
    () => fetchProducts({ storeId: selected?.id ?? null, featured: true, pageSize: columns * 2 }));
  const refresh = () => { void categories.refetch(); void featured.refetch(); };
  const catName = (id: string | null) => categories.data?.find((c) => c.id === id)?.name;

  return <Screen refreshing={featured.loading && !!featured.data} onRefresh={refresh}>
    <View style={styles.header}>
      <View><Text style={styles.wordmark}>CASA <Text style={{ fontWeight: '400' }}>&</Text> TE</Text>
        <Text style={styles.tagline}>PICCOLE COSE, GRANDE CASA.</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Scegli negozio" style={styles.store}
        onPress={() => router.push('/profile')}>
        <Icon name="pin" size={17} color={colors.green} />
        <Text style={styles.storeText} numberOfLines={1}>{selected?.name.replace(/^CASA & TE\s*/, '') ?? 'Negozio'}</Text>
        <Icon name="down" size={13} color={colors.green} />
      </Pressable>
    </View>
    <Pressable accessibilityRole="search" style={styles.search} onPress={() => router.push('/catalog')}>
      <Icon name="search" color="#8A8F84" size={19} /><Text style={styles.searchText}>Cerca prodotti, categorie...</Text>
    </Pressable>
    <ImageBackground source={demoHomeImage} style={styles.hero} imageStyle={styles.heroImage}>
      <View style={styles.heroCopy}>
        <View style={styles.heroBadge}><Text style={styles.eyebrow}>IL BELLO DI OGNI GIORNO</Text></View>
        <Text style={styles.heroTitle}>La casa,{'\n'}più semplice.</Text>
        <Text style={styles.heroText}>Piccoli gesti.{'\n'}Nuove abitudini.</Text>
        <Pressable accessibilityRole="button" style={styles.heroButton} onPress={() => router.push('/catalog')}>
          <Text style={styles.heroButtonText}>Scopri il catalogo</Text><Icon name="arrow" size={17} color="#fff" />
        </Pressable>
      </View>
    </ImageBackground>
    <View style={styles.delivery}>
      <View style={styles.deliveryIcon}><Icon name="truck" size={20} color={colors.green} /></View>
      <View style={{ flex: 1 }}><Text style={styles.deliveryTitle}>Spedizione gratuita da €66</Text>
        <Text style={styles.deliveryText}>Fino a 10 kg · Ritiro in negozio sempre gratis</Text></View>
    </View>

    {!!categories.data?.length && <>
      <View style={styles.section}><Text style={styles.sectionTitle}>Ogni spazio, una cura.</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
        {categories.data.map((category) => <Pressable key={category.id} style={styles.category} accessibilityRole="button"
          onPress={() => router.push({ pathname: '/catalog', params: { category: category.id } })}>
          <View style={styles.categoryPhoto}><Text style={styles.categoryInitial}>{category.name.slice(0, 1)}</Text></View>
          <Text style={styles.categoryLabel} numberOfLines={2}>{category.name}</Text>
        </Pressable>)}
      </ScrollView>
    </>}

    <View style={styles.section}><View><Text style={styles.sectionTitle}>Scelti per la tua casa</Text>
      <Text style={styles.sectionSub}>Idee semplici per tutti i giorni</Text></View>
      <Pressable onPress={() => router.push('/catalog')} style={{ padding: 10 }} accessibilityLabel="Tutti i prodotti">
        <Icon name="arrow" color={colors.green} size={21} /></Pressable>
    </View>
    {featured.error && !featured.data ? <Notice tone="error" message="Impossibile caricare i prodotti. Trascina verso il basso per riprovare." />
      : !featured.data ? <Loading />
      : <View style={styles.grid}>{featured.data.items.map((product) =>
        <View key={product.id} style={{ width: `${100 / columns}%`, paddingHorizontal: 6 }}>
          <ProductCard product={product} categoryName={catName(product.category_id)} /></View>)}</View>}

    <Pressable style={styles.storeBanner} onPress={() => router.push('/profile')}>
      <Icon name="store" size={30} color={colors.green} /><View style={{ flex: 1 }}>
        <Text style={styles.deliveryTitle}>Vicini a te, anche in negozio.</Text>
        <Text style={styles.deliveryText}>Arezzo e Lucca · Scegli dove ritirare</Text></View><Icon name="chevron" size={18} />
    </Pressable>
  </Screen>;
}

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });
const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, marginBottom: 23, gap: 12 },
  wordmark: { fontSize: 25, fontFamily: serif, letterSpacing: 1.5, fontWeight: '700', color: colors.greenDark },
  tagline: { fontSize: 7, letterSpacing: 1.8, marginTop: 4, color: colors.green },
  store: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, maxWidth: 170 },
  storeText: { fontSize: 12, color: colors.green, fontWeight: '500', flexShrink: 1 },
  search: { flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: '#ECEEE8', borderRadius: 14, paddingHorizontal: 16, height: 48, marginBottom: 20 },
  searchText: { fontSize: 13, color: '#818779' },
  hero: { height: 282, borderRadius: 22, overflow: 'hidden', backgroundColor: '#E6DDCE' },
  heroImage: { borderRadius: 22, width: '100%', height: '100%' },
  heroCopy: { padding: 22, alignItems: 'flex-start' },
  heroBadge: { backgroundColor: '#F9F6EDC9', paddingVertical: 5, paddingHorizontal: 7, borderRadius: 5 },
  eyebrow: { fontSize: 8, letterSpacing: 1.1, color: colors.greenDark, fontWeight: '600' },
  heroTitle: { fontSize: 37, lineHeight: 39, letterSpacing: -1.7, color: '#263E26', marginTop: 13, fontFamily: serif },
  heroText: { marginTop: 10, fontSize: 12, lineHeight: 18, color: '#526147' },
  heroButton: { marginTop: 17, backgroundColor: colors.greenDark, borderRadius: 11, minHeight: 43, paddingHorizontal: 13, gap: 12, flexDirection: 'row', alignItems: 'center' },
  heroButtonText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  delivery: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 17, borderBottomWidth: 1, borderColor: colors.line },
  deliveryIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EAF0E1', justifyContent: 'center', alignItems: 'center' },
  deliveryTitle: { color: colors.greenDark, fontSize: 12, fontWeight: '600' },
  deliveryText: { color: colors.muted, fontSize: 10, marginTop: 4 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 15 },
  sectionTitle: { fontSize: 20, letterSpacing: -0.6, fontWeight: '600', color: colors.text },
  sectionSub: { fontSize: 11, color: colors.muted, marginTop: 5 },
  category: { width: 72, alignItems: 'center' },
  categoryPhoto: { width: 66, height: 66, backgroundColor: '#EBEDE5', borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  categoryInitial: { fontSize: 24, fontFamily: serif, color: colors.green },
  categoryLabel: { fontSize: 10, color: colors.text, marginTop: 9, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 22 },
  storeBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 24, marginTop: 24, borderTopWidth: 1, borderColor: colors.line },
});
