import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Link } from 'expo-router';
import { discountLabel, formatEuro, unitPriceLabel } from '@/lib/price';
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
import { useShownProduct } from '@/store/club';

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

export function ProductCard({ product: raw, variant = 'grid', rail }: { product: CatalogProduct; variant?: 'grid' | 'list' | 'feature';
  /** Home rail card (design F): taller photo area and no heart. */
  rail?: boolean }) {
  const { wide } = useLayout();
  // The big price is what this customer pays (member price only for Club members).
  const product = useShownProduct(raw);
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
  const discount = discountLabel(product.price_cents, product.compare_at_price_cents);
  const unit = unitPriceLabel(product.price_cents, product.unit_quantity, product.unit);
  // Club member price: applied for members (marked "Prezzo Soci"); for everyone else a separate "Soci €x" line.
  const soci = product.memberApplied;
  const sociOffer = !!product.clubPrice && !product.memberApplied;
  const sociPct = product.clubPrice ? discountLabel(product.clubPrice.cents, raw.price_cents) : null;
  const sociCents = product.clubPrice?.cents ?? 0;
  const badge = discount ? `${soci ? 'Soci ' : ''}${discount.replace('-', '−')}` : sociOffer && sociPct ? `Soci ${sociPct.replace('-', '−')}` : '';
  const sociOfferText = sociOffer ? `Soci ${formatEuro(sociCents).replace(/€\s/, '€')}` : '';
  // Phone (design F): unit or struck price above the price tag (raised cents), red when discounted.
  const price = <View style={{ flexShrink: 1 }}>
    {(!!discount || !!unit) && <Text style={styles.small} numberOfLines={1}>
      {!!discount && <Text style={styles.compareSmall}>{formatEuro(product.compare_at_price_cents as number)}</Text>}
      {!!discount && !!unit && ' · '}{unit ?? ''}</Text>}
    <PriceTag cents={product.price_cents} size={22} sale={!!discount} />
    {soci && <Text style={styles.soci} numberOfLines={1}>Prezzo Soci</Text>}
    {sociOffer && <Text style={[styles.soci, styles.sociOffer]} numberOfLines={1}>{sociOfferText}</Text>}
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
    <View style={styles.rowSide}><FavoriteButton productId={product.id} name={product.name} />{phoneCart}</View>
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
            {!!badge && <View style={[styles.discount, styles.discountDesk, feature && styles.discountBig]}>
              <Text style={[styles.discountText, styles.discountTextDesk, feature && { fontSize: 16 }]} accessibilityLabel={badge.startsWith('Soci') ? `Prezzo Soci, ${badge.slice(5)}` : `Sconto ${badge}`}>{badge}</Text></View>}
          </View>
          <View style={styles.entryText}>
            {!!product.brand && <Text style={styles.entryBrand} numberOfLines={1}>{product.brand}</Text>}
            <Text style={[styles.entryName, feature && styles.entryNameBig, hovered && { color: colors.green }, transition('color')]} numberOfLines={2}>{product.name}</Text>
            {!!note && <Text style={[styles.meta, !stock.available && { color: colors.danger }]} numberOfLines={1}>{note}</Text>}
            {soci && <Text style={[styles.meta, styles.soci]} numberOfLines={1}>Prezzo Soci · applicato al tuo account</Text>}
            {sociOffer && <Text style={[styles.meta, styles.soci, styles.sociOffer]} numberOfLines={1}>{sociOfferText} · con il Club gratuito</Text>}
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

  // Phone, design "Editoriale": no card. The picture on the studio ground, the brand in small capitals, the name, then
  // the price in plain figures and a thin square "+" (a stepper once in the cart). The card is a real link; heart and cart
  // sit outside it. Offers: the price in red with the regular one struck after it, the rate on the picture.
  const unitShort = unit?.replace(/€\s/, '€').replace(/\s\/\s/, '/');
  const phoneBadge = discount ? discount.replace('-', '−') : sociOffer && sociPct ? sociPct.replace('-', '−') : '';
  const shown = sociOffer ? sociCents : product.price_cents;
  const struck = discount ? product.compare_at_price_cents as number : sociOffer ? product.price_cents : null;
  const line = !stock.available ? stock.text : soci || sociOffer ? 'Prezzo Soci' : unitShort ?? note;
  const feature = variant === 'feature';
  const tileCart = quantity > 0 ? <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.tileStepper}>
    <Pressable onPress={() => setQuantity(product.id, quantity - 1)} accessibilityRole="button" hitSlop={4}
      accessibilityLabel={`Togli un ${product.name}`} style={styles.tileStep}><Text style={styles.tileGlyph}>−</Text></Pressable>
    <Text style={styles.tileCount} accessibilityLabel={`${quantity} nel carrello`}>{quantity}</Text>
    <Pressable onPress={() => add(product.id)} disabled={!canAdd} accessibilityRole="button" hitSlop={4}
      accessibilityLabel={`Aggiungi un altro ${product.name}`} style={[styles.tileStep, !canAdd && { opacity: 0.35 }]}><Text style={styles.tileGlyph}>+</Text></Pressable>
  </Animated.View> : <Pressable accessibilityRole="button" disabled={!canAdd} onPress={() => add(product.id)} hitSlop={6}
    accessibilityLabel={`Aggiungi ${product.name} al carrello`}
    style={({ pressed }) => [styles.tileAdd, { opacity: !canAdd ? 0.35 : pressed ? 0.6 : 1 }]}>
    <Icon name="plus" size={16} color={colors.text} strokeWidth={1.6} />
  </Pressable>;
  return <View style={styles.tile}>
    <Link href={`/product/${product.id}`} asChild><Pressable accessibilityLabel={`${product.name}, ${formatEuro(shown)}`} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      <View style={styles.tileMedia}>
        <ProductImage uri={product.image} sku={product.sku} label={product.name} inset={feature ? 0.14 : 0.12} aspect={feature ? 0.86 : 1} blend backdrop={colors.well} />
        {!!phoneBadge && <Text style={styles.tileBadge} accessibilityLabel={`Sconto ${phoneBadge}`}>{phoneBadge}</Text>}
      </View>
      <Text style={styles.tileBrand} numberOfLines={1}>{(product.brand ?? '').toUpperCase() || ' '}</Text>
      <Text style={[styles.tileName, feature && styles.tileNameBig]} numberOfLines={2}>{product.name}</Text>
    </Pressable></Link>
    {!rail && <FavoriteButton productId={product.id} name={product.name} size={18} strokeWidth={1.5} style={styles.tileHeart} />}
    <View style={styles.tileBottom}>
      <View style={{ flexShrink: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <Text style={[styles.tilePrice, feature && { fontSize: 17 }, struck !== null && { color: colors.sale }]}>{formatEuro(shown)}</Text>
          {struck !== null && <Text style={styles.tileStruck}>{formatEuro(struck)}</Text>}
        </View>
        <Text style={[styles.tileLine, !stock.available && { color: colors.danger }, (soci || sociOffer) && { color: colors.sale }]} numberOfLines={1}>{line || ' '}</Text>
      </View>
      {tileCart}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  tile: { flex: 1 },
  tileMedia: { backgroundColor: colors.well, borderRadius: 2, overflow: 'hidden' },
  tileBadge: { position: 'absolute', left: 10, top: 10, fontSize: 12, fontFamily: fonts.sansSemiBold, color: colors.sale, letterSpacing: 0.3 },
  tileHeart: { position: 'absolute', top: 2, right: 2, zIndex: 2 },
  tileBrand: { fontSize: 10.5, letterSpacing: 1.2, fontFamily: fonts.label, color: colors.muted, marginTop: 10 },
  tileName: { fontSize: 13.5, lineHeight: 18, height: 36, fontFamily: fonts.sans, color: colors.text, marginTop: 3 },
  tileNameBig: { fontSize: 15, lineHeight: 20, height: 40 },
  tileBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, marginTop: 6 },
  tilePrice: { fontSize: 15.5, fontFamily: fonts.sansMedium, color: colors.text, letterSpacing: -0.1 },
  tileStruck: { fontSize: 12.5, fontFamily: fonts.sans, color: colors.muted, textDecorationLine: 'line-through' },
  tileLine: { fontSize: 11.5, lineHeight: 15, fontFamily: fonts.sans, color: colors.muted, marginTop: 1 },
  tileAdd: { width: 34, height: 34, borderWidth: 1, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  tileStepper: { flexDirection: 'row', alignItems: 'center', height: 34, borderWidth: 1, borderColor: colors.text },
  tileStep: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  tileGlyph: { fontSize: 17, lineHeight: 20, fontFamily: fonts.sans, color: colors.text },
  tileCount: { minWidth: 14, textAlign: 'center', fontSize: 14, fontFamily: fonts.sansSemiBold, color: colors.text },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, padding: 8, paddingBottom: 10,
    borderWidth: 1, borderColor: colors.line },
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
  soci: { color: colors.sale, fontFamily: fonts.sansBold, fontWeight: '700' },
  sociOffer: { fontFamily: fonts.heavy, fontWeight: '800' },
  sociPct: { fontFamily: fonts.sansBold, fontWeight: '700' },
  priceBig: { fontSize: 23, lineHeight: 26, fontFamily: fonts.price, fontWeight: '800', color: colors.text },
  priceRow: { flexShrink: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  price: { fontSize: 18.5, fontFamily: fonts.serifMedium, color: colors.text },
  compare: { fontSize: 12, color: colors.muted, textDecorationLine: 'line-through', fontFamily: fonts.sans },
  add: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center' },
  addRound: { width: 40, height: 40, borderRadius: 20 },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 20, backgroundColor: colors.action },
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
  row: { flexDirection: 'row', gap: 12, padding: 10, marginBottom: 8, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  rowLink: { flex: 1, flexDirection: 'row', gap: 14, alignItems: 'center' },
  rowMedia: { width: 84, borderRadius: 8, backgroundColor: colors.surface, overflow: 'hidden' },
  rowSide: { alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', gap: 8 },
});
