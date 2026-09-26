import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Product } from '@/types/product';
import { colors } from '@/config/theme';
import { useCartStore } from '@/store/cart';
import { ProductVisual } from './ProductVisual';
import { Icon } from './Icon';
export function ProductCard({ product }: { product: Product }) {
  const add = useCartStore((s) => s.add);
  const quantity = useCartStore((s) => s.items[product.id] ?? 0);
  return <Pressable style={styles.card} onPress={() => router.push(`/product/${product.id}`)} accessibilityRole="link">
    <View style={styles.media}>
      <ProductVisual id={product.id} label={product.name} />
      <View style={styles.badge}><Text style={styles.badgeText}>DEMO</Text></View>
    </View>
    <Text style={styles.category}>{product.category}</Text>
    <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
    <View style={styles.bottom}>
      <View><Text style={styles.price}>€{product.price.toFixed(2).replace('.', ',')}</Text>
        <Text style={styles.stock}>{product.available ? 'Disponibile · demo' : 'Esaurito'}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Aggiungi ${product.name}`} disabled={!product.available}
        onPress={(event) => { event.stopPropagation(); add(product.id); }}
        style={({ pressed }) => [styles.add, quantity > 0 && { backgroundColor: colors.green }, { opacity: pressed || !product.available ? 0.5 : 1 }]}>
        {quantity ? <Text style={{ color: '#fff', fontWeight: '600' }}>{quantity}</Text> : <Icon name="plus" size={20} color={colors.green} />}
      </Pressable>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { flex: 1 },
  media: { backgroundColor: '#F0F0EA', borderRadius: 18, overflow: 'hidden' },
  badge: { position: 'absolute', left: 10, top: 10, backgroundColor: '#FFFFFFC9', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3 },
  badgeText: { fontSize: 8, letterSpacing: 1, color: '#73786F' },
  category: { color: colors.muted, fontSize: 10, marginTop: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  name: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text, minHeight: 40, marginTop: 4 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  price: { fontSize: 19, fontWeight: '600', color: colors.text, letterSpacing: -0.5 },
  stock: { fontSize: 9, color: colors.muted, marginTop: 3 },
  add: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF0E4', alignItems: 'center', justifyContent: 'center' },
});

