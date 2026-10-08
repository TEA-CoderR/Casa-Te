import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link, useLocalSearchParams, router, Stack } from 'expo-router';
import { formatPackSize, formatWeight, type CategoryRow } from '@casa-te/shared';
import { discountLabel, formatEuro, unitPriceLabel } from '@/lib/price';
import { Screen } from '@/components/Screen';
import { ProductGallery } from '@/components/ProductGallery';
import { FavoriteButton, stockLabel } from '@/components/ProductCard';
import { Icon, type IconName } from '@/components/Icon';
import { EmptyState, Loading, PrimaryButton, QuantityControl } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { fetchCategories, fetchProduct, fetchVariants } from '@/lib/api';
import { Stars } from '@/components/Stars';
import { ProductReviews } from '@/components/ProductReviews';
import { ProductVariants } from '@/components/ProductVariants';
import { invalidate } from '@/lib/useQuery';
import { useLayout, useStores } from '@/lib/hooks';
import { atPlace, StoreSheet, storeShortName } from '@/components/StoreSheet';
import { useQuery } from '@/lib/useQuery';
import { cartItemCount, useCartStore } from '@/store/cart';
import { useFavorites } from '@/store/favorites';
import { BrandHeader, HeaderBack, HeaderButton } from '@/components/BrandHeader';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SITE_WIDTH, type WebState } from '@/components/site/shared';
import { ALL_PRODUCTS } from '@/lib/links';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selected } = useStores();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(0);
  const [storeSheet, setStoreSheet] = useState(false);
  const [shared, setShared] = useState(false);
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const add = useCartStore((s) => s.add);
  const inCart = useCartStore((s) => s.items[id ?? ''] ?? 0);
  const cartCount = cartItemCount(useCartStore((s) => s.items));
  const favorite = useFavorites((s) => s.ids.includes(id ?? ''));
  const toggleFavorite = useFavorites((s) => s.toggle);
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);
  const { data: product, loading, error, refetch } = useQuery(id ? `product:${id}:${selected?.id}` : null, () => fetchProduct(id!, selected?.id ?? null));
  const group = product?.variant_group ?? null;
  const variants = useQuery(group ? `variants:${group}:${selected?.id}` : null, () => fetchVariants(group!, selected?.id ?? null));

  const back = () => router.canGoBack() ? router.back() : router.replace('/');
  const share = async (name: string) => {
    const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : undefined;
    try {
      const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { share?: unknown } : null;
      if (Platform.OS === 'web' && nav && !nav.share && url) {
        await nav.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2500); return;
      }
      await Share.share({ title: name, message: url ? `${name} · CASA & TE\n${url}` : `${name} · CASA & TE`, url });
    } catch { /* dismissed */ }
  };

  const plainHeader = wide ? undefined : <BrandHeader title="Prodotto" left={<HeaderBack onPress={back} />} />;
  if (loading && !product) return <Screen stack header={plainHeader}><Stack.Screen options={{ headerShown: wide }} /><Loading /></Screen>;
  if (!product) return <Screen stack header={plainHeader}><Stack.Screen options={{ headerShown: wide }} /><EmptyState title={error ? 'Connessione assente' : 'Prodotto non trovato'}
    message={error ? 'Controlla la rete e riprova.' : 'Scopri gli altri prodotti del catalogo.'} icon="search">
    <PrimaryButton title="Vai al catalogo" onPress={() => router.replace(ALL_PRODUCTS)} />
  </EmptyState></Screen>;

  const stock = stockLabel(product.stock, storeShortName(selected));
  const maxQty = Math.max(1, Math.min(product.max_per_order, (product.stock ?? 99) - inCart));
  const canAdd = stock.available && (product.stock === null || inCart + quantity <= product.stock);
  const addToCart = () => { add(product.id, quantity); setAdded(quantity); setQuantity(1); };

  // One buy box, placed beside the image on desktop and in a sticky footer on phones.
  const buy = <View style={{ gap: 10 }}>
    {added > 0 && <View style={styles.added} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Icon name="check" size={18} color={colors.greenDark} />
      <Text style={styles.addedText}>{added === 1 ? 'Aggiunto' : `${added} pezzi aggiunti`} al carrello</Text>
      <Link href="/cart" style={styles.addedLink}>Vai al carrello</Link>
    </View>}
    <View style={styles.buyRow}>
      {canAdd && <QuantityControl value={quantity} onChange={setQuantity} min={1} max={maxQty} label={product.name} />}
      <View style={{ flex: 1 }}>
        <PrimaryButton title={canAdd ? 'Aggiungi al carrello' : 'Non disponibile in questo negozio'} disabled={!canAdd} onPress={addToCart}
          icon={canAdd && !wide ? 'cart' : null} />
      </View>
    </View>
  </View>;

  const caption = inCart ? `Già ${inCart} nel carrello` : product.stock !== null && product.stock < product.max_per_order ? `${product.stock} disponibili` : '';
  const store = storeShortName(selected) || 'negozio';
  const discount = discountLabel(product.price_cents, product.compare_at_price_cents);
  const unitPrice = unitPriceLabel(product.price_cents, product.unit_quantity, product.unit);
  const pack = formatPackSize(product.unit_quantity, product.unit);
  const features: Array<{ icon: IconName; text: string }> = product.highlights.length
    ? product.highlights.map((h) => ({ icon: h.icon as IconName, text: h.label }))
    : [{ icon: 'store', text: `Ritiro gratuito\n${atPlace(store)}` }, { icon: 'truck', text: 'Spedizione gratis\nda €66' },
       { icon: 'shield', text: 'Pagamento\nsicuro' }, { icon: 'weight', text: `Peso\n${formatWeight(product.weight_g)}` }];
  const details = <>
    {!!product.brand && <Text style={styles.brand}>{product.brand}</Text>}
    <Text style={[styles.title, wide && styles.titleWide]} accessibilityRole="header">{product.name}</Text>
    <View style={styles.priceRow}>
      <Text style={[styles.price, wide && { fontSize: 36 }, !!discount && { color: colors.sale }]}>{formatEuro(product.price_cents)}</Text>
      {!!product.compare_at_price_cents && <Text style={styles.compare}>{formatEuro(product.compare_at_price_cents)}</Text>}
      {!!discount && <View style={styles.discount}><Text style={styles.discountText}>{discount}</Text></View>}
      {unitPrice ? <Text style={styles.vat}>{unitPrice}{pack ? ` · ${pack}` : ''}</Text> : <Text style={styles.vat}>IVA inclusa</Text>}
    </View>
    {(!wide || !!product.rating_count) && <View style={styles.ratingRow} accessibilityLabel={product.rating_count ? `Valutazione ${product.rating_avg} su 5, ${product.rating_count} recensioni` : 'Nessuna recensione'}>
      <Stars value={product.rating_avg ?? 0} size={15} />
      <Text style={styles.ratingText}>{product.rating_count ? `(${product.rating_count})` : 'Nessuna recensione'}</Text>
    </View>}
    <Pressable style={styles.availability} onPress={() => setStoreSheet(true)} accessibilityRole="button"
      accessibilityLabel={`${stock.text}. Cambia negozio`}>
      <View style={[styles.dot, !stock.available && { backgroundColor: colors.danger }]} />
      <Text style={[styles.availabilityText, !stock.available && { color: colors.danger }]}>{stock.text}{caption ? ` · ${caption}` : ''}</Text>
      <Text style={styles.change}>Cambia</Text>
    </Pressable>
    <View style={styles.features}>
      {features.map((f) => <View key={f.icon + f.text} style={styles.feature}><Icon name={f.icon} size={23} color={colors.text} strokeWidth={1.15} />
        <Text style={[styles.featureText, wide && styles.featureTextWide]}>{f.text}</Text></View>)}
    </View>
    {!!product.description && <Text style={styles.description}>{product.description}</Text>}
    {!!variants.data && <ProductVariants title={product.variant_title} current={product.id} variants={variants.data} />}
    {wide && <View style={{ marginTop: 24 }}>{buy}</View>}
    <Text style={styles.sku}>Codice articolo {product.sku}{product.color ? ` · Colore ${product.color}` : ''} · IVA inclusa</Text>
    <ProductReviews productId={product.id} average={product.rating_avg} count={product.rating_count}
      onChanged={() => { void refetch(); invalidate('featured'); }} />
  </>;

  const actions = <>
    {wide ? <View /> : <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Indietro" style={[styles.round, styles.roundLeft]}>
      <Icon name="back" size={22} strokeWidth={1.5} /></Pressable>}
    <View style={styles.roundRight}>
      <FavoriteButton productId={product.id} name={product.name} size={20} style={styles.round} />
      <Pressable onPress={() => share(product.name)} accessibilityRole="button" accessibilityLabel={`Condividi ${product.name}`} style={[styles.round, !wide && styles.roundBare]}>
        <Icon name="share" size={21} strokeWidth={1.4} /></Pressable>
    </View>
  </>;
  const sharedNote = shared && <View style={styles.toast} accessibilityLiveRegion="polite"><Text style={styles.toastText}>Link copiato</Text></View>;

  const crumb = (label: string, onPress?: () => void) => onPress
    ? <Pressable onPress={onPress} accessibilityRole="link">{({ hovered }: WebState) =>
        <Text style={[styles.crumb, hovered && { color: colors.green }]}>{label}</Text>}</Pressable>
    : <Text style={[styles.crumb, { color: colors.text }]} numberOfLines={1}>{label}</Text>;
  // Phone (design D): green band with the department, white blocks on the light ground, sticky buy bar.
  if (!wide) {
    const department = categories.data?.find((c) => c.id === product.category_id);
    const header = <BrandHeader title={department?.name ?? 'Prodotto'} left={<HeaderBack onPress={back} />}
      right={<View style={{ flexDirection: 'row', gap: 6 }}>
        <HeaderButton icon="heart" label={favorite ? `Rimuovi ${product.name} dai preferiti` : `Aggiungi ${product.name} ai preferiti`}
          filled={favorite} onPress={() => toggleFavorite(product.id)} />
        <HeaderButton icon="share" label={`Condividi ${product.name}`} onPress={() => share(product.name)} />
        <HeaderButton icon="cart" label={cartCount ? `Carrello, ${cartCount} articoli` : 'Carrello'} count={cartCount} onPress={() => router.push('/cart')} />
      </View>} />;
    return <Screen stack header={header} ground={colors.page} footer={buy} contentContainerStyle={{ padding: 0, paddingBottom: 24 }}>
      <Stack.Screen options={{ title: product.name, headerShown: false }} />
      <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
      <View style={styles.phoneMedia}>
        <ProductGallery images={product.images} sku={product.sku} label={product.name} inset={0.1} blend />
        {!!discount && <View style={styles.phoneBadge}><Text style={styles.phoneBadgeText}>{discount.replace('-', '−')}</Text></View>}
      </View>
      <View style={styles.phoneInfo}>
        {!!product.brand && <Text style={styles.phoneBrand}>{product.brand}</Text>}
        <Text style={styles.phoneTitle} accessibilityRole="header">{product.name}</Text>
        <View style={styles.ratingRow} accessibilityLabel={product.rating_count ? `Valutazione ${product.rating_avg} su 5, ${product.rating_count} recensioni` : 'Nessuna recensione'}>
          <Stars value={product.rating_avg ?? 0} size={14} />
          <Text style={styles.ratingText}>{product.rating_count ? `(${product.rating_count})` : 'Nessuna recensione'}</Text>
        </View>
        <View style={styles.phonePriceRow}>
          <View style={[styles.phonePriceTag, !discount && { backgroundColor: 'transparent', paddingHorizontal: 0 }]}>
            <Text style={[styles.phonePrice, !discount && { color: colors.text }]}>{formatEuro(product.price_cents)}</Text></View>
          <View style={{ gap: 2, paddingBottom: 2, flexShrink: 1 }}>
            {!!discount && <Text style={styles.phonePrior}>Prima <Text style={{ textDecorationLine: 'line-through' }}>{formatEuro(product.compare_at_price_cents as number)}</Text></Text>}
            <Text style={styles.phoneUnit}>{unitPrice ? `${unitPrice}${pack ? ` · ${pack}` : ''}` : 'IVA inclusa'}</Text>
          </View>
        </View>
      </View>
      <Pressable style={styles.phoneCard} onPress={() => setStoreSheet(true)} accessibilityRole="button" accessibilityLabel={`${stock.text}. Cambia negozio`}>
        <View style={[styles.phoneCircle, !stock.available && { backgroundColor: '#F8E9E7' }]}>
          <Icon name="store" size={19} color={stock.available ? colors.green : colors.danger} strokeWidth={2} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.phoneCardTitle, !stock.available && { color: colors.danger }]}>{stock.text || 'Scegli il negozio'}</Text>
          <Text style={styles.phoneCardText}>{['Ritiro gratuito', caption].filter(Boolean).join(' · ')}</Text>
        </View>
        <Text style={styles.phoneLink}>Cambia</Text>
      </Pressable>
      <View style={styles.phoneFeatures}>
        {features.map((f, i) => <View key={f.icon + f.text} style={styles.phoneFeature}>
          <View style={[styles.phoneCircle, { width: 34, height: 34 }, i === 0 && !!discount && f.icon === 'star' && { backgroundColor: '#FDECEC' }]}>
            <Icon name={f.icon} size={18} color={colors.green} strokeWidth={1.9} /></View>
          <Text style={styles.phoneFeatureText} numberOfLines={3}>{f.text}</Text>
        </View>)}
      </View>
      <View style={styles.phoneMore}>
        {!!product.description && <Text style={styles.description}>{product.description}</Text>}
        {!!variants.data && <ProductVariants title={product.variant_title} current={product.id} variants={variants.data} />}
        <Text style={[styles.sku, !product.description && !variants.data && { marginTop: 0 }]}>Codice articolo {product.sku}{product.color ? ` · Colore ${product.color}` : ''} · IVA inclusa</Text>
        <ProductReviews productId={product.id} average={product.rating_avg} count={product.rating_count}
          onChanged={() => { void refetch(); invalidate('featured'); }} />
      </View>
      {sharedNote}
    </Screen>;
  }

  return <Screen stack footer={wide ? undefined : buy} maxWidth={wide ? SITE_WIDTH - 80 : undefined}
    contentContainerStyle={wide ? { paddingHorizontal: 40, paddingTop: 0 } : undefined} after={wide ? <SiteFooter /> : undefined} bleed={40}>
    <Stack.Screen options={wide ? { title: product.name, headerShown: true, header: () => <SiteHeader /> } : { title: '', headerShown: false }} />
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    {wide && <View style={styles.crumbs}>
      {crumb('Home', () => router.push('/'))}<Text style={styles.crumbSep}>/</Text>
      {crumb('Catalogo', () => router.push(ALL_PRODUCTS))}<Text style={styles.crumbSep}>/</Text>
      {crumb(product.name)}
    </View>}
    {wide ? <View style={styles.wide}>
      <View style={[styles.media, styles.mediaWide]}>
        <ProductGallery images={product.images} sku={product.sku} label={product.name} blend />
        <View style={[styles.overlay, { top: 12 }]}>{actions}</View>
      </View>
      <View style={{ flex: 1, maxWidth: 500, paddingTop: 8 }}>{details}</View>
    </View> : <>
      <View style={[styles.media, { paddingTop: insets.top + 8 }]}>
        <ProductGallery images={product.images} sku={product.sku} label={product.name} inset={0.12} blend />
        <View style={[styles.overlay, { top: insets.top + 12 }]}>{actions}</View>
      </View>
      {details}
    </>}
    {sharedNote}
  </Screen>;
}

const styles = StyleSheet.create({
  wide: { flexDirection: 'row', gap: 72, alignItems: 'flex-start', paddingTop: 8 },
  crumbs: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 28, paddingBottom: 24 },
  crumb: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans },
  crumbSep: { fontSize: 13, color: colors.rule, fontFamily: fonts.sans },
  titleWide: { fontSize: 48, lineHeight: 52, letterSpacing: -0.8 },
  phoneMedia: { backgroundColor: colors.photo, borderBottomWidth: 1, borderColor: colors.line },
  phoneBadge: { position: 'absolute', left: 14, top: 14, backgroundColor: colors.sale, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  phoneBadgeText: { fontSize: 21, fontFamily: fonts.price, fontWeight: '800', color: '#FFFFFF' },
  phoneInfo: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 16, borderBottomWidth: 1, borderColor: colors.line },
  phoneBrand: { fontSize: 12.5, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.brand, fontFamily: fonts.sansBold, fontWeight: '700' },
  phoneTitle: { fontSize: 23, lineHeight: 27, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text, marginTop: 4 },
  phonePriceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 12 },
  phonePriceTag: { backgroundColor: colors.yellow, borderRadius: 8, paddingHorizontal: 12, paddingTop: 2, paddingBottom: 4 },
  phonePrice: { fontSize: 40, lineHeight: 44, fontFamily: fonts.price, fontWeight: '800', color: colors.sale },
  phonePrior: { fontSize: 15, fontFamily: fonts.sansMedium, color: colors.faint },
  phoneUnit: { fontSize: 13, fontFamily: fonts.sansMedium, color: colors.muted },
  phoneCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginTop: 10, padding: 12, borderRadius: 12,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  phoneCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  phoneCardTitle: { fontSize: 15, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.green },
  phoneCardText: { fontSize: 13, fontFamily: fonts.sans, color: colors.muted, marginTop: 1 },
  phoneLink: { fontSize: 14, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.green },
  phoneFeatures: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 10 },
  phoneFeature: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  phoneFeatureText: { fontSize: 12, lineHeight: 15, textAlign: 'center', fontFamily: fonts.sansSemiBold, fontWeight: '600', color: colors.text },
  phoneMore: { marginHorizontal: 12, marginTop: 10, padding: 14, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  media: { backgroundColor: colors.photo, marginHorizontal: -20, marginTop: -20, marginBottom: 22, borderBottomWidth: 1, borderColor: colors.photoLine },
  overlay: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3A2E1A', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  roundBare: { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  roundLeft: { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  roundRight: { flexDirection: 'row', gap: 6 },
  toast: { position: 'absolute', alignSelf: 'center', top: 80, backgroundColor: colors.text, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  toastText: { color: '#fff', fontSize: 13, fontFamily: fonts.sansMedium },
  mediaWide: { flex: 1.25, marginHorizontal: 0, marginTop: 0, marginBottom: 0, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.photo, borderWidth: 1, borderColor: colors.photoLine },
  brand: { fontSize: 11, letterSpacing: 2.6, textTransform: 'uppercase', color: colors.text, fontFamily: fonts.sansSemiBold, fontWeight: '600', marginBottom: 6 },
  title: { fontSize: 30, lineHeight: 33, fontFamily: fonts.serif, color: colors.text, letterSpacing: -0.2 },
  discount: { alignSelf: 'center', backgroundColor: colors.sale, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3 },
  discountText: { fontSize: 15, color: '#fff', fontFamily: fonts.sansSemiBold, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 10 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  ratingText: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans },
  price: { fontSize: 31, fontFamily: fonts.serifMedium, color: colors.text },
  compare: { fontSize: 15, color: colors.muted, textDecorationLine: 'line-through', fontFamily: fonts.sans },
  vat: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans },
  availability: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40, marginTop: 6, flexWrap: 'wrap' },
  availabilityText: { fontSize: 13, color: colors.green, fontFamily: fonts.sansMedium, fontWeight: '500' },
  change: { fontSize: 13, color: colors.text, textDecorationLine: 'underline', fontFamily: fonts.sans },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  features: { flexDirection: 'row', marginTop: 14, paddingVertical: 16, borderTopWidth: 1, borderColor: '#EEE9E0' },
  feature: { flex: 1, alignItems: 'center', gap: 7, paddingHorizontal: 3 },
  featureTextWide: { fontSize: 13, lineHeight: 17, color: colors.text },
  featureText: { fontSize: 11, lineHeight: 14, color: colors.muted, textAlign: 'center', fontFamily: fonts.sans },
  description: { fontSize: 13.5, lineHeight: 21, color: colors.muted, marginTop: 6, maxWidth: 560, fontFamily: fonts.sans },
  buyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sku: { fontSize: 12, color: colors.muted, marginTop: 22, fontFamily: fonts.sans },
  added: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8EFE6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  addedText: { flex: 1, fontSize: 14, color: colors.greenDark, fontFamily: fonts.sansMedium, fontWeight: '500' },
  addedLink: { fontSize: 14, color: colors.greenDark, fontFamily: fonts.sansSemiBold, fontWeight: '600', textDecorationLine: 'underline' },
});
