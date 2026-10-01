import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  FREE_SHIPPING_MAX_WEIGHT_G, FREE_SHIPPING_THRESHOLD_CENTS, formatEuro, formatShipping, formatWeight,
  freeShippingRemainingCents, type QuoteLine,
} from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState, Loading, Notice, PageTitle, PrimaryButton, QuantityControl, SectionTitle, SummaryRow } from '@/components/UI';
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
  const summary = <>
    {wide ? <Text style={styles.summaryTitle}>Riepilogo</Text> : <SectionTitle>Riepilogo</SectionTitle>}
    <SummaryRow label={`Prodotti (${cartItemCount(items)})`} value={formatEuro(subtotal)} />
    <SummaryRow label="Peso ordine" value={formatWeight(weight)} />
    <SummaryRow label="Consegna a domicilio" value={home ? formatShipping(home.price_cents) : 'Non disponibile'} />
    {quote.shipping.pickup && <SummaryRow label="Punto di ritiro" value={formatShipping(quote.shipping.pickup.price_cents)} />}
    <SummaryRow label="Ritiro in negozio" value="Gratis" tone="green" />
    <Text style={styles.small}>Il totale finale dipende dalla consegna che scegli al passo successivo.</Text>
  </>;

  return <Screen onRefresh={refresh} refreshing={loading} footer={wide ? undefined : <View style={styles.footer}>
    <View style={styles.footerTotal}><Text style={styles.small}>Totale prodotti</Text><Text style={styles.total}>{formatEuro(subtotal)}</Text></View>
    <View style={{ flex: 1 }}>{cta}</View>
  </View>}>
    <PageTitle title="Il tuo carrello" subtitle={`${cartItemCount(items)} ${cartItemCount(items) === 1 ? 'prodotto' : 'prodotti'} · ${store?.name ?? ''}`} />
    <View style={wide ? styles.wide : undefined}><View style={wide ? { flex: 1.6, minWidth: 0 } : undefined}>
    {removed && <View style={styles.undo} accessibilityLiveRegion="polite">
      <Text style={styles.undoText}>{removed.name} rimosso dal carrello.</Text>
      <Pressable onPress={() => { add(removed.id, removed.qty); setRemoved(null); }} accessibilityRole="button"><Text style={styles.undoLink}>Annulla</Text></Pressable>
    </View>}
    {hasIssues && <Notice tone="error" title="Alcuni articoli richiedono attenzione"
      message="Modifica le quantità o rimuovi gli articoli segnalati per continuare." />}
    <View style={styles.shippingNote}><View style={styles.noteHeading}><Icon name="truck" color={colors.text} size={22} strokeWidth={1.4} />
      <Text style={styles.noteTitle}>{overweight ? 'Il tuo ordine supera 10 kg' : remaining === 0 ? 'Spedizione gratuita raggiunta!' : 'La spedizione gratuita è vicina'}</Text></View>
      <Text style={styles.noteText}>{overweight ? 'Oltre 10 kg si applica una tariffa dedicata. Il ritiro in negozio è sempre gratuito.'
        : remaining ? `Mancano ${formatEuro(remaining)} alla spedizione gratuita (fino a 10 kg).` : 'Per il tuo ordine fino a 10 kg, la consegna è gratis.'}</Text>
      {!overweight && <View style={styles.progress}><View style={[styles.progressValue, { width: `${Math.min(100, subtotal / FREE_SHIPPING_THRESHOLD_CENTS * 100)}%` }]} /></View>}
    </View>
    {quote.lines.map((line) => {
      const max = Math.min(99, Math.max(line.available_quantity, line.quantity));
      return <View key={line.product_id} style={styles.line}>
        <Pressable style={styles.thumb} onPress={() => router.push(`/product/${line.product_id}`)} accessibilityLabel={line.name}>
          <ProductImage uri={imageUrl(line.image_path)} sku={line.sku} label={line.name} inset={0.1} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name}>{line.name}</Text>
          {line.weight_g !== null && <Text style={styles.meta}>{formatWeight(line.weight_g)} cad.{line.unit_price_cents ? ` · ${formatEuro(line.unit_price_cents)} cad.` : ''}</Text>}
          {line.issue ? <Text style={styles.issue}>{ISSUE_TEXT[line.issue]}{line.issue === 'insufficient_stock' ? ` (disponibili: ${line.available_quantity})` : ''}</Text>
            : <Text style={styles.linePrice}>{formatEuro(line.line_total_cents)}</Text>}
          <View style={styles.lineBottom}>
            {line.issue !== 'unavailable' && <QuantityControl value={items[line.product_id] ?? line.quantity} label={line.name} max={max}
              onChange={(q) => setQuantity(line.product_id, q)} />}
            <Pressable onPress={() => { setRemoved({ id: line.product_id, name: line.name, qty: items[line.product_id] ?? line.quantity }); remove(line.product_id); }} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Rimuovi ${line.name}`}>
              <Icon name="trash" size={20} color={colors.muted} strokeWidth={1.5} /></Pressable>
          </View>
        </View>
      </View>;
    })}
    {!wide && summary}
    </View>
    {wide && <View style={styles.summaryCard}>{summary}<View style={{ marginTop: 18 }}>{cta}</View></View>}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  summaryTitle: { fontSize: 24, fontFamily: fonts.serif, color: colors.text, marginBottom: 10 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.cream, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  undoText: { flex: 1, fontSize: 14, color: colors.text, fontFamily: fonts.sans },
  undoLink: { fontSize: 14, fontFamily: fonts.sansSemiBold, fontWeight: '600', color: colors.green, textDecorationLine: 'underline' },
  wide: { flexDirection: 'row', gap: 40, alignItems: 'flex-start' },
  summaryCard: { flex: 1, maxWidth: 400, backgroundColor: colors.surface, borderRadius: 18, padding: 24, borderWidth: 1, borderColor: colors.line, marginTop: 8 },
  shippingNote: { backgroundColor: colors.sand, borderRadius: 14, padding: 18, marginBottom: 6 },
  noteHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  noteTitle: { fontSize: 17, fontFamily: fonts.serif, color: colors.text, flex: 1 },
  noteText: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 8, fontFamily: fonts.sans },
  progress: { height: 4, borderRadius: 2, backgroundColor: '#E6DAC4', marginTop: 13, overflow: 'hidden' },
  progressValue: { height: 4, backgroundColor: colors.green, borderRadius: 2 },
  line: { flexDirection: 'row', gap: 16, paddingVertical: 18, borderBottomWidth: 1, borderColor: colors.line },
  thumb: { width: 96, height: 96, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', overflow: 'hidden' },
  name: { fontSize: 16, lineHeight: 21, fontFamily: fonts.serif, color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 4, fontFamily: fonts.sans },
  issue: { fontSize: 13, color: colors.danger, marginTop: 8, fontFamily: fonts.sansMedium, fontWeight: '500' },
  linePrice: { fontSize: 19, fontFamily: fonts.serif, color: colors.text, marginTop: 6 },
  lineBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, marginTop: 10 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pickup: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  pickupText: { flex: 1, color: colors.green, fontSize: 12, lineHeight: 19 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  footerTotal: { minWidth: 80 }, small: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4, fontFamily: fonts.sans },
  total: { fontSize: 25, fontFamily: fonts.serif, marginTop: 2, color: colors.text },
});
