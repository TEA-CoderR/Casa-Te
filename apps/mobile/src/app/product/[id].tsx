import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link, useLocalSearchParams, router, Stack } from 'expo-router';
import { formatEuro, formatPackSize, formatWeight, unitPriceLabel } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductGallery } from '@/components/ProductGallery';
import { FavoriteButton, stockLabel } from '@/components/ProductCard';
import { Icon, type IconName } from '@/components/Icon';
import { EmptyState, Loading, PrimaryButton, QuantityControl } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { fetchProduct, fetchVariants } from '@/lib/api';
import { Stars } from '@/components/Stars';
import { ProductReviews } from '@/components/ProductReviews';
import { ProductVariants } from '@/components/ProductVariants';
import { invalidate } from '@/lib/useQuery';
import { useLayout, useStores } from '@/lib/hooks';
import { StoreSheet, storeShortName } from '@/components/StoreSheet';
import { useQuery } from '@/lib/useQuery';
import { useCartStore } from '@/store/cart';

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

  if (loading && !product) return <Screen stack><Stack.Screen options={{ headerShown: true }} /><Loading /></Screen>;
  if (!product) return <Screen stack><Stack.Screen options={{ headerShown: true }} /><EmptyState title={error ? 'Connessione assente' : 'Prodotto non trovato'}
    message={error ? 'Controlla la rete e riprova.' : 'Scopri gli altri prodotti del catalogo.'} icon="search">
    <PrimaryButton title="Vai al catalogo" onPress={() => router.replace('/catalog')} />
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
        <PrimaryButton title={canAdd ? 'Aggiungi al carrello' : 'Non disponibile in questo negozio'} disabled={!canAdd} onPress={addToCart} />
      </View>
    </View>
  </View>;

  const caption = inCart ? `Già ${inCart} nel carrello` : product.stock !== null && product.stock < product.max_per_order ? `${product.stock} disponibili` : '';
  const store = storeShortName(selected) || 'negozio';
  const unitPrice = unitPriceLabel(product.price_cents, product.unit_quantity, product.unit);
  const pack = formatPackSize(product.unit_quantity, product.unit);
  const features: Array<{ icon: IconName; text: string }> = product.highlights.length
    ? product.highlights.map((h) => ({ icon: h.icon as IconName, text: h.label }))
    : [{ icon: 'store', text: `Ritiro gratuito\na ${store}` }, { icon: 'truck', text: 'Spedizione gratis\nda €66' },
       { icon: 'shield', text: 'Pagamento\nsicuro' }, { icon: 'weight', text: `Peso\n${formatWeight(product.weight_g)}` }];
  const details = <>
    {!!product.brand && <Text style={styles.brand}>{product.brand}</Text>}
    <Text style={styles.title} accessibilityRole="header">{product.name}</Text>
    <View style={styles.priceRow}>
      <Text style={styles.price}>{formatEuro(product.price_cents)}</Text>
      {!!product.compare_at_price_cents && <Text style={styles.compare}>{formatEuro(product.compare_at_price_cents)}</Text>}
      {unitPrice ? <Text style={styles.vat}>{unitPrice}{pack ? ` · ${pack}` : ''}</Text> : <Text style={styles.vat}>IVA inclusa</Text>}
    </View>
    <View style={styles.ratingRow} accessibilityLabel={product.rating_count ? `Valutazione ${product.rating_avg} su 5, ${product.rating_count} recensioni` : 'Nessuna recensione'}>
      <Stars value={product.rating_avg ?? 0} size={18} />
      <Text style={styles.ratingText}>{product.rating_count ? `(${product.rating_count})` : 'Nessuna recensione'}</Text>
    </View>
    <Pressable style={styles.availability} onPress={() => setStoreSheet(true)} accessibilityRole="button"
      accessibilityLabel={`${stock.text}. Cambia negozio`}>
      <View style={[styles.dot, !stock.available && { backgroundColor: colors.danger }]} />
      <Text style={[styles.availabilityText, !stock.available && { color: colors.danger }]}>{stock.text}{caption ? ` · ${caption}` : ''}</Text>
      <Text style={styles.change}>Cambia</Text>
    </Pressable>
    <View style={styles.features}>
      {features.map((f) => <View key={f.icon + f.text} style={styles.feature}><Icon name={f.icon} size={24} color={colors.text} strokeWidth={1.3} />
        <Text style={styles.featureText}>{f.text}</Text></View>)}
    </View>
    {!!product.description && <Text style={styles.description}>{product.description}</Text>}
    {!!variants.data && <ProductVariants title={product.variant_title} current={product.id} variants={variants.data} />}
    {wide && <View style={{ marginTop: 24 }}>{buy}</View>}
    <Text style={styles.sku}>Codice articolo {product.sku}{product.color ? ` · Colore ${product.color}` : ''} · IVA inclusa</Text>
    <ProductReviews productId={product.id} average={product.rating_avg} count={product.rating_count}
      onChanged={() => { void refetch(); invalidate('featured'); }} />
  </>;

  const actions = <>
    <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Indietro" style={[styles.round, styles.roundLeft]}>
      <Icon name="back" size={22} strokeWidth={1.7} /></Pressable>
    <View style={styles.roundRight}>
      <FavoriteButton productId={product.id} name={product.name} size={21} style={styles.round} />
      <Pressable onPress={() => share(product.name)} accessibilityRole="button" accessibilityLabel={`Condividi ${product.name}`} style={styles.round}>
        <Icon name="share" size={20} strokeWidth={1.6} /></Pressable>
    </View>
  </>;
  const sharedNote = shared && <View style={styles.toast} accessibilityLiveRegion="polite"><Text style={styles.toastText}>Link copiato</Text></View>;

  return <Screen stack footer={wide ? undefined : buy}>
    <Stack.Screen options={{ title: '', headerShown: false }} />
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    {wide ? <View style={[styles.wide, { paddingTop: 16 + insets.top }]}>
      <View style={[styles.media, styles.mediaWide]}>
        <ProductGallery images={product.images} sku={product.sku} label={product.name} />
        <View style={[styles.overlay, { top: 12 }]}>{actions}</View>
      </View>
      <View style={{ flex: 1, maxWidth: 460 }}>{details}</View>
    </View> : <>
      <View style={[styles.media, { paddingTop: insets.top + 8 }]}>
        <ProductGallery images={product.images} sku={product.sku} label={product.name} />
        <View style={[styles.overlay, { top: insets.top + 12 }]}>{actions}</View>
      </View>
      {details}
    </>}
    {sharedNote}
  </Screen>;
}

const styles = StyleSheet.create({
  wide: { flexDirection: 'row', gap: 56, alignItems: 'flex-start', paddingTop: 8 },
  media: { backgroundColor: colors.surface, marginHorizontal: -20, marginTop: -20, marginBottom: 20 },
  overlay: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  roundLeft: { borderWidth: 0, backgroundColor: 'transparent' },
  roundRight: { flexDirection: 'row', gap: 10 },
  toast: { position: 'absolute', alignSelf: 'center', top: 80, backgroundColor: colors.text, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  toastText: { color: '#fff', fontSize: 13, fontFamily: fonts.sansMedium },
  mediaWide: { flex: 1.1, marginHorizontal: 0, marginTop: 0, marginBottom: 0, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  brand: { fontSize: 12, letterSpacing: 2.4, textTransform: 'uppercase', color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500', marginBottom: 8 },
  title: { fontSize: 29, lineHeight: 36, fontFamily: fonts.serif, color: colors.text },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 10 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  ratingText: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans },
  price: { fontSize: 32, fontFamily: fonts.serif, color: colors.text },
  compare: { fontSize: 17, color: colors.muted, textDecorationLine: 'line-through', fontFamily: fonts.sans },
  vat: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans },
  availability: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40, marginTop: 6, flexWrap: 'wrap' },
  availabilityText: { fontSize: 14, color: colors.green, fontFamily: fonts.sansMedium, fontWeight: '500' },
  change: { fontSize: 14, color: colors.text, textDecorationLine: 'underline', fontFamily: fonts.sans },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  features: { flexDirection: 'row', marginTop: 18, paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  feature: { flex: 1, alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  featureText: { fontSize: 12, lineHeight: 16, color: colors.muted, textAlign: 'center', fontFamily: fonts.sans },
  description: { fontSize: 15, lineHeight: 24, color: colors.muted, marginTop: 18, maxWidth: 560, fontFamily: fonts.sans },
  buyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sku: { fontSize: 12, color: colors.muted, marginTop: 22, fontFamily: fonts.sans },
  added: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8EFE6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  addedText: { flex: 1, fontSize: 14, color: colors.greenDark, fontFamily: fonts.sansMedium, fontWeight: '500' },
  addedLink: { fontSize: 14, color: colors.greenDark, fontFamily: fonts.sansSemiBold, fontWeight: '600', textDecorationLine: 'underline' },
});
