import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Product } from '@/types/product';
import { colors, control, radius, spacing, typeScale } from '@/config/theme';
import { useCartStore } from '@/store/cart';
import { ProductVisual } from './ProductVisual';
import { Icon } from './Icon';

export function ProductCard({ product, imageAspectRatio = 1 }: {
  product: Product;
  imageAspectRatio?: number;
}) {
  const add = useCartStore((s) => s.add);
  const quantity = useCartStore((s) => s.items[product.id] ?? 0);
  const price = `€${product.price.toFixed(2).replace('.', ',')}`;
  return <View style={styles.card}>
    <Pressable accessibilityRole="link" accessibilityLabel={`${product.name}, ${price}`}
      onPress={() => router.push(`/product/${product.id}`)} style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}>
      <View style={styles.media}>
        <ProductVisual id={product.id} label={product.name} aspectRatio={imageAspectRatio} />
      </View>
      <Text style={styles.category} numberOfLines={1}>{product.category}</Text>
      <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
    </Pressable>
    <View style={styles.bottom}>
      <View style={styles.priceBlock}>
        <Text style={styles.price}>{price}</Text>
        <Text style={[styles.availability, !product.available && styles.unavailable]}>
          {product.available ? 'Disponibile · demo' : 'Esaurito'}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={quantity > 0
          ? `${product.name}: ${quantity} nel carrello. Aggiungi un altro` : `Aggiungi ${product.name}`}
        accessibilityState={{ disabled: !product.available }} accessibilityLiveRegion="polite"
        disabled={!product.available} onPress={() => add(product.id)}
        style={({ pressed }) => [styles.add, quantity > 0 && styles.added,
          { opacity: pressed || !product.available ? 0.65 : 1 }]}>
        {quantity > 0 ? <Text style={styles.quantity}>{quantity}</Text>
          : <Icon name="plus" size={21} color={colors.green} />}
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0 },
  media: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, overflow: 'hidden' },
  category: { color: colors.muted, fontSize: typeScale.caption, marginTop: spacing.xs },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '500', color: colors.text,
    minHeight: 40, marginTop: spacing.xxs },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.xs, marginTop: spacing.xs },
  priceBlock: { flex: 1, minWidth: 0 },
  price: { fontSize: typeScale.price, lineHeight: 27, fontWeight: '700', color: colors.greenDark },
  availability: { fontSize: typeScale.caption, lineHeight: 17, color: colors.muted, marginTop: 2 },
  unavailable: { color: colors.danger },
  add: { width: control.minHeight, height: control.minHeight, flexShrink: 0, borderRadius: radius.md,
    backgroundColor: '#EAF0E4', alignItems: 'center', justifyContent: 'center' },
  added: { backgroundColor: colors.green },
  quantity: { color: colors.surface, fontSize: typeScale.body, fontWeight: '700' },
});
