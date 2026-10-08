import { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { CategoryIcon } from '@/components/CategoryIcon';
import { atPlace, StoreSheet, storeShortName } from '@/components/StoreSheet';
import { Icon, type IconName } from '@/components/Icon';
import { Loading, Notice } from '@/components/UI';
import { BrandHeader, HeaderButton, HeaderSearch } from '@/components/BrandHeader';
import { ProductImage } from '@/components/ProductImage';
import { colors, fonts } from '@/config/theme';
import { fetchCategories, fetchOffers, fetchProducts, imageUrl, type CatalogProduct } from '@/lib/api';
import { useClubSettings, useLayout, useStores } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';
import { discountLabel } from '@/lib/price';
import { HomeDesktop } from '@/components/site/HomeDesktop';
import { ALL_PRODUCTS } from '@/lib/links';


/** Desktop web gets the catalogue-style home; phones and the native app keep the phone home. */
export default function HomeScreen() {
  const { wide } = useLayout();
  return wide ? <HomeDesktop /> : <HomePhone />;
}

function HomePhone() {
  const { selected } = useStores();
  const [storeSheet, setStoreSheet] = useState(false);
  const storeName = storeShortName(selected);
  const club = useClubSettings();
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);
  const featured = useQuery(selected ? `featured:${selected.id}` : null,
    // Products starred "In evidenza" in the admin; while none is starred, the start of the catalogue.
    async () => {
      const picked = await fetchProducts({ storeId: selected?.id ?? null, featured: true, sort: 'featured', pageSize: 8 });
      return picked.items.length ? { ...picked, picked: true } : { ...await fetchProducts({ storeId: selected?.id ?? null, sort: 'featured', pageSize: 8 }), picked: false };
    });
  const offers = useQuery(selected ? `offers:${selected.id}:8` : null, () => fetchOffers(selected?.id ?? null, 8));
  const offerItems = offers.data ?? [];
  const lead = offerItems[0];
  const leadDiscount = lead ? discountLabel(lead.price_cents, lead.compare_at_price_cents) : null;
  const refresh = () => { void categories.refetch(); void featured.refetch(); void offers.refetch(); };
  // Up to 8 departments chosen in the admin ("Mostra in home"); the first 8 when none is chosen.
  const allTop = (categories.data ?? []).filter((c) => !c.parent_id);
  const chosen = allTop.filter((c) => c.show_on_home);
  const topCategories = (chosen.length ? chosen : allTop).slice(0, 8);
  const openCatalog = (params: Record<string, string>) => router.push({ pathname: '/catalog', params: { offerte: '', evidenza: '', category: '', ...params } });

  const shortcut = (label: string, icon: IconName, tone: { bg: string; fg: string }, onPress: () => void) =>
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.7 }]}>
      <View style={[styles.shortcutIcon, { backgroundColor: tone.bg }]}><Icon name={icon} size={24} color={tone.fg} strokeWidth={2} /></View>
      <Text style={styles.shortcutText}>{label}</Text>
    </Pressable>;
  const rail = (items: CatalogProduct[]) => <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railScroll}
    contentContainerStyle={styles.rail}>
    {items.map((product) => <View key={product.id} style={styles.railItem}><ProductCard product={product} /></View>)}
  </ScrollView>;
  const sectionHead = (title: ReactNode, link: string, onPress: () => void) => <View style={styles.section}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{title}</View>
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}><Text style={styles.link}>{link} ›</Text></Pressable>
  </View>;

  const header = <BrandHeader logo right={<HeaderButton icon="heart" label="Preferiti" onPress={() => router.push('/favorites')} />}>
    <HeaderSearch placeholder="Cerca tra i nostri prodotti" onPress={() => openCatalog({ search: '1' })} />
    <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button" style={styles.store}
      accessibilityLabel={storeName ? `Il tuo negozio: ${storeName}. Cambia negozio` : 'Scegli il negozio'}>
      <Icon name="store" size={17} color="#FFFFFF" strokeWidth={2} />
      <Text style={styles.storeText} numberOfLines={1}>{storeName ? <>Il tuo negozio: <Text style={{ fontFamily: fonts.sansBold, fontWeight: '700' }}>{storeName}</Text></> : 'Scegli il tuo negozio'}</Text>
      <Icon name="down" size={15} color="#FFFFFF" strokeWidth={2.2} />
    </Pressable>
  </BrandHeader>;

  return <Screen header={header} ground={colors.page} refreshing={featured.loading && !!featured.data} onRefresh={refresh}
    contentContainerStyle={{ padding: 0, paddingBottom: 28 }}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />

    <View style={styles.white}>
      <View style={styles.shortcuts}>
        {shortcut('Offerte', 'percent', { bg: colors.sale, fg: '#FFFFFF' }, () => openCatalog({ offerte: '1' }))}
        {shortcut('Volantino', 'flyer', { bg: colors.yellow, fg: colors.green }, () => router.push('/volantino'))}
        {shortcut('Negozi', 'pin', { bg: colors.mint, fg: colors.green }, () => setStoreSheet(true))}
        {club.enabled
          ? shortcut('Club', 'card', { bg: colors.green, fg: colors.yellow }, () => router.push('/club'))
          : shortcut('Preferiti', 'heart', { bg: colors.mint, fg: colors.green }, () => router.push('/favorites'))}
      </View>
      <Pressable onPress={() => openCatalog({ offerte: '1' })} accessibilityRole="link" style={({ pressed }) => [styles.banner, pressed && { opacity: 0.85 }]}
        accessibilityLabel="Le nostre migliori offerte, sempre aggiornate. Scopri ora">
        <View style={{ flex: 1, justifyContent: 'space-between', paddingVertical: 2 }}>
          <Text style={styles.bannerTitle}>Le nostre migliori offerte, sempre aggiornate</Text>
          <View style={styles.bannerButton}><Text style={styles.bannerButtonText}>Scopri ora</Text><Icon name="chevron" size={14} color="#FFFFFF" strokeWidth={2.6} /></View>
        </View>
        {lead && <View style={styles.bannerArt}>
          <View style={styles.bannerPlate}><ProductImage uri={lead.image} sku={lead.sku} label={lead.name} inset={0.1} /></View>
          {!!leadDiscount && <View style={styles.sticker}><Text style={styles.stickerText}>{leadDiscount.replace('-', '−')}</Text></View>}
        </View>}
      </Pressable>
    </View>

    {offerItems.length > 0 && <>
      {sectionHead(<><View style={styles.percent}><Text style={styles.percentText}>%</Text></View><Text style={styles.sectionTitle} accessibilityRole="header">In offerta</Text></>,
        'Vedi tutte', () => openCatalog({ offerte: '1' }))}
      {rail(offerItems)}
    </>}

    {sectionHead(<Text style={styles.sectionTitle} accessibilityRole="header">In evidenza</Text>, 'Scopri tutto',
      () => featured.data?.picked ? openCatalog({ evidenza: '1' }) : router.push(ALL_PRODUCTS))}
    {featured.error && !featured.data ? <View style={{ paddingHorizontal: 16 }}><Notice tone="error" message="Impossibile caricare i prodotti. Controlla la connessione e riprova." /></View>
      : !featured.data ? <Loading /> : rail(featured.data.items)}

    {!!topCategories.length && <>
      {sectionHead(<Text style={styles.sectionTitle} accessibilityRole="header">Reparti</Text>, 'Tutti', () => router.push(ALL_PRODUCTS))}
      <View style={styles.departments}>{topCategories.map((category) =>
        <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={`Reparto ${category.name}`}
          style={({ pressed }) => [styles.department, pressed && { opacity: 0.7 }]} onPress={() => openCatalog({ category: category.id })}>
          <View style={styles.departmentCircle}>
            {category.image_path
              ? <Image source={{ uri: imageUrl(category.image_path) ?? undefined }} resizeMode="cover" accessibilityIgnoresInvertColors style={StyleSheet.absoluteFill} />
              : <CategoryIcon slug={category.slug} name={category.name} size={30} strokeWidth={1.4} />}
          </View>
          <Text style={styles.departmentText} numberOfLines={1}>{category.name}</Text>
        </Pressable>)}</View>
    </>}

    <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button" style={styles.pickup}>
      <View style={styles.pickupIcon}><Icon name="store" size={22} color={colors.green} strokeWidth={1.9} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pickupTitle}>Ritiro gratuito in negozio</Text>
        <Text style={styles.pickupText}>Ordina online e ritira {atPlace(storeName || 'Arezzo o Lucca')} quando è pronto. Spedizione a casa gratuita da €66 (fino a 10 kg).</Text>
      </View>
    </Pressable>

    <View style={styles.footer}>
      {([['Spedizioni e ritiro', 'shipping'], ['Condizioni di vendita', 'terms'], ['Privacy', 'privacy']] as const).map(([label, doc]) =>
        <Pressable key={doc} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc } })} accessibilityRole="link" hitSlop={6}>
          <Text style={styles.footerLink}>{label}</Text></Pressable>)}
      <Text style={styles.copyright}>© {new Date().getFullYear()} CASA & TE · Pagamenti gestiti da Stripe</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  store: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 30 },
  storeText: { fontSize: 14.5, color: '#FFFFFF', fontFamily: fonts.sansMedium, fontWeight: '500', flexShrink: 1 },
  white: { backgroundColor: '#FFFFFF', paddingTop: 14, paddingBottom: 16, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: colors.line },
  shortcuts: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  shortcut: { alignItems: 'center', gap: 6, minWidth: 72 },
  shortcutIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  shortcutText: { fontSize: 13.5, fontFamily: fonts.sansSemiBold, fontWeight: '600', color: colors.text },
  banner: { flexDirection: 'row', minHeight: 136, borderRadius: 14, backgroundColor: colors.yellow, padding: 16, paddingRight: 10, gap: 8, overflow: 'hidden' },
  bannerTitle: { fontSize: 21, lineHeight: 23, fontFamily: fonts.heavy, fontWeight: '800', color: colors.green, maxWidth: 210 },
  bannerButton: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', height: 34, paddingHorizontal: 15, borderRadius: 17, backgroundColor: colors.green, marginTop: 10 },
  bannerButtonText: { fontSize: 14, fontFamily: fonts.sansBold, fontWeight: '700', color: '#FFFFFF' },
  bannerArt: { width: 112, alignItems: 'center', justifyContent: 'center' },
  bannerPlate: { width: 104, height: 104, borderRadius: 52, backgroundColor: '#FFFFFF', overflow: 'hidden', justifyContent: 'center' },
  sticker: { position: 'absolute', top: -2, right: -4, backgroundColor: colors.sale, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, transform: [{ rotate: '-6deg' }] },
  stickerText: { fontSize: 16, fontFamily: fonts.price, fontWeight: '800', color: '#FFFFFF' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 21, fontFamily: fonts.heavy, fontWeight: '800', color: colors.text },
  percent: { backgroundColor: colors.sale, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 },
  percentText: { fontSize: 15, fontFamily: fonts.heavy, fontWeight: '800', color: '#FFFFFF' },
  link: { fontSize: 14.5, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.green },
  railScroll: { flexGrow: 0 },
  rail: { paddingHorizontal: 16, gap: 10 },
  railItem: { width: 156, flexDirection: 'row' },
  departments: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, rowGap: 14 },
  department: { width: '25%', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  departmentCircle: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  departmentText: { fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: '600', color: colors.text, textAlign: 'center' },
  pickup: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginTop: 24, padding: 14, borderRadius: 12,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  pickupIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  pickupTitle: { fontSize: 15.5, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  pickupText: { fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 2, fontFamily: fonts.sans },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 6, paddingHorizontal: 16, marginTop: 24 },
  footerLink: { fontSize: 13.5, color: colors.muted, fontFamily: fonts.sansMedium, textDecorationLine: 'underline' },
  copyright: { width: '100%', fontSize: 12, color: colors.faint, fontFamily: fonts.sans, marginTop: 4 },
});
