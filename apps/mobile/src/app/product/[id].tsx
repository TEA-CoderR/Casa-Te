import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { formatEuro, formatWeight } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductImage } from '@/components/ProductImage';
import { stockLabel } from '@/components/ProductCard';
import { Icon } from '@/components/Icon';
import { EmptyState, Loading, PrimaryButton, QuantityControl } from '@/components/UI';
import { colors } from '@/config/theme';
import { fetchProduct } from '@/lib/api';
import { useStores } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';
import { useCartStore } from '@/store/cart';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selected } = useStores();
  const [quantity, setQuantity] = useState(1);
  const add = useCartStore((s) => s.add);
  const inCart = useCartStore((s) => s.items[id ?? ''] ?? 0);
  const { data: product, loading, error } = useQuery(id ? `product:${id}:${selected?.id}` : null, () => fetchProduct(id!, selected?.id ?? null));

  if (loading && !product) return <Screen stack><Loading /></Screen>;
  if (!product) return <Screen stack><EmptyState title={error ? 'Connessione assente' : 'Prodotto non trovato'}
    message={error ? 'Controlla la rete e riprova.' : 'Scopri gli altri prodotti del catalogo.'} icon="search">
    <PrimaryButton title="Vai al catalogo" onPress={() => router.replace('/catalog')} />
  </EmptyState></Screen>;

  const stock = stockLabel(product.stock);
  const maxQty = Math.max(1, Math.min(product.max_per_order, (product.stock ?? 99) - inCart));
  const canAdd = stock.available && (product.stock === null || inCart + quantity <= product.stock);

  return <Screen stack footer={<View style={styles.footer}>
    <View><Text style={styles.totalLabel}>Totale · {quantity} pz</Text>
      <Text style={styles.total}>{formatEuro(product.price_cents * quantity)}</Text></View>
    <View style={{ flex: 1 }}><PrimaryButton title={canAdd ? 'Aggiungi al carrello' : 'Non disponibile'} icon="bag" disabled={!canAdd}
      onPress={() => { add(product.id, quantity); router.push('/cart'); }} /></View>
  </View>}>
    <Stack.Screen options={{ title: product.name }} />
    <View style={styles.media}><ProductImage uri={product.image} sku={product.sku} label={product.name} inset={0.1} /></View>
    <View style={styles.categoryRow}>
      <Text style={styles.category}>{product.brand ?? ''}</Text>
      <View style={styles.availability}><View style={[styles.dot, !stock.available && { backgroundColor: colors.danger }]} />
        <Text style={[styles.availabilityText, !stock.available && { color: colors.danger }]}>
          {stock.text}{selected ? ` · ${selected.name.replace(/^CASA & TE\s*/, '')}` : ''}</Text></View>
    </View>
    <Text style={styles.title}>{product.name}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
      <Text style={styles.price}>{formatEuro(product.price_cents)}</Text>
      {!!product.compare_at_price_cents && <Text style={styles.compare}>{formatEuro(product.compare_at_price_cents)}</Text>}
    </View>
    <Text style={styles.vat}>IVA inclusa</Text>
    {!!product.description && <Text style={styles.description}>{product.description}</Text>}
    <View style={styles.quantityRow}><View><Text style={styles.label}>Quantità</Text>
      <Text style={styles.caption}>{inCart ? `Già ${inCart} nel carrello` : 'Scegli ciò che ti serve'}</Text></View>
      <QuantityControl value={quantity} onChange={setQuantity} min={1} max={maxQty} /></View>
    <View style={styles.infoRow}><Icon name="weight" color={colors.green} size={21} />
      <Text style={styles.info}>Peso: {formatWeight(product.weight_g)}</Text></View>
    <View style={styles.infoRow}><Icon name="store" color={colors.green} size={21} />
      <Text style={styles.info}>Ritiro in negozio sempre gratuito</Text></View>
    <View style={styles.infoRow}><Icon name="truck" color={colors.green} size={21} />
      <Text style={styles.info}>Spedizione gratuita da €66, fino a 10 kg</Text></View>
    <View style={styles.infoRow}><Icon name="shield" color={colors.green} size={21} />
      <Text style={styles.info}>Pagamento sicuro · Reso entro 14 giorni</Text></View>
    <Text style={styles.sku}>Cod. {product.sku}</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  media: { backgroundColor: '#EEEFE8', borderRadius: 24, overflow: 'hidden', maxWidth: 560, width: '100%', alignSelf: 'center' },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, gap: 8 },
  category: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.muted },
  availability: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  availabilityText: { fontSize: 11, color: colors.green },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  title: { fontSize: 27, lineHeight: 34, letterSpacing: -0.8, fontWeight: '600', color: colors.text, marginTop: 10 },
  price: { fontSize: 28, fontWeight: '600', letterSpacing: -0.8, color: colors.green, marginTop: 13 },
  compare: { fontSize: 16, color: colors.muted, textDecorationLine: 'line-through' },
  vat: { fontSize: 11, color: colors.muted, marginTop: 2 },
  description: { fontSize: 14, lineHeight: 22, color: colors.muted, marginTop: 14 },
  quantityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 23, borderBottomWidth: 1, borderColor: colors.line, marginBottom: 12 },
  label: { fontSize: 15, fontWeight: '500', color: colors.text },
  caption: { fontSize: 11, color: colors.muted, marginTop: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  info: { fontSize: 12, color: colors.muted, flex: 1 },
  sku: { fontSize: 10, color: colors.muted, marginTop: 16 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  totalLabel: { fontSize: 10, color: colors.muted },
  total: { fontSize: 22, fontWeight: '600', marginTop: 3, color: colors.text },
});
