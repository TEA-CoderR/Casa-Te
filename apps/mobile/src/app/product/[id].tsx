import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useLocalSearchParams, router, Stack } from 'expo-router';
import { formatEuro, formatWeight } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductImage } from '@/components/ProductImage';
import { stockLabel } from '@/components/ProductCard';
import { Icon } from '@/components/Icon';
import { EmptyState, Loading, PrimaryButton, QuantityControl } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { fetchProduct } from '@/lib/api';
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
  const { wide } = useLayout();
  const add = useCartStore((s) => s.add);
  const inCart = useCartStore((s) => s.items[id ?? ''] ?? 0);
  const { data: product, loading, error } = useQuery(id ? `product:${id}:${selected?.id}` : null, () => fetchProduct(id!, selected?.id ?? null));

  if (loading && !product) return <Screen stack><Loading /></Screen>;
  if (!product) return <Screen stack><EmptyState title={error ? 'Connessione assente' : 'Prodotto non trovato'}
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
  const details = <>
    {!!product.brand && <Text style={styles.brand}>{product.brand}</Text>}
    <Text style={styles.title} accessibilityRole="header">{product.name}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
      <Text style={styles.price}>{formatEuro(product.price_cents)}</Text>
      {!!product.compare_at_price_cents && <Text style={styles.compare}>{formatEuro(product.compare_at_price_cents)}</Text>}
      <Text style={styles.vat}>IVA inclusa</Text>
    </View>
    <Pressable style={styles.availability} onPress={() => setStoreSheet(true)} accessibilityRole="button"
      accessibilityLabel={`${stock.text}. Cambia negozio`}>
      <View style={[styles.dot, !stock.available && { backgroundColor: colors.danger }]} />
      <Text style={[styles.availabilityText, !stock.available && { color: colors.danger }]}>{stock.text}{caption ? ` · ${caption}` : ''}</Text>
      <Text style={styles.change}>Cambia</Text>
    </Pressable>
    <View style={styles.features}>
      {([['store', `Ritiro gratuito\na ${store}`], ['truck', 'Spedizione gratis\nda €66 · max 10 kg'], ['shield', 'Pagamento\nsicuro']] as const).map(([icon, text]) =>
        <View key={icon} style={styles.feature}><Icon name={icon} size={24} color={colors.text} strokeWidth={1.3} />
          <Text style={styles.featureText}>{text}</Text></View>)}
    </View>
    {!!product.description && <Text style={styles.description}>{product.description}</Text>}
    {wide && <View style={{ marginTop: 24 }}>{buy}</View>}
    <Text style={styles.sku}>Peso {formatWeight(product.weight_g)} · Codice articolo {product.sku}</Text>
  </>;

  return <Screen stack footer={wide ? undefined : buy}>
    <Stack.Screen options={{ title: '' }} />
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    {wide ? <View style={styles.wide}>
      <View style={[styles.media, styles.mediaWide]}><ProductImage uri={product.image} sku={product.sku} label={product.name} inset={0.1} /></View>
      <View style={{ flex: 1, maxWidth: 460 }}>{details}</View>
    </View> : <>
      <View style={styles.media}><ProductImage uri={product.image} sku={product.sku} label={product.name} inset={0.1} /></View>
      {details}
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  wide: { flexDirection: 'row', gap: 56, alignItems: 'flex-start', paddingTop: 8 },
  media: { backgroundColor: colors.surface, marginHorizontal: -20, marginTop: -20, marginBottom: 22, borderBottomWidth: 1, borderColor: colors.line },
  mediaWide: { flex: 1.1, marginHorizontal: 0, marginTop: 0, marginBottom: 0, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  brand: { fontSize: 12, letterSpacing: 2.4, textTransform: 'uppercase', color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500', marginBottom: 8 },
  title: { fontSize: 29, lineHeight: 36, fontFamily: fonts.serif, color: colors.text },
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
