import { ImageBackground, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { ProductVisual } from '@/components/ProductVisual';
import { Icon } from '@/components/Icon';
import { products } from '@/data/products';
import { demoHomeImage } from '@/data/productImages';
import { colors } from '@/config/theme';
import { usePreferences } from '@/store/preferences';
const categories = [
  { title: 'Pulizia', id: 'detergente-lavatrice' }, { title: 'Cucina', id: 'contenitori-cucina' },
  { title: 'Casa', id: 'lampada-tavolo' }, { title: 'Bagno', id: 'asciugamani-3' },
  { title: 'Organizzazione', id: 'organizer-grande' },
];
export default function HomeScreen() {
  const store = usePreferences((s) => s.store);
  return <Screen>
    <View style={styles.header}>
      <View><Text style={styles.wordmark}>CASA <Text style={{ fontWeight: '400' }}>&</Text> TE</Text>
        <Text style={styles.tagline}>PICCOLE COSE, GRANDE CASA.</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Scegli negozio" style={styles.store}
        onPress={() => router.push('/profile')}>
        <Icon name="pin" size={17} color={colors.green} />
        <Text style={styles.storeText}>{store}</Text><Icon name="down" size={13} color={colors.green} />
      </Pressable>
    </View>
    <Pressable accessibilityRole="button" style={styles.search} onPress={() => router.push('/catalog')}>
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
      <Text style={styles.imageNote}>IMMAGINE DEMO</Text>
    </ImageBackground>
    <View style={styles.delivery}>
      <View style={styles.deliveryIcon}><Icon name="truck" size={20} color={colors.green} /></View>
      <View style={{ flex: 1 }}><Text style={styles.deliveryTitle}>Spedizione gratuita da €66</Text>
        <Text style={styles.deliveryText}>Fino a 10 kg · Ritiro in negozio sempre gratis</Text></View>
    </View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Ogni spazio, una cura.</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
      {categories.map((category) => <Pressable key={category.title} style={styles.category}
        onPress={() => router.push({ pathname: '/catalog', params: { category: category.title } })}>
        <View style={styles.categoryPhoto}><ProductVisual id={category.id} inset={0.14} /></View>
        <Text style={styles.categoryLabel}>{category.title}</Text>
      </Pressable>)}
    </ScrollView>
    <View style={styles.section}><View><Text style={styles.sectionTitle}>Scelti per la tua casa</Text>
      <Text style={styles.sectionSub}>Idee semplici per tutti i giorni · Demo</Text></View>
      <Pressable onPress={() => router.push('/catalog')} style={{ padding: 10 }} accessibilityLabel="Tutti i prodotti">
        <Icon name="arrow" color={colors.green} size={21} /></Pressable>
    </View>
    <View style={styles.grid}>{products.filter((p) => p.featured).slice(0, 4).map((product) =>
      <View key={product.id} style={styles.half}><ProductCard product={product} /></View>)}</View>
    <Pressable style={styles.storeBanner} onPress={() => router.push('/profile')}>
      <Icon name="store" size={30} color={colors.green} /><View style={{ flex: 1 }}>
        <Text style={styles.deliveryTitle}>Vicini a te, anche in negozio.</Text>
        <Text style={styles.deliveryText}>Arezzo e Lucca · Scegli dove ritirare</Text></View><Icon name="chevron" size={18} />
    </Pressable>
  </Screen>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, marginBottom: 23, gap: 12 },
  wordmark: { fontSize: 25, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }), letterSpacing: 1.5, fontWeight: '700', color: colors.greenDark },
  tagline: { fontSize: 7, letterSpacing: 1.8, marginTop: 4, color: colors.green },
  store: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 },
  storeText: { fontSize: 12, color: colors.green, fontWeight: '500' },
  search: { flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: '#ECEEE8', borderRadius: 14, paddingHorizontal: 16, height: 48, marginBottom: 20 },
  searchText: { fontSize: 13, color: '#818779' },
  hero: { height: 282, borderRadius: 22, overflow: 'hidden', backgroundColor: '#E6DDCE' },
  heroImage: { borderRadius: 22, width: '100%', height: '100%' },
  heroCopy: { padding: 22, alignItems: 'flex-start' },
  heroBadge: { backgroundColor: '#F9F6EDC9', paddingVertical: 5, paddingHorizontal: 7, borderRadius: 5 },
  eyebrow: { fontSize: 8, letterSpacing: 1.1, color: colors.greenDark, fontWeight: '600' },
  heroTitle: { fontSize: 37, lineHeight: 39, letterSpacing: -1.7, color: '#263E26', marginTop: 13,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) },
  heroText: { marginTop: 10, fontSize: 12, lineHeight: 18, color: '#526147' },
  heroButton: { marginTop: 17, backgroundColor: colors.greenDark, borderRadius: 11, minHeight: 43, paddingHorizontal: 13, gap: 12, flexDirection: 'row', alignItems: 'center' },
  heroButtonText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  imageNote: { position: 'absolute', bottom: 10, right: 10, fontSize: 7, letterSpacing: 1, color: '#FFFFFFD9' },
  delivery: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 17, borderBottomWidth: 1, borderColor: colors.line },
  deliveryIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EAF0E1', justifyContent: 'center', alignItems: 'center' },
  deliveryTitle: { color: colors.greenDark, fontSize: 12, fontWeight: '600' },
  deliveryText: { color: colors.muted, fontSize: 10, marginTop: 4 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 15 },
  sectionTitle: { fontSize: 20, letterSpacing: -0.6, fontWeight: '600', color: colors.text },
  sectionSub: { fontSize: 11, color: colors.muted, marginTop: 5 },
  category: { width: 66, alignItems: 'center' },
  categoryPhoto: { width: 66, height: 66, backgroundColor: '#EBEDE5', borderRadius: 33, overflow: 'hidden' },
  categoryLabel: { fontSize: 10, color: colors.text, marginTop: 9 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 22 },
  half: { width: '50%', paddingHorizontal: 6 },
  storeBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 24, marginTop: 24, borderTopWidth: 1, borderColor: colors.line },
});

