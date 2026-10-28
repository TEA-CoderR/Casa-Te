import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Link } from 'expo-router';
import { discountLabel, formatEuro, memberPrice, unitPriceLabel } from '@/lib/price';
import { useClubMember } from '@/store/club';
import type { CatalogProduct } from '@/lib/api';
import { colors, fonts } from '@/config/theme';
import { useCartStore } from '@/store/cart';
import { useFavorites } from '@/store/favorites';
import { ProductImage } from './ProductImage';
import { Icon } from './Icon';
import { atPlace, storeShortName } from './StoreSheet';
import { useLayout, useStores } from '@/lib/hooks';
import { transition, type WebState } from './site/shared';
import { PriceTag } from './UI';

/** Availability is always about one store; name it so the customer knows which. */
export function stockLabel(stock: number | null, store?: string): { text: string; available: boolean } {
  const at = store ? ` ${atPlace(store)}` : '';
  if (stock === null) return { text: '', available: true };
  if (stock <= 0) return { text: `Esaurito${at}`, available: false };
  if (stock <= 3) return { text: `Ultimi ${stock}${at}`, available: true };
  return { text: `Disponibile${at}`, available: true };
}

/** Heart toggle for the "Preferiti" list (saved on this device). */
export function FavoriteButton({ productId, name, size = 22, style, strokeWidth = 1.3 }: { productId: string; name: string; size?: number; style?: object; strokeWidth?: number }) {
  const on = useFavorites((s) => s.ids.includes(productId));
  const toggle = useFavorites((s) => s.toggle);
  return <Pressable onPress={() => toggle(productId)} accessibilityRole="button" accessibilityState={{ selected: on }}
    accessibilityLabel={on ? `Rimuovi ${name} dai preferiti` : `Aggiungi ${name} ai preferiti`} hitSlop={6}
    style={({ pressed }) => [styles.heart, style, pressed && { opacity: 0.6 }]}>
    <Icon name="heart" size={size} color={on ? colors.badge : colors.text} fill={on ? colors.badge : undefined} strokeWidth={strokeWidth} />
  </Pressable>;
}

export function ProductCard({ product, variant = 'grid', rail }: { product: CatalogProduct; variant?: 'grid' | 'list' | 'feature';
  /** Home rail card (design F): taller photo area and no heart. */
  rail?: boolean }) {
  const { wide } = useLayout();
  // Club member price: members see it as their price (regular struck through), others get a "Soci" line.
  const club = memberPrice(product);
  const isMember = useClubMember();
  const shown = isMember && club ? { ...product, price_cents: club.cents, compare_at_price_cents: product.price_cents } : product;
  const memberLine = club && !isMember ? <Text style={styles.member} numberOfLines={1}
    accessibilityLabel={`Prezzo Soci ${formatEuro(club.cents)}`}>Soci {formatEuro(club.cents).replace(/€\s/, '€')}</Text> : null;
  const add = useCartStore((s) => s.add);
  const quantity = useCartStore((s) => s.items[product.id] ?? 0);
  const { selected } = useStores();
  const stock = stockLabel(product.stock, storeShortName(selected));
  const canAdd = stock.available && (product.stock === null || quantity < product.stock) && quantity < product.max_per_order;
  // Only scarce or missing stock is worth a line on the card; full availability is the default.
  const note = !stock.available || (product.stock !== null && product.stock <= 3) ? stock.text : '';
  const setQuantity = useCartStore((s) => s.setQuantity);
  const cartButton = <Pressable accessibilityRole="button" disabled={!canAdd} onPress={() => add(product.id)}
    accessibilityLabel={quantity ? `${product.name}: ${quantity} nel carrello, aggiungi un altro` : `Aggiungi ${product.name} al carrello`}
    style={({ pressed }) => [styles.add, !wide && styles.addRound, { opacity: !canAdd ? 0.35 : pressed ? 0.75 : 1 }]}>
    {quantity ? <Text style={styles.addCount}>{quantity}</Text> : wide
      ? <Icon name="cart" size={17} color="#fff" strokeWidth={1.6} />
      : <Icon name="plus" size={18} color="#fff" strokeWidth={2.6} />}
  </Pressable>;
  // Phone (design F): "+" turns into a stepper in place, so the quantity changes without leaving the list.
  const phoneCart = quantity > 0 ? <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.stepper}>
    <Pressable onPress={() => setQuantity(product.id, quantity - 1)} accessibilityRole="button" hitSlop={4}
      accessibilityLabel={`Togli un ${product.name}`} style={styles.stepBtn}><Text style={styles.stepGlyph}>−</Text></Pressable>
    <Text style={styles.stepValue} accessibilityLabel={`${quantity} nel carrello`}>{quantity}</Text>
    <Pressable onPress={() => add(product.id)} disabled={!canAdd} accessibilityRole="button" hitSlop={4}
      accessibilityLabel={`Aggiungi un altro ${product.name}`} style={[styles.stepBtn, !canAdd && { opacity: 0.35 }]}><Text style={styles.stepGlyph}>+</Text></Pressable>
  </Animated.View> : cartButton;
  const discount = discountLabel(shown.price_cents, shown.compare_at_price_cents);
  const unit = unitPriceLabel(shown.price_cents, product.unit_quantity, product.unit);
  // Phone (design F): unit or struck price above the price tag (raised cents), red when discounted.
  const price = <View style={{ flexShrink: 1 }}>
    {(!!discount || !!unit) && <Text style={styles.small} numberOfLines={1}>
      {!!discount && <Text style={styles.compareSmall}>{formatEuro(shown.compare_at_price_cents as number)}</Text>}
      {!!discount && !!unit && ' · '}{unit ?? ''}</Text>}
    <PriceTag cents={shown.price_cents} size={22} sale={!!discount} />
  </View>;

  if (variant === 'list') return <View style={styles.row}>
    <Link href={`/product/${product.id}`} asChild><Pressable style={styles.rowLink} accessibilityLabel={`${product.name}, ${formatEuro(shown.price_cents)}`}>
      <View style={styles.rowMedia}><ProductImage uri={product.image} sku={product.sku} label={product.name} inset={0.08} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        {!!product.brand && <Text style={styles.meta}>{product.brand}</Text>}
        {!!note && <Text style={[styles.meta, !stock.available && { color: colors.danger }]}>{note}</Text>}
        <View style={{ marginTop: 6 }}>{price}</View>
        {memberLine}
      </View>
    </Pressable></Link>
    <View style={styles.rowSide}><FavoriteButton productId={product.id} name={product.name} />{phoneCart}</View>
  </View>;

  // Desktop: borderless catalogue entry, the photo on a stone plate and the text set below it like print.
  if (wide) {
    const feature = variant === 'feature';
    return <View style={styles.entry}>
      <Link href={`/product/${product.id}`} asChild><Pressable accessibilityLabel={`${product.name}, ${formatEuro(shown.price_cents)}`}>
        {({ hovered }: WebState) => <>
          <View style={styles.plate}>
            <View style={[hovered && { transform: [{ scale: 1.035 }] }, transition('transform', 600)]}>
              <ProductImage uri={product.image} sku={product.sku} label={product.name} inset={feature ? 0.1 : 0.09} aspect={feature ? 0.9 : 1.12} blend />
            </View>
            {!!discount && <View style={[styles.discount, styles.discountDesk, feature && styles.discountBig]}>
              <Text style={[styles.discountText, styles.discountTextDesk, feature && { fontSize: 16 }]} accessibilityLabel={`Sconto ${discount.slice(1)}`}>{discount}</Text></View>}
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
          <Text style={[styles.price, feature && { fontSize: 26 }, !!discount && { color: colors.sale }]}>{formatEuro(shown.price_cents)}</Text>
          {!!discount && <Text style={[styles.compare, feature && { fontSize: 14 }]}>{formatEuro(shown.compare_at_price_cents as number)}</Text>}
        </View>
        {cartButton}
      </View>
      {memberLine}
    </View>;
  }

  // Phone (design F): white plate, photo area, name, unit price, then the price tag and "+" (a stepper once in the cart).
  // The card is a real link (open in new tab, middle click, screen readers); heart and cart sit outside it.
  const subline = !stock.available ? stock.text : unit?.replace(/€\s/, '€').replace(/\s\/\s/, '/') ?? (discount ? `Prima ${formatEuro(shown.compare_at_price_cents as number)}` : note);
  return <View style={[styles.card, rail && { paddingBottom: 12 }]}>
    <Link href={`/product/${product.id}`} asChild><Pressable accessibilityLabel={`${product.name}, ${formatEuro(shown.price_cents)}`}>
      <View style={[styles.media, { height: rail ? 136 : 132 }]}>
        <View style={{ width: rail ? 120 : 118, height: rail ? 120 : 118 }}>
          <ProductImage uri={product.image} sku={product.sku} label={product.name} inset={0} />
        </View>
        {!!discount && <View style={[styles.discount, rail ? { left: 4, top: 4 } : { left: 2, top: 2 }]}>
          <Text style={styles.discountText} accessibilityLabel={`Sconto ${discount.slice(1)}`}>{discount.replace('-', '−')}</Text></View>}
      </View>
      <Text style={[styles.name, { marginTop: rail ? 6 : 4 }]} numberOfLines={2}>{product.name}</Text>
      {/* Same line height either way, so the grid stays aligned: the "Soci" price replaces the unit price. */}
      {memberLine && stock.available ? memberLine
        : <Text style={[styles.meta, !stock.available && { color: colors.danger }]} numberOfLines={1}>{subline || ' '}</Text>}
    </Pressable></Link>
    {!rail && <FavoriteButton productId={product.id} name={product.name} size={19} strokeWidth={2} style={styles.heartCorner} />}
    <View style={styles.bottom}><PriceTag cents={shown.price_cents} size={22} sale={!!discount} color={isMember && club ? colors.club : undefined} />{phoneCart}</View>
  </View>;
}

const styles = StyleSheet.create({
  member: { alignSelf: 'flex-start', marginTop: 2, marginLeft: 4, lineHeight: 15, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden',
    backgroundColor: colors.clubFill, color: colors.club, fontSize: 12, fontFamily: fonts.sansBold, fontWeight: '700' },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, padding: 8, paddingBottom: 10,
    borderBottomWidth: 1, borderColor: colors.line },
  media: { backgroundColor: colors.surface, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heart: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  heartCorner: { position: 'absolute', top: 6, right: 6, zIndex: 2 },
  discount: { position: 'absolute', left: 0, top: 0, backgroundColor: colors.sale, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  discountText: { fontSize: 12, color: '#fff', fontFamily: fonts.heavy, fontWeight: '800' },
  name: { fontSize: 13.5, lineHeight: 17, fontFamily: fonts.sansSemiBold, fontWeight: '600', color: colors.text, height: 34, paddingHorizontal: 4 },
  meta: { fontSize: 11.5, lineHeight: 15, color: colors.muted, marginTop: 2, fontFamily: fonts.sans, paddingHorizontal: 4 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6, paddingLeft: 4, height: 40 },
  small: { fontSize: 11.5, color: colors.faint, fontFamily: fonts.sansMedium },
  compareSmall: { textDecorationLine: 'line-through' },
  priceBig: { fontSize: 23, lineHeight: 26, fontFamily: fonts.price, fontWeight: '800', color: colors.text },
  priceRow: { flexShrink: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  price: { fontSize: 18.5, fontFamily: fonts.serifMedium, color: colors.text },
  compare: { fontSize: 12, color: colors.muted, textDecorationLine: 'line-through', fontFamily: fonts.sans },
  add: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  addRound: { width: 40, height: 40, borderRadius: 20 },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 20, backgroundColor: colors.green },
  stepBtn: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: 19, lineHeight: 22, fontFamily: fonts.sansBold, color: '#fff' },
  stepValue: { minWidth: 14, textAlign: 'center', fontSize: 15, fontFamily: fonts.heavy, color: '#fff' },
  addCount: { color: '#fff', fontSize: 15, fontFamily: fonts.sansBold, fontWeight: '700' },
  entry: { flex: 1 },
  plate: { backgroundColor: colors.photo, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: colors.photoLine },
  discountDesk: { left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 3 },
  discountTextDesk: { fontSize: 13.5, fontFamily: fonts.sansSemiBold, fontWeight: '700', letterSpacing: 0.2 },
  discountBig: { left: 16, top: 16, paddingHorizontal: 11, paddingVertical: 5 },
  entryText: { paddingTop: 16, gap: 3 },
  entryBrand: { fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted, fontFamily: fonts.sansMedium, fontWeight: '500' },
  entryName: { fontSize: 19, lineHeight: 23, fontFamily: fonts.serif, color: colors.text },
  entryNameBig: { fontSize: 28, lineHeight: 32 },
  entryBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, gap: 8, marginTop: 'auto' },
  row: { flexDirection: 'row', gap: 12, padding: 10, marginBottom: 8, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center' },
  rowLink: { flex: 1, flexDirection: 'row', gap: 14, alignItems: 'center' },
  rowMedia: { width: 84, borderRadius: 8, backgroundColor: colors.surface, overflow: 'hidden' },
  rowSide: { alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', gap: 8 },
});
