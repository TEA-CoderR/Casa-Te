import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useLocalSearchParams, router, Stack } from 'expo-router';
import { formatEuro, formatWeight } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductImage } from '@/components/ProductImage';
import { stockLabel } from '@/components/ProductCard';
import { Icon } from '@/components/Icon';
import { EmptyState, Loading, PrimaryButton, QuantityControl } from '@/components/UI';
import { colors } from '@/config/theme';
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
    <PrimaryButton title={canAdd ? `Aggiungi al carrello · ${formatEuro(product.price_cents * quantity)}` : 'Non disponibile in questo negozio'}
      icon="bag" disabled={!canAdd} onPress={addToCart} />
  </View>;

  const details = <>
    <View style={styles.categoryRow}>
      {!!product.brand && <Text style={styles.category}>{product.brand}</Text>}
      <Pressable style={styles.availability} onPress={() => setStoreSheet(true)} accessibilityRole="button"
        accessibilityLabel={`${stock.text}. Cambia negozio`}>
        <View style={[styles.dot, !stock.available && { backgroundColor: colors.danger }]} />
        <Text style={[styles.availabilityText, !stock.available && { color: colors.danger }]}>{stock.text}</Text>
        <Text style={styles.change}>Cambia</Text>
      </Pressable>
    </View>
    <Text style={styles.title} accessibilityRole="header">{product.name}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
      <Text style={styles.price}>{formatEuro(product.price_cents)}</Text>
      {!!product.compare_at_price_cents && <Text style={styles.compare}>{formatEuro(product.compare_at_price_cents)}</Text>}
    </View>
    <Text style={styles.vat}>IVA inclusa</Text>
    {!!product.description && <Text style={styles.description}>{product.description}</Text>}
    <View style={styles.quantityRow}><View><Text style={styles.label}>Quantità</Text>
      <Text style={styles.caption}>{inCart ? `Già ${inCart} nel carrello` : product.stock !== null && product.stock < product.max_per_order ? `${product.stock} disponibili` : ''}</Text></View>
      <QuantityControl value={quantity} onChange={setQuantity} min={1} max={maxQty} label={product.name} /></View>
    {wide && buy}
    <View style={styles.infoRow}><Icon name="truck" color={colors.green} size={21} />
      <Text style={styles.info}>Spedizione gratuita da €66 fino a 10 kg · questo articolo pesa {formatWeight(product.weight_g)}</Text></View>
    <View style={styles.infoRow}><Icon name="store" color={colors.green} size={21} />
      <Text style={styles.info}>Ritiro gratuito a {storeShortName(selected) || 'negozio'}, quando l'ordine è pronto</Text></View>
    <Text style={styles.sku}>Codice articolo {product.sku}</Text>
  </>;

  return <Screen stack footer={wide ? undefined : buy}>
    <Stack.Screen options={{ title: '' }} />
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    {wide ? <View style={styles.wide}>
      <View style={[styles.media, { flex: 1.1, maxWidth: undefined }]}><ProductImage uri={product.image} sku={product.sku} label={product.name} inset={0.1} /></View>
      <View style={{ flex: 1, maxWidth: 460 }}>{details}</View>
    </View> : <>
      <View style={styles.media}><ProductImage uri={product.image} sku={product.sku} label={product.name} inset={0.1} /></View>
      {details}
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  wide: { flexDirection: 'row', gap: 48, alignItems: 'flex-start', paddingTop: 8 },
  media: { backgroundColor: '#EEEFE8', borderRadius: 24, overflow: 'hidden', maxWidth: 560, width: '100%', alignSelf: 'center' },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, gap: 8, flexWrap: 'wrap' },
  category: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  availability: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minHeight: 36 },
  availabilityText: { fontSize: 13, color: colors.green, fontWeight: '500' },
  change: { fontSize: 13, color: colors.green, textDecorationLine: 'underline', fontWeight: '600' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.8, fontWeight: '600', color: colors.text, marginTop: 8 },
  price: { fontSize: 30, fontWeight: '600', letterSpacing: -0.8, color: colors.green, marginTop: 12 },
  compare: { fontSize: 17, color: colors.muted, textDecorationLine: 'line-through' },
  vat: { fontSize: 12, color: colors.muted, marginTop: 2 },
  description: { fontSize: 15, lineHeight: 23, color: colors.text, marginTop: 16, maxWidth: 560 },
  quantityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderColor: colors.line, marginBottom: 14 },
  label: { fontSize: 15, fontWeight: '500', color: colors.text },
  caption: { fontSize: 12, color: colors.muted, marginTop: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  info: { fontSize: 13, lineHeight: 19, color: colors.muted, flex: 1 },
  sku: { fontSize: 12, color: colors.muted, marginTop: 14 },
  added: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E5F2DC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  addedText: { flex: 1, fontSize: 14, color: colors.greenDark, fontWeight: '500' },
  addedLink: { fontSize: 14, color: colors.greenDark, fontWeight: '700', textDecorationLine: 'underline' },
});
