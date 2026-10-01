import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { formatEuro } from '@casa-te/shared';
import type { CatalogProduct } from '@/lib/api';
import { cardShadow, colors, fonts } from '@/config/theme';
import { useCartStore } from '@/store/cart';
import { ProductImage } from './ProductImage';
import { Icon } from './Icon';
import { storeShortName } from './StoreSheet';
import { useStores } from '@/lib/hooks';

/** Availability is always about one store; name it so the customer knows which. */
export function stockLabel(stock: number | null, store?: string): { text: string; available: boolean } {
  const at = store ? ` a ${store}` : '';
  if (stock === null) return { text: '', available: true };
  if (stock <= 0) return { text: `Esaurito${at}`, available: false };
  if (stock <= 3) return { text: `Ultimi ${stock}${at}`, available: true };
  return { text: `Disponibile${at}`, available: true };
}

export function ProductCard({ product, categoryName }: { product: CatalogProduct; categoryName?: string }) {
  const add = useCartStore((s) => s.add);
  const quantity = useCartStore((s) => s.items[product.id] ?? 0);
  const { selected } = useStores();
  const stock = stockLabel(product.stock, storeShortName(selected));
  const canAdd = stock.available && (product.stock === null || quantity < product.stock) && quantity < product.max_per_order;
  // The card is a real link (open in new tab, middle click, screen readers); the add button sits outside it.
  return <View style={styles.card}>
    <Link href={`/product/${product.id}`} asChild><Pressable accessibilityLabel={`${product.name}, ${formatEuro(product.price_cents)}`}>
      <View style={styles.media}>
        <ProductImage uri={product.image} sku={product.sku} label={product.name} />
        {!!product.compare_at_price_cents && <View style={styles.badge}><Text style={styles.badgeText}>Offerta</Text></View>}
      </View>
      <View style={styles.body}>
        {!!categoryName && <Text style={styles.category}>{categoryName}</Text>}
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        {!!stock.text && <Text style={[styles.stock, !stock.available && { color: colors.danger }]} numberOfLines={1}>{stock.text}</Text>}
      </View>
    </Pressable></Link>
    <View style={styles.bottom}>
      <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <Text style={styles.price}>{formatEuro(product.price_cents)}</Text>
        {!!product.compare_at_price_cents && <Text style={styles.compare}>{formatEuro(product.compare_at_price_cents)}</Text>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={quantity ? `${product.name}: ${quantity} nel carrello, aggiungi un altro` : `Aggiungi ${product.name} al carrello`} disabled={!canAdd}
        onPress={() => add(product.id)}
        style={({ pressed }) => [styles.add, { opacity: !canAdd ? 0.35 : pressed ? 0.75 : 1 }]}>
        {quantity ? <Text style={styles.addCount}>{quantity}</Text> : <Icon name="cart" size={19} color="#fff" strokeWidth={1.7} />}
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...cardShadow },
  media: { backgroundColor: colors.surface },
  badge: { position: 'absolute', left: 10, top: 10, backgroundColor: colors.green, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 11, color: '#fff', fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  body: { paddingHorizontal: 12 },
  category: { color: colors.muted, fontSize: 12, fontFamily: fonts.sans },
  name: { fontSize: 15, lineHeight: 20, fontFamily: fonts.serif, color: colors.text, minHeight: 40, marginTop: 3 },
  stock: { fontSize: 12, color: colors.muted, marginTop: 4, fontFamily: fonts.sans },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, gap: 6, marginTop: 'auto' },
  price: { fontSize: 19, fontFamily: fonts.serif, color: colors.text },
  compare: { fontSize: 13, color: colors.muted, textDecorationLine: 'line-through', fontFamily: fonts.sans },
  add: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  addCount: { color: '#fff', fontSize: 15, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
});
