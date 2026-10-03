import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { colors, fonts } from '@/config/theme';
import { fetchProducts, imageUrl } from '@/lib/api';
import { useCartQuote, useClubSettings, useLayout } from '@/lib/hooks';
import { cartItemCount, useCartStore } from '@/store/cart';
import { useUser } from '@/store/session';

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

  if (empty) return <Screen><PageTitle title="Il tuo carrello" /><EmptyState title="Il carrello è vuoto"
    message="La tua casa aspetta nuove idee. Inizia da un piccolo essenziale.">
    <PrimaryButton title="Vai al catalogo" onPress={() => router.push('/catalog')} />
  </EmptyState></Screen>;

  if (!quote) return <Screen><PageTitle title="Il tuo carrello" />
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
      <Text style={styles.bannerText}>{clubTagline}</Text>
    </View>
    <Icon name="chevron" size={18} color={colors.text} />
  </Pressable>;
  const shippingValue = !t ? '—' : t.shipping_cents === null ? 'Non disponibile' : formatShipping(t.shipping_cents);
  const summary = <View style={styles.totals}>
    <SummaryRow label="Totale prodotti" value={formatEuro(subtotal)} />
    {!!t?.discount_cents && <SummaryRow label="Sconto" value={`-${formatEuro(t.discount_cents)}`} />}
    <SummaryRow label="Spedizione" value={shippingValue} />
    {fulfilment === 'home' && !overweight && remaining > 0 && <Text style={styles.hint}>Mancano {formatEuro(remaining)} per la spedizione gratuita (fino a 10 kg).</Text>}
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>Totale</Text>
      <Text style={styles.totalValue}>{t?.total_cents != null ? formatEuro(t.total_cents) : '—'}</Text>
    </View>
    <Text style={styles.vat}>IVA inclusa</Text>
  </View>;

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
            <Text style={styles.linePrice}>{line.issue ? '' : formatEuro(line.line_total_cents)}</Text>
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
    {!wide && <>{delivery}{clubOn && club}{summary}</>}
    </View>
    {wide && <View style={styles.summaryCard}>{delivery}{clubOn && club}{summary}<View style={{ marginTop: 18 }}>{cta}</View></View>}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  undo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.cream, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
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
  bannerText: { fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 3, fontFamily: fonts.sans },
  totals: { marginTop: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  totalLabel: { fontSize: 23, fontFamily: fonts.serif, color: colors.text },
  totalValue: { fontSize: 24, fontFamily: fonts.serifMedium, color: colors.text },
  vat: { fontSize: 12, color: colors.muted, textAlign: 'right', marginTop: 2, fontFamily: fonts.sans },
});
