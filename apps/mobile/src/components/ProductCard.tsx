import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatEuro } from '@casa-te/shared';
import type { CatalogProduct } from '@/lib/api';
import { colors } from '@/config/theme';
import { useCartStore } from '@/store/cart';
import { ProductImage } from './ProductImage';
import { Icon } from './Icon';

export function stockLabel(stock: number | null): { text: string; available: boolean } {
  if (stock === null) return { text: '', available: true };
  if (stock <= 0) return { text: 'Esaurito in questo negozio', available: false };
  if (stock <= 3) return { text: `Ultimi ${stock} pezzi`, available: true };
  return { text: 'Disponibile', available: true };
}

export function ProductCard({ product, categoryName }: { product: CatalogProduct; categoryName?: string }) {
  const add = useCartStore((s) => s.add);
  const quantity = useCartStore((s) => s.items[product.id] ?? 0);
  const stock = stockLabel(product.stock);
  const canAdd = stock.available && (product.stock === null || quantity < product.stock) && quantity < product.max_per_order;
  return <Pressable style={styles.card} onPress={() => router.push(`/product/${product.id}`)} accessibilityRole="link">
    <View style={styles.media}>
      <ProductImage uri={product.image} sku={product.sku} label={product.name} />
      {!!product.compare_at_price_cents && <View style={styles.badge}><Text style={styles.badgeText}>OFFERTA</Text></View>}
    </View>
    {!!categoryName && <Text style={styles.category}>{categoryName}</Text>}
    <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
    <View style={styles.bottom}>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.price}>{formatEuro(product.price_cents)}</Text>
        {product.compare_at_price_cents
          ? <Text style={styles.compare}>{formatEuro(product.compare_at_price_cents)}</Text>
          : <Text style={[styles.stock, !stock.available && { color: colors.danger }]}>{stock.text}</Text>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Aggiungi ${product.name}`} disabled={!canAdd}
        onPress={(event) => { event.stopPropagation(); add(product.id); }}
        style={({ pressed }) => [styles.add, quantity > 0 && { backgroundColor: colors.green }, { opacity: pressed || !canAdd ? 0.5 : 1 }]}>
        {quantity ? <Text style={{ color: '#fff', fontWeight: '600' }}>{quantity}</Text> : <Icon name="plus" size={20} color={colors.green} />}
      </Pressable>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { flex: 1 },
  media: { backgroundColor: '#F0F0EA', borderRadius: 18, overflow: 'hidden' },
  badge: { position: 'absolute', left: 10, top: 10, backgroundColor: colors.lime, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  badgeText: { fontSize: 8, letterSpacing: 1, color: colors.greenDark, fontWeight: '700' },
  category: { color: colors.muted, fontSize: 10, marginTop: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  name: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text, minHeight: 40, marginTop: 6 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7, gap: 6 },
  price: { fontSize: 19, fontWeight: '600', color: colors.text, letterSpacing: -0.5 },
  compare: { fontSize: 11, color: colors.muted, textDecorationLine: 'line-through', marginTop: 2 },
  stock: { fontSize: 9, color: colors.muted, marginTop: 3 },
  add: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF0E4', alignItems: 'center', justifyContent: 'center' },
});
