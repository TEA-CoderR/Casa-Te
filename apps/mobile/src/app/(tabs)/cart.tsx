import { useState } from 'react';
import { EmptyReceipt } from '@/components/ShopMarks';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandHeader, HeaderBack, StatusBand } from '@/components/BrandHeader';
import { StoreCard } from '@/components/StoreCard';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { brandMonogramGreen, MONOGRAM_ASPECT } from '@/config/brand';
import { router } from 'expo-router';
import { FREE_SHIPPING_MAX_WEIGHT_G, FULFILMENT_LABELS, formatPackSize, formatWeight, freeShippingRemainingCents, type QuoteLine } from '@casa-te/shared';
import { formatEuro, formatShipping } from '@/lib/price';
import { FulfilmentSheet } from '@/components/FulfilmentSheet';
import { usePreferences } from '@/store/preferences';
import { useQuery } from '@/lib/useQuery';
import { Screen } from '@/components/Screen';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState, Loading, Notice, PageTitle, PrimaryButton, QuantityControl, SummaryRow } from '@/components/UI';
import { atPlace, StoreSheet, storeShortName } from '@/components/StoreSheet';
import { Icon } from '@/components/Icon';
import { colors, floatShadow, fonts } from '@/config/theme';
import { fetchCartSuggestions, fetchProducts, imageUrl } from '@/lib/api';
import { ProductCard } from '@/components/ProductCard';
import { useCartQuote, useClubSettings, useDelivery, useLayout } from '@/lib/hooks';
import { cartItemCount, useCartStore } from '@/store/cart';
import { useUser } from '@/store/session';
import { ALL_PRODUCTS } from '@/lib/links';

const ISSUE_TEXT: Record<NonNullable<QuoteLine['issue']>, string> = {
  unavailable: 'Non più disponibile',
  invalid_quantity: 'Quantità non consentita',
  insufficient_stock: 'Quantità non disponibile in questo negozio',
};

export default function CartScreen() {
  const { enabled: clubOn, tagline: clubTagline } = useClubSettings();
  const items = useCartStore((s) => s.items);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);
  const add = useCartStore((s) => s.add);
  const fulfilment = usePreferences((s) => s.fulfilment);
  useDelivery();
  const [removed, setRemoved] = useState<{ id: string; name: string; qty: number } | null>(null);
  const [storeSheet, setStoreSheet] = useState(false);
  const [deliverySheet, setDeliverySheet] = useState(false);
  // Lines and totals for the chosen delivery, all computed by quote_cart.
  const { quote, error, loading, store, empty, refresh } = useCartQuote({ fulfilment });
  const ids = Object.keys(items).sort();
  const details = useQuery(ids.length ? `cart-details:${store?.id}:${ids.join(',')}` : null,
    () => fetchProducts({ storeId: store?.id ?? null, ids, pageSize: 100 }));
  const { wide } = useLayout();
  const user = useUser();
  // Suggestions change only when the set of products changes (not on quantity changes).
  const suggestions = useQuery(ids.length ? `cart-suggestions:${store?.id}:${ids.join(',')}` : null,
    () => fetchCartSuggestions(store?.id ?? null, ids, 10));

  const band = wide ? undefined : <BrandHeader title="Carrello" titleSize={30} subtitle="Nessun articolo" pad={[14, 16, 18]}
    left={<HeaderBack onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />} />;
  if (empty) return <Screen header={band} ground={wide ? undefined : colors.page}>{wide && <PageTitle title="Il tuo carrello" />}<EmptyState title="Il carrello è vuoto" art={wide ? undefined : <EmptyReceipt />}
    message={wide ? 'La tua casa aspetta nuove idee. Inizia da un piccolo essenziale.' : 'Aggiungi i prodotti che ti servono: li prepariamo noi nel tuo negozio.'}>
    <PrimaryButton title={wide ? 'Vai al catalogo' : 'Inizia la spesa'} onPress={() => wide ? router.push(ALL_PRODUCTS) : router.replace('/')} />
  </EmptyState></Screen>;

  if (!quote) return <Screen header={band} ground={wide ? undefined : colors.page}>{wide && <PageTitle title="Il tuo carrello" />}
    {error ? <Notice tone="error" title="Impossibile aggiornare il carrello" message="Controlla la connessione e riprova.">
      <Pressable onPress={refresh}><Text style={{ color: colors.green, fontWeight: '600' }}>Riprova</Text></Pressable>
    </Notice> : <Loading />}
  </Screen>;

  const t = quote;
  const subtotal = t?.subtotal_cents ?? 0;
  const weight = t?.total_weight_g ?? 0;
  const overweight = weight > FREE_SHIPPING_MAX_WEIGHT_G;
  const remaining = freeShippingRemainingCents(subtotal, weight);
  const hasIssues = quote.issue_count > 0;
  const count = cartItemCount(items);
  const storeName = storeShortName(store);
  const byId = new Map((details.data?.items ?? []).map((p) => [p.id, p]));
  const methodOk = !t || t.shipping[fulfilment] != null;
  // Club member prices: already in the totals for members; for everyone else, what joining would save.
  const memberSaved = t?.member_savings_cents ?? 0;
  const memberAvailable = t?.member_savings_available_cents ?? 0;

  const cta = <PrimaryButton title={user ? 'Procedi al checkout' : 'Accedi e continua'}
    disabled={hasIssues || quote.item_count === 0 || loading || !methodOk}
    onPress={() => user ? router.push('/checkout') : router.push({ pathname: '/auth/sign-in', params: { next: '/checkout' } })} />;

  const delivery = <View style={styles.delivery}>
    <Icon name={fulfilment === 'store' ? 'store' : fulfilment === 'home' ? 'truck' : 'pin'} size={26} strokeWidth={1.3} />
    <View style={{ flex: 1 }}>
      <Text style={styles.deliveryTitle}>{fulfilment === 'store' ? storeName ? `Ritiro ${atPlace(storeName)}` : 'Ritiro in negozio' : FULFILMENT_LABELS[fulfilment]}</Text>
      <Text style={styles.deliveryText}>{!methodOk ? 'Non disponibile per questo ordine: scegline un altro'
        : fulfilment === 'store' ? "Gratuito, quando l'ordine è pronto" : fulfilment === 'home' ? "Indirizzo al passo successivo" : 'Scegli il punto al passo successivo'}</Text>
    </View>
    <Pressable onPress={() => setDeliverySheet(true)} accessibilityRole="button" accessibilityLabel="Modifica consegna" hitSlop={8}>
      <Text style={styles.modify}>Modifica</Text></Pressable>
  </View>;
  const club = <Pressable onPress={() => router.push('/club')} accessibilityRole="link" style={styles.banner}>
    <Icon name="crown" size={32} color="#B07A1E" strokeWidth={1.2} />
    <View style={{ flex: 1 }}>
      <Text style={styles.bannerTitle}>Casa & Te Club</Text>
      <Text style={styles.bannerText}>{memberAvailable > 0
        ? `Con il Club gratuito risparmi ${formatEuro(memberAvailable)} su questo carrello: iscriviti o collega la tua tessera.`
        : clubTagline}</Text>
    </View>
    <Icon name="chevron" size={18} color={colors.text} />
  </Pressable>;
  const suggested = (suggestions.data ?? []).filter((p) => !items[p.id]);
  const suggestionsRow = suggested.length > 0 && <View style={styles.sugg}>
    <Text style={styles.suggTitle} accessibilityRole="header">Potrebbe servirti anche</Text>
    {fulfilment === 'home' && !overweight && remaining > 0
      ? <Text style={styles.suggNote}>Mancano {formatEuro(remaining)} per la spedizione gratuita</Text>
      : <Text style={styles.suggNote}>Scelti in base al tuo carrello</Text>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 10, paddingRight: 16 }}>
      {suggested.map((p) => <View key={p.id} style={{ width: wide ? 190 : 156 }}><ProductCard product={p} /></View>)}
    </ScrollView>
  </View>;
  const shippingValue = !t ? '—' : t.shipping_cents === null ? 'Non disponibile' : formatShipping(t.shipping_cents);
  const summary = <View style={styles.totals}>
    <SummaryRow label="Totale prodotti" value={formatEuro(subtotal + memberSaved)} />
    {memberSaved > 0 && <View style={[styles.footRow, { marginVertical: 4 }]}><Text style={styles.footSoci}>Prezzi Soci</Text><Text style={styles.footSoci}>-{formatEuro(memberSaved)}</Text></View>}
    {!!t?.discount_cents && <SummaryRow label="Sconto" value={`-${formatEuro(t.discount_cents)}`} />}
    <SummaryRow label="Spedizione" value={shippingValue} />
    {fulfilment === 'home' && !overweight && remaining > 0 && <Text style={styles.hint}>Mancano {formatEuro(remaining)} per la spedizione gratuita (fino a 10 kg).</Text>}
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>Totale</Text>
      <Text style={styles.totalValue}>{t?.total_cents != null ? formatEuro(t.total_cents) : '—'}</Text>
    </View>
    <Text style={styles.vat}>IVA inclusa</Text>
    {memberAvailable > 0 && clubOn && t?.total_cents != null && <View style={{ marginTop: 14 }}><ClubCompare total={t.total_cents} saving={memberAvailable} /></View>}
  </View>;

  // Phone (design F, F-Carrello): full page with a back button, the pickup card hanging from the awning,
  // white line plates with steppers, and the totals in a white sheet at the bottom.
  if (!wide) {
    const euro = (c: number) => formatEuro(c).replace(/€\s/, '€');
    const back = () => router.canGoBack() ? router.back() : router.replace('/');
    const header = <BrandHeader inScroll title="Carrello" titleSize={30} subtitle={`${count} ${count === 1 ? 'articolo' : 'articoli'}`} pad={[14, 16, 40]}
      left={<HeaderBack onPress={back} />} />;
    const footer = <View>
      {memberAvailable > 0 && clubOn && t?.total_cents != null && <ClubCompare total={t.total_cents} saving={memberAvailable} />}
      <View style={styles.footRow}><Text style={styles.footLabel}>Prodotti</Text><Text style={styles.footLabel}>{euro(subtotal + memberSaved)}</Text></View>
      {memberSaved > 0 && <View style={[styles.footRow, { marginTop: 4 }]}><Text style={styles.footSoci}>Prezzi Soci</Text><Text style={styles.footSoci}>-{euro(memberSaved)}</Text></View>}
      {!!t?.discount_cents && <View style={[styles.footRow, { marginTop: 4 }]}><Text style={styles.footLabel}>Sconto</Text><Text style={styles.footLabel}>-{euro(t.discount_cents)}</Text></View>}
      <View style={[styles.footRow, { marginTop: 4 }]}><Text style={styles.footLabel}>{fulfilment === 'store' ? 'Ritiro in negozio' : 'Spedizione'}</Text>
        <Text style={[styles.footLabel, t?.shipping_cents === 0 && styles.footFree]}>{shippingValue.replace(/€\s/, '€')}</Text></View>
      {fulfilment === 'home' && !overweight && remaining > 0 && <Text style={[styles.footNote, { marginTop: 4 }]}>Mancano {euro(remaining)} per la spedizione gratuita (fino a 10 kg).</Text>}
      <View style={styles.footRule} />
      <View style={[styles.footRow, { alignItems: 'baseline' }]}>
        <Text style={styles.footTotalLabel}>Totale</Text>
        <Text style={styles.footTotal}>{t?.total_cents != null ? euro(t.total_cents) : '—'}</Text></View>
      <Text style={[styles.footNote, { marginTop: 2, marginBottom: 14 }]}>IVA inclusa · importo confermato al pagamento</Text>
      <Pressable disabled={hasIssues || quote.item_count === 0 || loading || !methodOk} accessibilityRole="button"
        onPress={() => user ? router.push('/checkout') : router.push({ pathname: '/auth/sign-in', params: { next: '/checkout' } })}
        style={({ pressed }) => [styles.payButton, (hasIssues || !methodOk) && { opacity: 0.45 }, pressed && { opacity: 0.88 }]}>
        <Text style={styles.payText}>{user ? 'Vai al pagamento' : 'Accedi e continua'}</Text>
        <Icon name="arrow" size={18} color="#FFFFFF" strokeWidth={2.4} />
      </Pressable>
    </View>;
    return <Screen header={<StatusBand />} top={header} ground={colors.page} onRefresh={refresh} refreshing={loading} footer={footer}
      contentContainerStyle={{ padding: 0, paddingBottom: 24 }} bodyStyle={{ paddingHorizontal: 16 }}>
      <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
      <FulfilmentSheet visible={deliverySheet} onClose={() => setDeliverySheet(false)} quote={quote} storeName={storeName || 'negozio'}
        onChangeStore={() => setStoreSheet(true)} />
      <View style={{ marginTop: -30 }}>
        {fulfilment === 'store'
          ? <StoreCard compact showStatus={false} label="Ritiro gratuito a" onPress={() => setDeliverySheet(true)} />
          : <Pressable onPress={() => setDeliverySheet(true)} accessibilityRole="button" style={styles.pCard}>
              <View style={styles.pCircle}><Icon name={fulfilment === 'home' ? 'truck' : 'pin'} size={20} color={colors.green} strokeWidth={1.9} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pLabel}>{FULFILMENT_LABELS[fulfilment]}</Text>
                <Text style={styles.pTitle}>{!methodOk ? 'Non disponibile: scegline un altro' : fulfilment === 'home' ? 'Indirizzo al passo successivo' : 'Punto scelto al passo successivo'}</Text>
              </View>
              <Text style={styles.pLink}>Cambia</Text>
            </Pressable>}
      </View>
      {hasIssues && <View style={{ marginTop: 12 }}><Notice tone="error" title="Alcuni articoli richiedono attenzione"
        message="Modifica le quantità o rimuovi gli articoli segnalati per continuare." /></View>}
      <View style={{ paddingTop: 12, gap: 8 }}>
        {quote.lines.map((line) => {
          const max = Math.min(99, Math.max(line.available_quantity, line.quantity));
          const p = byId.get(line.product_id);
          const compare = p?.compare_at_price_cents && line.unit_price_cents !== null && p.compare_at_price_cents > line.unit_price_cents ? p.compare_at_price_cents : null;
          const qty = items[line.product_id] ?? line.quantity;
          return <Animated.View key={line.product_id} entering={FadeInDown.duration(220)} style={styles.pLine}>
            <Pressable style={styles.pThumb} onPress={() => router.push(`/product/${line.product_id}`)} accessibilityLabel={line.name}>
              <View style={{ width: 72, height: 72 }}><ProductImage uri={imageUrl(line.image_path)} sku={line.sku} label={line.name} inset={0} /></View>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0, justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={styles.pName} numberOfLines={2}>{line.name}</Text>
                <Pressable onPress={() => { setRemoved({ id: line.product_id, name: line.name, qty }); remove(line.product_id); }}
                  style={styles.remove} accessibilityRole="button" accessibilityLabel={`Rimuovi ${line.name}`}>
                  <Icon name="trash" size={18} color={colors.muted} strokeWidth={1.9} /></Pressable>
              </View>
              {!!line.issue && <Text style={styles.issue}>{ISSUE_TEXT[line.issue]}{line.issue === 'insufficient_stock' ? ` (disponibili: ${line.available_quantity})` : ''}</Text>}
              <View style={styles.lineBottom}>
                <View style={{ flexShrink: 1 }}>{!line.issue && <LinePrice line={line} compareUnit={compare} />}</View>
                {line.issue !== 'unavailable' && <View style={styles.qty}>
                  <Pressable onPress={() => qty <= 1 ? (setRemoved({ id: line.product_id, name: line.name, qty }), remove(line.product_id)) : setQuantity(line.product_id, qty - 1)}
                    accessibilityRole="button" accessibilityLabel={`Togli un ${line.name}`} style={styles.qtyButton}><Text style={styles.qtyGlyph}>−</Text></Pressable>
                  <Text style={styles.qtyValue} accessibilityLabel={`Quantità ${qty}`}>{qty}</Text>
                  <Pressable onPress={() => setQuantity(line.product_id, qty + 1)} disabled={qty >= max} accessibilityRole="button" accessibilityLabel={`Aggiungi un ${line.name}`}
                    style={[styles.qtyButton, qty >= max && { opacity: 0.35 }]}><Text style={styles.qtyGlyph}>+</Text></Pressable>
                </View>}
              </View>
            </View>
          </Animated.View>;
        })}
      </View>
      {suggestionsRow}
      {removed && <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.snack} accessibilityLiveRegion="polite">
        <Text style={styles.snackText} numberOfLines={1}>Rimosso: {removed.name}</Text>
        <Pressable onPress={() => { add(removed.id, removed.qty); setRemoved(null); }} accessibilityRole="button" hitSlop={8} style={{ paddingHorizontal: 12, height: 40, justifyContent: 'center' }}>
          <Text style={styles.snackLink}>Annulla</Text></Pressable>
      </Animated.View>}
    </Screen>;
  }

  return <Screen onRefresh={refresh} refreshing={loading} footer={wide ? undefined : cta}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    <FulfilmentSheet visible={deliverySheet} onClose={() => setDeliverySheet(false)} quote={quote} storeName={storeName || 'negozio'}
      onChangeStore={() => setStoreSheet(true)} />
    <PageTitle title="Il tuo carrello" subtitle={`${count} ${count === 1 ? 'prodotto' : 'prodotti'}`} />
    <View style={wide ? styles.wide : undefined}><View style={wide ? { flex: 1.6, minWidth: 0 } : undefined}>
    {removed && <View style={styles.undo} accessibilityLiveRegion="polite">
      <Text style={styles.undoText}>{removed.name} rimosso dal carrello.</Text>
      <Pressable onPress={() => { add(removed.id, removed.qty); setRemoved(null); }} accessibilityRole="button"><Text style={styles.undoLink}>Annulla</Text></Pressable>
    </View>}
    {hasIssues && <Notice tone="error" title="Alcuni articoli richiedono attenzione"
      message="Modifica le quantità o rimuovi gli articoli segnalati per continuare." />}
    <View style={styles.lines}>
    {quote.lines.map((line) => {
      const max = Math.min(99, Math.max(line.available_quantity, line.quantity));
      const p = byId.get(line.product_id);
      const attrs = [formatPackSize(p?.unit_quantity ?? null, p?.unit ?? null), p?.color, p?.variant_label].filter(Boolean).join(' · ');
      return <View key={line.product_id} style={styles.line}>
        <Pressable style={styles.thumb} onPress={() => router.push(`/product/${line.product_id}`)} accessibilityLabel={line.name}>
          <ProductImage uri={imageUrl(line.image_path)} sku={line.sku} label={line.name} inset={0.08} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={2}>{line.name}</Text>
          {!!p?.brand && <Text style={styles.meta}>{p.brand}</Text>}
          {!!attrs && <Text style={styles.meta}>{attrs}</Text>}
          {!p?.brand && !attrs && line.weight_g !== null && <Text style={styles.meta}>{formatWeight(line.weight_g)}</Text>}
          {!!line.issue && <Text style={styles.issue}>{ISSUE_TEXT[line.issue]}{line.issue === 'insufficient_stock' ? ` (disponibili: ${line.available_quantity})` : ''}</Text>}
          <View style={styles.lineBottom}>
            <View style={{ flexShrink: 1 }}>{!line.issue && <LinePrice line={line} wide
              compareUnit={p?.compare_at_price_cents && line.unit_price_cents !== null && p.compare_at_price_cents > line.unit_price_cents ? p.compare_at_price_cents : null} />}</View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {line.issue !== 'unavailable' && <QuantityControl value={items[line.product_id] ?? line.quantity} label={line.name} max={max} compact
                onChange={(q) => setQuantity(line.product_id, q)} />}
              <Pressable onPress={() => { setRemoved({ id: line.product_id, name: line.name, qty: items[line.product_id] ?? line.quantity }); remove(line.product_id); }} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Rimuovi ${line.name}`}>
                <Icon name="trash" size={18} color={colors.muted} strokeWidth={1.3} /></Pressable>
            </View>
          </View>
        </View>
      </View>;
    })}
    </View>
    {suggestionsRow}
    {!wide && <>{delivery}{clubOn && memberAvailable === 0 && club}{summary}</>}
    </View>
    {wide && <View style={styles.summaryCard}>{delivery}{clubOn && memberAvailable === 0 && club}{summary}<View style={{ marginTop: 18 }}>{cta}</View></View>}
    </View>
  </Screen>;
}

const euroTight = (c: number) => formatEuro(c).replace(/€\s/, '€');

/**
 * A cart line's price: Club member price charged (red, regular price struck), member price on offer to a
 * non-member (regular price, the Soci price beside it), or a store promotion (red, old price struck).
 * Display only: every amount comes from quote_cart.
 */
function LinePrice({ line, compareUnit, wide }: { line: QuoteLine; compareUnit: number | null; wide?: boolean }) {
  const regular = line.regular_unit_price_cents ?? line.unit_price_cents ?? 0;
  const member = line.member_unit_price_cents ?? null;
  const qty = line.quantity;
  const pct = (from: number, to: number) => Math.round((1 - to / from) * 100);
  const big = [wide ? styles.linePrice : styles.pPrice];
  if (line.member_price_applied && member !== null) return <View>
    <View style={styles.priceRow}>
      <Text style={[...big, { color: colors.sale }]}>{euroTight(line.line_total_cents)}</Text>
      <Text style={styles.struck}>{euroTight(regular * qty)}</Text>
    </View>
    <View style={styles.sociTag}><Icon name="crown" size={12} color="#FFFFFF" strokeWidth={2} />
      <Text style={styles.sociTagText}>Prezzo Soci −{pct(regular, member)}%</Text></View>
    {qty > 1 && <Text style={styles.pEach}>{euroTight(member)} cad.</Text>}
  </View>;
  if (member !== null) return <View>
    <Text style={big}>{euroTight(line.line_total_cents)}</Text>
    <View style={styles.sociOffer}>
      <Icon name="crown" size={12} color={colors.sale} strokeWidth={2} />
      <Text style={styles.sociOfferText}>Soci <Text style={{ fontFamily: fonts.sansBold, fontWeight: '700' }}>{euroTight(member * qty)}</Text> −{pct(regular, member)}%</Text>
    </View>
    {qty > 1 && <Text style={styles.pEach}>{euroTight(regular)} cad.</Text>}
  </View>;
  return <View>
    <View style={styles.priceRow}>
      <Text style={[...big, !!compareUnit && { color: colors.sale }]}>{euroTight(line.line_total_cents)}</Text>
      {!!compareUnit && <Text style={styles.struck}>{euroTight(compareUnit * qty)}</Text>}
    </View>
    {qty > 1 && line.unit_price_cents !== null && <Text style={styles.pEach}>{euroTight(line.unit_price_cents)} cad.</Text>}
  </View>;
}

/** For non-members: the cart total with and without the Club, side by side, and the way in. */
function ClubCompare({ total, saving }: { total: number; saving: number }) {
  return <Pressable onPress={() => router.push('/club')} accessibilityRole="link" style={styles.compare}
    accessibilityLabel={`Totale ${formatEuro(total)}, con il Club ${formatEuro(total - saving)}. Iscriviti gratis`}>
    <View style={styles.compareCol}>
      <Text style={styles.compareLabel}>Senza Club</Text>
      <Text style={styles.compareNow}>{euroTight(total)}</Text>
    </View>
    <View style={[styles.compareCol, styles.compareClub]}>
      <Text style={[styles.compareLabel, { color: colors.sale }]}>Con il Club</Text>
      <Text style={styles.compareSoci}>{euroTight(total - saving)}</Text>
      <Text style={styles.compareSave}>risparmi {euroTight(saving)}</Text>
    </View>
    <View style={styles.compareCta}>
      <Text style={styles.compareCtaText}>Iscriviti{'\n'}gratis</Text>
      <Icon name="chevron" size={16} color="#FFFFFF" strokeWidth={2.4} />
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  sugg: { marginTop: 18 },
  suggTitle: { fontSize: 19, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  suggNote: { fontSize: 12.5, color: colors.muted, fontFamily: fonts.sans, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  struck: { fontSize: 12.5, color: colors.muted, textDecorationLine: 'line-through', fontFamily: fonts.sans },
  sociTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: colors.sale, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2, marginTop: 3 },
  sociTagText: { fontSize: 11, color: '#FFFFFF', fontFamily: fonts.sansBold, fontWeight: '700' },
  sociOffer: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.sale, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 1, marginTop: 3 },
  sociOfferText: { fontSize: 11.5, color: colors.sale, fontFamily: fonts.sans },
  footSoci: { fontSize: 15, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.sale },
  compare: { flexDirection: 'row', alignItems: 'stretch', borderRadius: 16, borderWidth: 1.5, borderColor: colors.sale, overflow: 'hidden', marginBottom: 12 },
  compareCol: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, justifyContent: 'center' },
  compareClub: { backgroundColor: '#FCEDEA' },
  compareLabel: { fontSize: 11.5, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  compareNow: { fontSize: 18, fontFamily: fonts.heavy, color: colors.text, marginTop: 2 },
  compareSoci: { fontSize: 20, fontFamily: fonts.heavy, color: colors.sale, marginTop: 2 },
  compareSave: { fontSize: 11.5, color: colors.sale, fontFamily: fonts.sans },
  compareCta: { width: 86, backgroundColor: colors.sale, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 6 },
  compareCtaText: { fontSize: 13, lineHeight: 16, color: '#FFFFFF', fontFamily: fonts.sansBold, fontWeight: '700', textAlign: 'center' },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.cream, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  snack: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderRadius: 16, paddingHorizontal: 16, backgroundColor: colors.text },
  snackText: { flex: 1, fontSize: 14.5, fontFamily: fonts.sansSemiBold, color: '#FFFFFF' },
  snackLink: { fontSize: 14.5, fontFamily: fonts.heavy, color: colors.yellow },
  undoText: { flex: 1, fontSize: 14, color: colors.text, fontFamily: fonts.sans },
  undoLink: { fontSize: 14, fontFamily: fonts.sansSemiBold, fontWeight: '600', color: colors.green, textDecorationLine: 'underline' },
  wide: { flexDirection: 'row', gap: 40, alignItems: 'flex-start' },
  summaryCard: { flex: 1, maxWidth: 420, backgroundColor: colors.surface, borderRadius: 16, padding: 22, borderWidth: 1, borderColor: colors.line },
  lines: { borderTopWidth: 1, borderColor: '#EEE9E0' },
  line: { flexDirection: 'row', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#EEE9E0' },
  thumb: { width: 86, height: 86, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: '#EEE9E0', justifyContent: 'center', overflow: 'hidden' },
  name: { fontSize: 16.5, lineHeight: 19, fontFamily: fonts.serif, color: colors.text },
  meta: { fontSize: 11.5, color: colors.muted, marginTop: 2, fontFamily: fonts.sans },
  issue: { fontSize: 12, color: colors.danger, marginTop: 4, fontFamily: fonts.sansMedium, fontWeight: '500' },
  hint: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans, marginTop: -2, marginBottom: 4 },
  lineBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 'auto', paddingTop: 6 },
  linePrice: { fontSize: 19.5, fontFamily: fonts.serifMedium, color: colors.text },
  remove: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  delivery: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  deliveryTitle: { fontSize: 16.5, fontFamily: fonts.serif, color: colors.text },
  deliveryText: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17, fontFamily: fonts.sans },
  modify: { fontSize: 12.5, color: colors.green, textDecorationLine: 'underline', fontFamily: fonts.sansMedium, fontWeight: '500' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#F5ECDD', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16 },
  bannerTitle: { fontSize: 19, fontFamily: fonts.serif, color: colors.text },
  pSoci: { fontSize: 11, color: colors.sale, fontFamily: fonts.sansBold, fontWeight: '700' },
  memberSaved: { fontSize: 13, color: colors.sale, fontFamily: fonts.sansSemiBold, fontWeight: '600', marginTop: 8 },
  memberNudge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.well, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10 },
  memberNudgeText: { flex: 1, fontSize: 13, color: colors.sale, fontFamily: fonts.sans },
  bannerText: { fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 3, fontFamily: fonts.sans },
  totals: { marginTop: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  totalLabel: { fontSize: 23, fontFamily: fonts.serif, color: colors.text },
  totalValue: { fontSize: 24, fontFamily: fonts.serifMedium, color: colors.text },
  vat: { fontSize: 12, color: colors.muted, textAlign: 'right', marginTop: 2, fontFamily: fonts.sans },
  countPill: { backgroundColor: colors.yellow, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  countPillText: { fontSize: 13.5, fontFamily: fonts.heavy, fontWeight: '800', color: colors.text },
  pCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#FFFFFF',
    shadowColor: '#18201A', shadowOpacity: 0.12, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  pCircle: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  pLabel: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.muted },
  pTitle: { fontSize: 15, fontFamily: fonts.sansBold, color: colors.text },
  pLink: { fontSize: 13.5, fontFamily: fonts.sansBold, color: colors.green },
  pLine: { flexDirection: 'row', gap: 12, paddingVertical: 8, paddingLeft: 8, paddingRight: 12, borderRadius: 18, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: colors.line },
  pThumb: { width: 80, height: 80, borderRadius: 12, backgroundColor: colors.photo, alignItems: 'center', justifyContent: 'center' },
  pName: { flex: 1, fontSize: 14.5, lineHeight: 18, fontFamily: fonts.sansSemiBold, color: colors.text },
  pPrice: { fontSize: 17, fontFamily: fonts.heavy, color: colors.text },
  pEach: { fontSize: 11.5, fontFamily: fonts.sans, color: colors.muted },
  qty: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 20, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.line },
  qtyButton: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center' },
  qtyGlyph: { fontSize: 19, lineHeight: 22, fontFamily: fonts.sansBold, color: colors.text },
  qtyValue: { minWidth: 16, textAlign: 'center', fontSize: 15, fontFamily: fonts.heavy, color: colors.text },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  footLabel: { fontSize: 15, fontFamily: fonts.sans, color: colors.muted },
  footFree: { color: colors.green, fontFamily: fonts.heavy },
  footNote: { fontSize: 12.5, fontFamily: fonts.sans, color: colors.muted },
  footRule: { height: 1, backgroundColor: '#EFECE3', marginVertical: 12 },
  footTotalLabel: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  footTotal: { fontSize: 28, lineHeight: 34, fontFamily: fonts.heavy, color: colors.text, letterSpacing: -0.4 },
  payButton: { height: 58, borderRadius: 29, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  payText: { fontSize: 17, fontFamily: fonts.sansBold, color: '#FFFFFF' },
});
