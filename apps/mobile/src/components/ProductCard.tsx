import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { formatEuro } from '@casa-te/shared';
import type { CatalogProduct } from '@/lib/api';
import { colors, fonts } from '@/config/theme';
import { useCartStore } from '@/store/cart';
import { useFavorites } from '@/store/favorites';
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

/** Heart toggle for the "Preferiti" list (saved on this device). */
export function FavoriteButton({ productId, name, size = 22, style }: { productId: string; name: string; size?: number; style?: object }) {
  const on = useFavorites((s) => s.ids.includes(productId));
  const toggle = useFavorites((s) => s.toggle);
  return <Pressable onPress={() => toggle(productId)} accessibilityRole="button" accessibilityState={{ selected: on }}
    accessibilityLabel={on ? `Rimuovi ${name} dai preferiti` : `Aggiungi ${name} ai preferiti`} hitSlop={6}
    style={({ pressed }) => [styles.heart, style, pressed && { opacity: 0.6 }]}>
    <Icon name="heart" size={size} color={on ? colors.badge : colors.text} fill={on ? colors.badge : undefined} strokeWidth={1.5} />
  </Pressable>;
}

export function ProductCard({ product, variant = 'grid' }: { product: CatalogProduct; variant?: 'grid' | 'list' }) {
  const add = useCartStore((s) => s.add);
  const quantity = useCartStore((s) => s.items[product.id] ?? 0);
  const { selected } = useStores();
  const stock = stockLabel(product.stock, storeShortName(selected));
  const canAdd = stock.available && (product.stock === null || quantity < product.stock) && quantity < product.max_per_order;
  // Only scarce or missing stock is worth a line on the card; full availability is the default.
  const note = !stock.available || (product.stock !== null && product.stock <= 3) ? stock.text : '';
  const cartButton = <Pressable accessibilityRole="button" disabled={!canAdd} onPress={() => add(product.id)}
    accessibilityLabel={quantity ? `${product.name}: ${quantity} nel carrello, aggiungi un altro` : `Aggiungi ${product.name} al carrello`}
    style={({ pressed }) => [styles.add, { opacity: !canAdd ? 0.35 : pressed ? 0.75 : 1 }]}>
    {quantity ? <Text style={styles.addCount}>{quantity}</Text> : <Icon name="cart" size={19} color="#fff" strokeWidth={1.7} />}
  </Pressable>;
  const price = <View style={styles.priceRow}>
    <Text style={styles.price}>{formatEuro(product.price_cents)}</Text>
    {!!product.compare_at_price_cents && <Text style={styles.compare}>{formatEuro(product.compare_at_price_cents)}</Text>}
  </View>;

  if (variant === 'list') return <View style={styles.row}>
    <Link href={`/product/${product.id}`} asChild><Pressable style={styles.rowLink} accessibilityLabel={`${product.name}, ${formatEuro(product.price_cents)}`}>
      <View style={styles.rowMedia}><ProductImage uri={product.image} sku={product.sku} label={product.name} inset={0.08} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        {!!product.brand && <Text style={styles.meta}>{product.brand}</Text>}
        {!!note && <Text style={[styles.meta, !stock.available && { color: colors.danger }]}>{note}</Text>}
        <View style={{ marginTop: 6 }}>{price}</View>
      </View>
    </Pressable></Link>
    <View style={styles.rowSide}><FavoriteButton productId={product.id} name={product.name} />{cartButton}</View>
  </View>;

  // The card is a real link (open in new tab, middle click, screen readers); heart and cart sit outside it.
  return <View style={styles.card}>
    <Link href={`/product/${product.id}`} asChild><Pressable accessibilityLabel={`${product.name}, ${formatEuro(product.price_cents)}`}>
      <View style={styles.media}>
        <ProductImage uri={product.image} sku={product.sku} label={product.name} inset={0.06} aspect={1.55} />
        {!!product.compare_at_price_cents && <View style={styles.badge}><Text style={styles.badgeText}>Offerta</Text></View>}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        {!!note && <Text style={[styles.meta, !stock.available && { color: colors.danger }]} numberOfLines={1}>{note}</Text>}
      </View>
    </Pressable></Link>
    <FavoriteButton productId={product.id} name={product.name} size={20} style={styles.heartCorner} />
    <View style={styles.bottom}>{price}{cartButton}</View>
  </View>;
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  media: { backgroundColor: colors.surface },
  heart: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  heartCorner: { position: 'absolute', top: 4, right: 4 },
  badge: { position: 'absolute', left: 10, top: 10, backgroundColor: colors.green, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 11, color: '#fff', fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  body: { paddingHorizontal: 10 },
  name: { fontSize: 14, lineHeight: 17, fontFamily: fonts.serif, color: colors.text, minHeight: 34 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 3, fontFamily: fonts.sans },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 4, paddingBottom: 8, gap: 6, marginTop: 'auto' },
  priceRow: { flexShrink: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  price: { fontSize: 18, fontFamily: fonts.serif, color: colors.text },
  compare: { fontSize: 13, color: colors.muted, textDecorationLine: 'line-through', fontFamily: fonts.sans },
  add: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  addCount: { color: '#fff', fontSize: 15, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line, alignItems: 'center' },
  rowLink: { flex: 1, flexDirection: 'row', gap: 14, alignItems: 'center' },
  rowMedia: { width: 92, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: 'hidden' },
  rowSide: { alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', gap: 8 },
});
