import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { discountLabel, formatEuro } from '@/lib/price';
import type { CatalogProduct } from '@/lib/api';
import { colors, fonts } from '@/config/theme';
import { useCartStore } from '@/store/cart';
import { useFavorites } from '@/store/favorites';
import { ProductImage } from './ProductImage';
import { Icon } from './Icon';
import { atPlace, storeShortName } from './StoreSheet';
import { useLayout, useStores } from '@/lib/hooks';
import { transition, type WebState } from './site/shared';

/** Availability is always about one store; name it so the customer knows which. */
export function stockLabel(stock: number | null, store?: string): { text: string; available: boolean } {
  const at = store ? ` ${atPlace(store)}` : '';
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
    <Icon name="heart" size={size} color={on ? colors.badge : colors.text} fill={on ? colors.badge : undefined} strokeWidth={1.3} />
  </Pressable>;
}

export function ProductCard({ product, variant = 'grid' }: { product: CatalogProduct; variant?: 'grid' | 'list' | 'feature' }) {
  const { wide } = useLayout();
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
    {quantity ? <Text style={styles.addCount}>{quantity}</Text> : <Icon name="cart" size={17} color="#fff" strokeWidth={1.6} />}
  </Pressable>;
  const discount = discountLabel(product.price_cents, product.compare_at_price_cents);
  const price = <View style={styles.priceRow}>
    <Text style={[styles.price, !!discount && { color: colors.sale }]}>{formatEuro(product.price_cents)}</Text>
    {!!discount && <Text style={styles.compare}>{formatEuro(product.compare_at_price_cents as number)}</Text>}
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

  // Desktop: borderless catalogue entry, the photo on a stone plate and the text set below it like print.
  if (wide) {
    const feature = variant === 'feature';
    return <View style={styles.entry}>
      <Link href={`/product/${product.id}`} asChild><Pressable accessibilityLabel={`${product.name}, ${formatEuro(product.price_cents)}`}>
        {({ hovered }: WebState) => <>
          <View style={styles.plate}>
            <View style={[hovered && { transform: [{ scale: 1.035 }] }, transition('transform', 600)]}>
              <ProductImage uri={product.image} sku={product.sku} label={product.name} inset={feature ? 0.1 : 0.09} aspect={feature ? 0.9 : 1.12} blend />
            </View>
            {!!discount && <View style={[styles.discount, feature && styles.discountBig]}>
              <Text style={[styles.discountText, feature && { fontSize: 16 }]} accessibilityLabel={`Sconto ${discount.slice(1)}`}>{discount}</Text></View>}
          </View>
          <View style={styles.entryText}>
            {!!product.brand && <Text style={styles.entryBrand} numberOfLines={1}>{product.brand}</Text>}
            <Text style={[styles.entryName, feature && styles.entryNameBig, hovered && { color: colors.green }, transition('color')]} numberOfLines={2}>{product.name}</Text>
            {!!note && <Text style={[styles.meta, !stock.available && { color: colors.danger }]} numberOfLines={1}>{note}</Text>}
          </View>
        </>}
      </Pressable></Link>
      <FavoriteButton productId={product.id} name={product.name} size={feature ? 22 : 19} style={styles.heartCorner} />
      <View style={styles.entryBottom}>
        <View style={styles.priceRow}>
          <Text style={[styles.price, feature && { fontSize: 26 }, !!discount && { color: colors.sale }]}>{formatEuro(product.price_cents)}</Text>
          {!!discount && <Text style={[styles.compare, feature && { fontSize: 14 }]}>{formatEuro(product.compare_at_price_cents as number)}</Text>}
        </View>
        {cartButton}
      </View>
    </View>;
  }

  // The card is a real link (open in new tab, middle click, screen readers); heart and cart sit outside it.
  return <View style={styles.card}>
    <Link href={`/product/${product.id}`} asChild><Pressable accessibilityLabel={`${product.name}, ${formatEuro(product.price_cents)}`}>
      <View style={styles.media}>
        <ProductImage uri={product.image} sku={product.sku} label={product.name} inset={0.04} aspect={1.2} />
        {!!discount && <View style={styles.discount}><Text style={styles.discountText} accessibilityLabel={`Sconto ${discount.slice(1)}`}>{discount}</Text></View>}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        {!!note && <Text style={[styles.meta, !stock.available && { color: colors.danger }]} numberOfLines={1}>{note}</Text>}
      </View>
    </Pressable></Link>
    <FavoriteButton productId={product.id} name={product.name} size={19} style={styles.heartCorner} />
    <View style={styles.bottom}>{price}{cartButton}</View>
  </View>;
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: '#EEE9E0', overflow: 'hidden' },
  media: { backgroundColor: colors.surface },
  heart: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  heartCorner: { position: 'absolute', top: 4, right: 4 },
  discount: { position: 'absolute', left: 8, top: 8, backgroundColor: colors.sale, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  discountText: { fontSize: 13.5, color: '#fff', fontFamily: fonts.sansSemiBold, fontWeight: '700', letterSpacing: 0.2 },
  body: { paddingHorizontal: 10 },
  name: { fontSize: 15.5, lineHeight: 18, fontFamily: fonts.serif, color: colors.text, minHeight: 36 },
  meta: { fontSize: 11.5, color: colors.muted, marginTop: 3, fontFamily: fonts.sans },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 4, paddingBottom: 8, gap: 6, marginTop: 'auto' },
  priceRow: { flexShrink: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  price: { fontSize: 18.5, fontFamily: fonts.serifMedium, color: colors.text },
  compare: { fontSize: 12, color: colors.muted, textDecorationLine: 'line-through', fontFamily: fonts.sans },
  add: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  addCount: { color: '#fff', fontSize: 15, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  entry: { flex: 1 },
  plate: { backgroundColor: colors.stone, borderRadius: 4, overflow: 'hidden' },
  discountBig: { left: 16, top: 16, paddingHorizontal: 11, paddingVertical: 5 },
  entryText: { paddingTop: 16, gap: 3 },
  entryBrand: { fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted, fontFamily: fonts.sansMedium, fontWeight: '500' },
  entryName: { fontSize: 19, lineHeight: 23, fontFamily: fonts.serif, color: colors.text },
  entryNameBig: { fontSize: 28, lineHeight: 32 },
  entryBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, gap: 8, marginTop: 'auto' },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line, alignItems: 'center' },
  rowLink: { flex: 1, flexDirection: 'row', gap: 14, alignItems: 'center' },
  rowMedia: { width: 88, borderRadius: 10, borderWidth: 1, borderColor: '#EEE9E0', backgroundColor: colors.surface, overflow: 'hidden' },
  rowSide: { alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', gap: 8 },
});
