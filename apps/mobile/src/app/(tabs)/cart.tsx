import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  FREE_SHIPPING_MAX_WEIGHT_G, FREE_SHIPPING_THRESHOLD_CENTS, formatEuro, formatShipping, formatWeight,
  freeShippingRemainingCents, type QuoteLine,
} from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState, Loading, Notice, PageTitle, PrimaryButton, QuantityControl, SummaryRow } from '@/components/UI';
import { StoreSheet, storeShortName } from '@/components/StoreSheet';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/config/theme';
import { imageUrl } from '@/lib/api';
import { useCartQuote, useLayout } from '@/lib/hooks';
import { cartItemCount, useCartStore } from '@/store/cart';
import { useUser } from '@/store/session';

const ISSUE_TEXT: Record<NonNullable<QuoteLine['issue']>, string> = {
  unavailable: 'Non più disponibile',
  invalid_quantity: 'Quantità non consentita',
  insufficient_stock: 'Quantità non disponibile in questo negozio',
};

export default function CartScreen() {
  const items = useCartStore((s) => s.items);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);
  const add = useCartStore((s) => s.add);
  const [removed, setRemoved] = useState<{ id: string; name: string; qty: number } | null>(null);
  const [storeSheet, setStoreSheet] = useState(false);
  const { quote, error, loading, store, empty, refresh } = useCartQuote();
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

  const subtotal = quote.subtotal_cents;
  const weight = quote.total_weight_g;
  const overweight = weight > FREE_SHIPPING_MAX_WEIGHT_G;
  const remaining = freeShippingRemainingCents(subtotal, weight);
  const home = quote.shipping.home;
  const hasIssues = quote.issue_count > 0;

  const cta = <PrimaryButton title={user ? 'Procedi al checkout' : 'Accedi e continua'} disabled={hasIssues || quote.item_count === 0 || loading}
    onPress={() => user ? router.push('/checkout') : router.push({ pathname: '/auth/sign-in', params: { next: '/checkout' } })} />;
  const count = cartItemCount(items);
  const storeName = storeShortName(store);

  const delivery = <View style={styles.delivery}>
    <Icon name="store" size={24} strokeWidth={1.4} />
    <View style={{ flex: 1 }}>
      <Text style={styles.deliveryTitle}>Ritiro a {storeName || 'negozio'}</Text>
      <Text style={styles.deliveryText}>Gratuito, quando l'ordine è pronto · consegna a casa al passo successivo</Text>
    </View>
    <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button" accessibilityLabel="Modifica negozio di ritiro" hitSlop={8}>
      <Text style={styles.modify}>Modifica</Text></Pressable>
  </View>;
  const banner = <Pressable onPress={() => router.push('/legal/shipping')} accessibilityRole="link" style={styles.banner}>
    <Icon name="truck" size={28} color={colors.text} strokeWidth={1.3} />
    <View style={{ flex: 1 }}>
      <Text style={styles.bannerTitle}>{overweight ? 'Ordine oltre 10 kg' : remaining === 0 ? 'Spedizione gratuita raggiunta' : 'Spedizione gratuita da €66'}</Text>
      <Text style={styles.bannerText}>{overweight ? 'Oltre 10 kg si applica una tariffa dedicata. Il ritiro in negozio resta gratuito.'
        : remaining ? `Mancano ${formatEuro(remaining)} per la consegna gratuita a casa (fino a 10 kg).` : 'La consegna a casa è gratuita per questo ordine.'}</Text>
      {!overweight && <View style={styles.progress}><View style={[styles.progressValue, { width: `${Math.min(100, subtotal / FREE_SHIPPING_THRESHOLD_CENTS * 100)}%` }]} /></View>}
    </View>
    <Icon name="chevron" size={18} color={colors.text} />
  </Pressable>;
  const totals = <View style={styles.totals}>
    <SummaryRow label="Totale prodotti" value={formatEuro(subtotal)} />
    <SummaryRow label="Spedizione" value={remaining === 0 && !overweight ? 'Gratuita' : home ? `da ${formatShipping(home.price_cents)} · ritiro gratis` : 'Ritiro gratis'} />
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>Totale</Text>
      <Text style={styles.totalValue}>{formatEuro(subtotal)}</Text>
    </View>
    <Text style={styles.vat}>IVA inclusa · peso {formatWeight(weight)}</Text>
  </View>;

  return <Screen onRefresh={refresh} refreshing={loading} footer={wide ? undefined : cta}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
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
      return <View key={line.product_id} style={styles.line}>
        <Pressable style={styles.thumb} onPress={() => router.push(`/product/${line.product_id}`)} accessibilityLabel={line.name}>
          <ProductImage uri={imageUrl(line.image_path)} sku={line.sku} label={line.name} inset={0.08} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={2}>{line.name}</Text>
          {line.weight_g !== null && <Text style={styles.meta}>{formatWeight(line.weight_g)}{line.unit_price_cents && line.quantity > 1 ? ` · ${formatEuro(line.unit_price_cents)} cad.` : ''}</Text>}
          {!!line.issue && <Text style={styles.issue}>{ISSUE_TEXT[line.issue]}{line.issue === 'insufficient_stock' ? ` (disponibili: ${line.available_quantity})` : ''}</Text>}
          <View style={styles.lineBottom}>
            <Text style={styles.linePrice}>{line.issue ? '' : formatEuro(line.line_total_cents)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {line.issue !== 'unavailable' && <QuantityControl value={items[line.product_id] ?? line.quantity} label={line.name} max={max} compact
                onChange={(q) => setQuantity(line.product_id, q)} />}
              <Pressable onPress={() => { setRemoved({ id: line.product_id, name: line.name, qty: items[line.product_id] ?? line.quantity }); remove(line.product_id); }} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Rimuovi ${line.name}`}>
                <Icon name="trash" size={19} color={colors.muted} strokeWidth={1.5} /></Pressable>
            </View>
          </View>
        </View>
      </View>;
    })}
    </View>
    {!wide && <>{delivery}{banner}{totals}</>}
    </View>
    {wide && <View style={styles.summaryCard}>{delivery}{banner}{totals}<View style={{ marginTop: 18 }}>{cta}</View></View>}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  undo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.cream, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  undoText: { flex: 1, fontSize: 14, color: colors.text, fontFamily: fonts.sans },
  undoLink: { fontSize: 14, fontFamily: fonts.sansSemiBold, fontWeight: '600', color: colors.green, textDecorationLine: 'underline' },
  wide: { flexDirection: 'row', gap: 40, alignItems: 'flex-start' },
  summaryCard: { flex: 1, maxWidth: 420, backgroundColor: colors.surface, borderRadius: 16, padding: 22, borderWidth: 1, borderColor: colors.line },
  lines: { borderTopWidth: 1, borderColor: colors.line },
  line: { flexDirection: 'row', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line },
  thumb: { width: 92, height: 92, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', overflow: 'hidden' },
  name: { fontSize: 15, lineHeight: 19, fontFamily: fonts.serif, color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 3, fontFamily: fonts.sans },
  issue: { fontSize: 12, color: colors.danger, marginTop: 4, fontFamily: fonts.sansMedium, fontWeight: '500' },
  lineBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 'auto', paddingTop: 6 },
  linePrice: { fontSize: 19, fontFamily: fonts.serif, color: colors.text },
  remove: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  delivery: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  deliveryTitle: { fontSize: 15, fontFamily: fonts.serif, color: colors.text },
  deliveryText: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17, fontFamily: fonts.sans },
  modify: { fontSize: 13, color: colors.green, textDecorationLine: 'underline', fontFamily: fonts.sansMedium, fontWeight: '500' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.sand, borderRadius: 12, padding: 16 },
  bannerTitle: { fontSize: 17, fontFamily: fonts.serif, color: colors.text },
  bannerText: { fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 3, fontFamily: fonts.sans },
  progress: { height: 3, borderRadius: 2, backgroundColor: '#E6DAC4', marginTop: 10, overflow: 'hidden' },
  progressValue: { height: 3, backgroundColor: colors.green, borderRadius: 2 },
  totals: { marginTop: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  totalLabel: { fontSize: 22, fontFamily: fonts.serif, color: colors.text },
  totalValue: { fontSize: 24, fontFamily: fonts.serif, color: colors.text },
  vat: { fontSize: 12, color: colors.muted, textAlign: 'right', marginTop: 2, fontFamily: fonts.sans },
});
