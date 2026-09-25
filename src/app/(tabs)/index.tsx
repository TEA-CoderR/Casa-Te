import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { ProductVisual } from '@/components/ProductVisual';
import { Icon } from '@/components/Icon';
import { DemoNote } from '@/components/UI';
import { StoreSelector } from '@/components/StoreSelector';
import { products } from '@/data/products';
import { demoHomeImage } from '@/data/productImages';
import { colors, control, radius, spacing, typeScale } from '@/config/theme';

const categories = [
  { title: 'Pulizia', id: 'detergente-lavatrice' },
  { title: 'Cucina', id: 'contenitori-cucina' },
  { title: 'Casa', id: 'lampada-tavolo' },
  { title: 'Bagno', id: 'asciugamani-3' },
  { title: 'Organizzazione', id: 'organizer-grande' },
];

export default function HomeScreen() {
  return <Screen>
    <View style={styles.header}>
      <Text accessibilityLabel="CASA & TE" style={styles.wordmark}>CASA <Text style={styles.ampersand}>&</Text> TE</Text>
      <StoreSelector variant="compact" />
    </View>

    <Pressable accessibilityRole="button" accessibilityLabel="Cerca prodotti" style={styles.search}
      onPress={() => router.push({ pathname: '/catalog', params: { focus: 'search' } })}>
      <Icon name="search" color={colors.muted} size={20} />
      <Text style={styles.searchText}>Cerca prodotti, categorie...</Text>
      <Icon name="arrow" color={colors.green} size={20} />
    </Pressable>

    <View style={styles.categoriesSection}>
      <Text style={styles.sectionTitle}>Categorie</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categories}>
        {categories.map((category) => <Pressable key={category.title}
          accessibilityRole="button" accessibilityLabel={`Apri categoria ${category.title}`}
          onPress={() => router.push({ pathname: '/catalog', params: { category: category.title } })}
          style={styles.category}>
          <View style={styles.categoryPhoto}><ProductVisual id={category.id} inset={0.16} /></View>
          <Text numberOfLines={1} style={styles.categoryLabel}>{category.title}</Text>
        </Pressable>)}
      </ScrollView>
    </View>

    <Pressable accessibilityRole="button" accessibilityLabel="Scopri il catalogo"
      onPress={() => router.push('/catalog')}>
      <ImageBackground source={demoHomeImage} style={styles.hero} imageStyle={styles.heroImage}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Idee pratiche{ '\n' }per la casa</Text>
          <View style={styles.heroButton}>
            <Text style={styles.heroButtonText}>Scopri il catalogo</Text>
            <Icon name="arrow" size={20} color={colors.surface} />
          </View>
        </View>
      </ImageBackground>
    </Pressable>

    <View style={styles.delivery}>
      <View style={styles.deliveryIcon}><Icon name="truck" size={21} color={colors.green} /></View>
      <View style={styles.deliveryCopy}>
        <Text style={styles.deliveryTitle}>Spedizione gratuita da €66</Text>
        <Text style={styles.deliveryText}>Ordini fino a 10 kg · Ritiro in negozio sempre gratis</Text>
      </View>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Prodotti in evidenza</Text>
      <DemoNote>Immagini, prezzi e disponibilità dimostrativi.</DemoNote>
    </View>
    <View style={styles.grid}>
      {products.filter((product) => product.featured).slice(0, 4).map((product) =>
        <View key={product.id} style={styles.half}>
          <ProductCard product={product} imageAspectRatio={1.55} />
        </View>)}
    </View>

    <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={styles.storeBanner}>
      <Icon name="store" size={24} color={colors.green} />
      <View style={{ flex: 1 }}>
        <Text style={styles.storeTitle}>Ritiro gratuito in negozio</Text>
        <Text style={styles.storeDescription}>Arezzo e Lucca</Text>
      </View>
      <Icon name="chevron" size={20} color={colors.green} />
    </Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { minHeight: control.minHeight, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: spacing.xs, gap: spacing.xs },
  wordmark: { fontSize: 23, fontWeight: '800', letterSpacing: 0.7, color: colors.greenDark },
  ampersand: { fontWeight: '500', color: colors.green },
  search: { minHeight: control.minHeight, flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    backgroundColor: colors.surfaceMuted, borderRadius: radius.md, paddingHorizontal: spacing.md,
    marginBottom: spacing.md },
  searchText: { flex: 1, color: colors.muted, fontSize: typeScale.label },
  categoriesSection: { marginBottom: spacing.md },
  categories: { gap: spacing.xs, paddingTop: spacing.xs },
  sectionTitle: { fontSize: typeScale.section, lineHeight: 26, fontWeight: '700', color: colors.text },
  category: { minWidth: 48, alignItems: 'center', justifyContent: 'center', gap: spacing.xxs },
  categoryPhoto: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceMuted,
    overflow: 'hidden' },
  categoryLabel: { fontSize: typeScale.caption, color: colors.text },
  hero: { minHeight: 132, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'center', backgroundColor: '#E6DDCE' },
  heroImage: { borderRadius: radius.lg },
  heroCopy: { alignItems: 'flex-start', padding: spacing.md, gap: spacing.sm },
  heroTitle: { fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3, color: colors.greenDark },
  heroButton: { minHeight: control.minHeight, borderRadius: radius.sm, paddingHorizontal: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.greenDark },
  heroButtonText: { color: colors.surface, fontSize: typeScale.caption, fontWeight: '700' },
  delivery: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.line },
  deliveryIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: '#EAF0E4',
    justifyContent: 'center', alignItems: 'center' },
  deliveryCopy: { flex: 1, gap: spacing.xxs },
  deliveryTitle: { color: colors.greenDark, fontSize: typeScale.label, lineHeight: 20, fontWeight: '700' },
  deliveryText: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 17 },
  section: { marginTop: spacing.md, marginBottom: spacing.xs, gap: spacing.xxs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xxs, rowGap: spacing.md },
  half: { width: '50%', paddingHorizontal: spacing.xxs },
  storeBanner: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, marginTop: spacing.lg, borderTopWidth: 1, borderColor: colors.line },
  storeTitle: { color: colors.text, fontSize: typeScale.label, fontWeight: '700' },
  storeDescription: { color: colors.muted, fontSize: typeScale.caption, marginTop: spacing.xxs },
});
