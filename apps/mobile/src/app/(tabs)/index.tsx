import { useState } from 'react';
import { ImageBackground, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { ProductVisual } from '@/components/ProductVisual';
import { StoreSheet, storeShortName } from '@/components/StoreSheet';
import { usePreferences } from '@/store/preferences';
import { Icon, type IconName } from '@/components/Icon';
import { Loading, Notice } from '@/components/UI';
import { demoHomeImage, productImageCells } from '@/data/productImages';
import { colors } from '@/config/theme';
import { fetchCategories, fetchProducts } from '@/lib/api';
import { useLayout, useStores } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';

/** Demo illustration per seeded category (placeholder imagery, see data/productImages.ts). */
const CATEGORY_VISUAL: Record<string, string> = {
  pulizia: 'detergente-lavatrice', cucina: 'padella-28', casa: 'lampada-tavolo', bagno: 'asciugamani-3', organizzazione: 'organizer-grande',
};
const CATEGORY_TINT = ['#EAF0E1', '#F3ECE0', '#E7EEF0', '#F1E8EC', '#ECEBE2'];

const PROMISES: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: 'truck', title: 'Spedizione gratuita', text: 'Da €66, fino a 10 kg' },
  { icon: 'store', title: 'Ritiro in negozio', text: 'Sempre gratuito, Arezzo e Lucca' },
  { icon: 'shield', title: 'Pagamento sicuro', text: 'Carte e wallet digitali con Stripe' },
  { icon: 'leaf', title: 'Disponibilità reale', text: 'Scorte aggiornate per ogni negozio' },
];

export default function HomeScreen() {
  const { selected, stores } = useStores();
  const setStoreId = usePreferences((s) => s.setStoreId);
  const [storeSheet, setStoreSheet] = useState(false);
  const storeName = storeShortName(selected);
  const { columns, wide } = useLayout();
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);
  const featured = useQuery(selected ? `featured:${selected.id}` : null,
    () => fetchProducts({ storeId: selected?.id ?? null, featured: true, pageSize: columns * 2 }));
  const value = useQuery(selected ? `value:${selected.id}` : null,
    () => fetchProducts({ storeId: selected?.id ?? null, sort: 'price_asc', pageSize: columns * 3 }));
  // Rows end on a full line, and the second rail never repeats products already featured above.
  const fullRows = <T,>(list: T[]) => list.length >= columns ? list.slice(0, list.length - (list.length % columns)) : list;
  const featuredIds = new Set((featured.data?.items ?? []).map((p) => p.id));
  const valueItems = fullRows((value.data?.items ?? []).filter((p) => !featuredIds.has(p.id)).slice(0, columns));
  const refresh = () => { void categories.refetch(); void featured.refetch(); void value.refetch(); };
  const catName = (id: string | null) => categories.data?.find((c) => c.id === id)?.name;
  const productGrid = (items: NonNullable<typeof featured.data>['items']) => <View style={styles.grid}>{items.map((product) =>
    <View key={product.id} style={{ width: `${100 / columns}%`, paddingHorizontal: 6 }}>
      <ProductCard product={product} categoryName={catName(product.category_id)} /></View>)}</View>;

  return <Screen refreshing={featured.loading && !!featured.data} onRefresh={refresh}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    <Pressable style={styles.announce} onPress={() => setStoreSheet(true)} accessibilityRole="button"
      accessibilityLabel={`Negozio selezionato: ${storeName}. Cambia negozio`}>
      <Icon name="pin" size={14} color={colors.lime} />
      <Text style={styles.announceText}>Stai vedendo prezzi e disponibilità di <Text style={{ fontWeight: '700', color: '#fff' }}>CASA & TE {storeName}</Text></Text>
      <Text style={styles.announceLink}>Cambia</Text>
    </Pressable>

    <View style={styles.header}>
      <View><Text style={styles.wordmark}>CASA <Text style={{ fontWeight: '400' }}>&</Text> TE</Text>
        <Text style={styles.tagline}>PICCOLE COSE, GRANDE CASA.</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Scegli negozio" style={styles.store}
        onPress={() => setStoreSheet(true)}>
        <Icon name="pin" size={17} color={colors.green} />
        <Text style={styles.storeText} numberOfLines={1}>{storeName || 'Negozio'}</Text>
        <Icon name="down" size={13} color={colors.green} />
      </Pressable>
    </View>
    <Pressable accessibilityRole="search" style={styles.search} onPress={() => router.push('/catalog')}>
      <Icon name="search" color="#8A8F84" size={19} /><Text style={styles.searchText}>Cerca prodotti, categorie...</Text>
    </Pressable>

    <ImageBackground source={demoHomeImage} style={[styles.hero, wide && styles.heroWide]} imageStyle={styles.heroImage}>
      <View style={[styles.heroCopy, wide && { padding: 44 }]}>
        <Text style={[styles.heroTitle, wide && styles.heroTitleWide]}>La casa,{'\n'}più semplice.</Text>
        <Text style={[styles.heroText, wide && { fontSize: 15, lineHeight: 22 }]}>Piccoli gesti.{'\n'}Nuove abitudini.</Text>
        <View style={styles.heroActions}>
          <Pressable accessibilityRole="button" style={styles.heroButton} onPress={() => router.push('/catalog')}>
            <Text style={styles.heroButtonText}>Scopri il catalogo</Text><Icon name="arrow" size={17} color="#fff" />
          </Pressable>
          {wide && <Pressable accessibilityRole="button" style={styles.heroGhost} onPress={() => setStoreSheet(true)}>
            <Icon name="store" size={16} color={colors.greenDark} /><Text style={styles.heroGhostText}>Trova il tuo negozio</Text>
          </Pressable>}
        </View>
      </View>
    </ImageBackground>

    <View style={styles.promises}>
      {PROMISES.map((p) => <View key={p.title} style={[styles.promise, { width: wide ? '25%' : '50%' }]}>
        <View style={styles.promiseInner}>
          <View style={styles.promiseIcon}><Icon name={p.icon} size={20} color={colors.green} /></View>
          <View style={{ flex: 1 }}><Text style={styles.promiseTitle}>{p.title}</Text>
            <Text style={styles.promiseText}>{p.text}</Text></View>
        </View>
      </View>)}
    </View>

    {!!categories.data?.length && <>
      <View style={styles.section}><View><Text style={styles.sectionTitle}>Ogni spazio, una cura.</Text>
        <Text style={styles.sectionSub}>Esplora per stanza e necessità</Text></View></View>
      <ScrollView horizontal={!wide} showsHorizontalScrollIndicator={false} style={wide ? undefined : { marginHorizontal: -20 }}
        contentContainerStyle={wide ? styles.categoryGrid : { paddingHorizontal: 20, gap: 12 }}>
        {categories.data.map((category, i) => {
          const visual = CATEGORY_VISUAL[category.slug];
          return <Pressable key={category.id} accessibilityRole="button"
            style={[styles.categoryCard, { backgroundColor: CATEGORY_TINT[i % CATEGORY_TINT.length] }, wide ? { flex: 1 } : { width: 150 }]}
            onPress={() => router.push({ pathname: '/catalog', params: { category: category.id } })}>
            <View style={styles.categoryMedia}>
              {visual && productImageCells[visual] !== undefined
                ? <ProductVisual id={visual} inset={0.14} />
                : <Text style={styles.categoryInitial}>{category.name.slice(0, 1)}</Text>}
            </View>
            <View style={styles.categoryFoot}>
              <Text style={styles.categoryLabel} numberOfLines={1}>{category.name}</Text>
              <Icon name="arrow" size={15} color={colors.greenDark} />
            </View>
          </Pressable>;
        })}
      </ScrollView>
    </>}

    <View style={styles.section}><View><Text style={styles.sectionTitle}>Scelti per la tua casa</Text>
      <Text style={styles.sectionSub}>I preferiti del negozio di {storeName || 'zona'}</Text></View>
      <Pressable onPress={() => router.push('/catalog')} style={styles.seeAll} accessibilityLabel="Tutti i prodotti">
        <Text style={styles.seeAllText}>Vedi tutti</Text><Icon name="arrow" color={colors.green} size={17} /></Pressable>
    </View>
    {featured.error && !featured.data ? <Notice tone="error" message="Impossibile caricare i prodotti. Controlla la connessione e ricarica la pagina." />
      : !featured.data ? <Loading /> : productGrid(fullRows(featured.data.items))}

    <View style={[styles.split, wide && { flexDirection: 'row' }]}>
      <View style={[styles.splitPanel, styles.splitDark, wide && { flex: 1.2 }]}>
        <Text style={styles.splitTitle}>Ordina online,{'\n'}ritira in negozio.</Text>
        <Text style={styles.splitText}>Scegli il negozio, paga online e passa a ritirare quando è pronto. Ti avvisiamo noi.</Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Negozio">{stores.map((s) => {
          const on = s.id === selected?.id;
          return <Pressable key={s.id} style={[styles.chip, on && styles.chipOn]} onPress={() => setStoreId(s.id)}
            accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <Icon name="pin" size={12} color={on ? colors.greenDark : '#DDEBCF'} />
            <Text style={[styles.chipText, on && { color: colors.greenDark, fontWeight: '700' }]}>{storeShortName(s)}</Text></Pressable>;
        })}</View>
        <Pressable style={styles.splitButton} onPress={() => setStoreSheet(true)} accessibilityRole="button">
          <Text style={styles.splitButtonText}>Indirizzi e orari dei negozi</Text><Icon name="arrow" size={16} color={colors.greenDark} />
        </Pressable>
      </View>
      <View style={[styles.splitPanel, styles.splitLight, wide && { flex: 1 }]}>
        <View style={styles.bigIcon}><Icon name="truck" size={30} color={colors.green} /></View>
        <Text style={[styles.splitTitle, { color: colors.greenDark, fontSize: 24, lineHeight: 28 }]}>Consegna a casa{'\n'}o al punto di ritiro.</Text>
        <Text style={[styles.splitText, { color: colors.muted }]}>Il costo si calcola sul peso del carrello ed è gratuito sopra €66.</Text>
        <Pressable onPress={() => router.push('/legal/shipping')} style={styles.textLink}>
          <Text style={styles.seeAllText}>Come funzionano le spedizioni</Text><Icon name="chevron" size={14} color={colors.green} />
        </Pressable>
      </View>
    </View>

    {valueItems.length >= Math.min(columns, 2) && <>
      <View style={styles.section}><View><Text style={styles.sectionTitle}>Piccoli prezzi, grande casa</Text>
        <Text style={styles.sectionSub}>Idee utili per tutti i giorni</Text></View></View>
      {productGrid(valueItems)}
    </>}

    <View style={styles.footer}>
      <View style={[styles.footerRow, wide && { flexDirection: 'row' }]}>
        <View style={{ flex: 1.4, gap: 8 }}>
          <Text style={[styles.wordmark, { fontSize: 20 }]}>CASA & TE</Text>
          <Text style={styles.footerText}>Articoli per la casa, pulizia e organizzazione.{'\n'}Negozi ad Arezzo e Lucca: per domande sul tuo ordine chiedi in negozio.</Text>
        </View>
        <View style={styles.footerCol}>
          <Text style={styles.footerHead}>Negozio online</Text>
          {([['Catalogo', '/catalog'], ['Carrello', '/cart'], ['I miei ordini', '/orders']] as const).map(([label, href]) =>
            <Pressable key={href} onPress={() => router.push(href)}><Text style={styles.footerLink}>{label}</Text></Pressable>)}
        </View>
        <View style={styles.footerCol}>
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

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });
const styles = StyleSheet.create({
  announce: { backgroundColor: colors.greenDark, marginHorizontal: -20, marginTop: -20, marginBottom: 18, paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  announceText: { color: '#E4EFD8', fontSize: 13, textAlign: 'center' },
  announceLink: { color: colors.lime, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, marginBottom: 23, gap: 12 },
  wordmark: { fontSize: 25, fontFamily: serif, letterSpacing: 1.5, fontWeight: '700', color: colors.greenDark },
  tagline: { fontSize: 12, letterSpacing: 1, marginTop: 4, color: colors.green },
  store: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, maxWidth: 170 },
  storeText: { fontSize: 14, color: colors.green, fontWeight: '500', flexShrink: 1 },
  search: { flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: '#ECEEE8', borderRadius: 14, paddingHorizontal: 16, height: 48, marginBottom: 20 },
  searchText: { fontSize: 14, color: colors.faint },
  hero: { height: 282, borderRadius: 22, overflow: 'hidden', backgroundColor: '#E6DDCE' },
  heroWide: { height: 400, borderRadius: 26 },
  heroImage: { borderRadius: 22, width: '100%', height: '100%' },
  heroCopy: { padding: 22, alignItems: 'flex-start' },
  heroTitle: { fontSize: 37, lineHeight: 40, letterSpacing: -1.4, color: '#263E26', marginTop: 4, fontFamily: serif },
  heroTitleWide: { fontSize: 56, lineHeight: 60, letterSpacing: -2, marginTop: 8 },
  heroText: { marginTop: 10, fontSize: 14, lineHeight: 20, color: '#435238' },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 17, flexWrap: 'wrap' },
  heroButton: { backgroundColor: colors.greenDark, borderRadius: 11, minHeight: 43, paddingHorizontal: 14, gap: 12, flexDirection: 'row', alignItems: 'center' },
  heroButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  heroGhost: { backgroundColor: '#FFFFFFD9', borderRadius: 11, minHeight: 43, paddingHorizontal: 14, gap: 8, flexDirection: 'row', alignItems: 'center' },
  heroGhostText: { color: colors.greenDark, fontSize: 14, fontWeight: '600' },
  promises: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, marginTop: 16 },
  promise: { padding: 6 },
  promiseInner: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.line, minHeight: 74 },
  promiseIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EAF0E1', justifyContent: 'center', alignItems: 'center' },
  promiseTitle: { color: colors.greenDark, fontSize: 14, fontWeight: '600' },
  promiseText: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 16 },
  section: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 34, marginBottom: 16 },
  sectionTitle: { fontSize: 22, letterSpacing: -0.6, fontWeight: '600', color: colors.text },
  sectionSub: { fontSize: 13, color: colors.muted, marginTop: 5 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  seeAllText: { color: colors.green, fontSize: 13, fontWeight: '600' },
  categoryGrid: { flexDirection: 'row', gap: 14 },
  categoryCard: { borderRadius: 18, overflow: 'hidden' },
  categoryMedia: { aspectRatio: 1.1, alignItems: 'center', justifyContent: 'center' },
  categoryInitial: { fontSize: 40, fontFamily: serif, color: colors.green },
  categoryFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },
  categoryLabel: { fontSize: 14, fontWeight: '600', color: colors.greenDark },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 22 },
  split: { marginTop: 40, gap: 14 },
  splitPanel: { borderRadius: 22, padding: 26, gap: 10 },
  splitDark: { backgroundColor: colors.greenDark },
  splitLight: { backgroundColor: '#EFF2E9', justifyContent: 'center' },
  splitTitle: { color: '#fff', fontSize: 30, lineHeight: 33, fontFamily: serif, letterSpacing: -1 },
  splitText: { color: '#D8E6CE', fontSize: 14, lineHeight: 20, maxWidth: 440 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#FFFFFF55', borderRadius: 20, paddingHorizontal: 12, minHeight: 36 },
  chipOn: { backgroundColor: colors.lime, borderColor: colors.lime },
  chipText: { color: '#EEF5E8', fontSize: 13 },
  splitButton: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: colors.lime, borderRadius: 11, minHeight: 43, paddingHorizontal: 16, gap: 10, flexDirection: 'row', alignItems: 'center' },
  splitButtonText: { color: colors.greenDark, fontSize: 14, fontWeight: '700' },
  bigIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  textLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  footer: { marginTop: 48, paddingTop: 28, borderTopWidth: 1, borderColor: colors.line, gap: 24 },
  footerRow: { gap: 24 },
  footerCol: { flex: 1, gap: 9 },
  footerHead: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted, fontWeight: '600', marginBottom: 2 },
  footerLink: { fontSize: 14, color: colors.text, paddingVertical: 4 },
  footerText: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  copyright: { fontSize: 12, color: colors.muted },
});
