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
import { colors } from '@/config/theme';
import { imageUrl } from '@/lib/api';
import { useCartQuote, useLayout } from '@/lib/hooks';
import { cartItemCount, useCartStore } from '@/store/cart';

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

  if (empty) return <Screen><PageTitle title="Carrello" /><EmptyState title="Il carrello è vuoto"
    message="La tua casa aspetta nuove idee. Inizia da un piccolo essenziale.">
    <PrimaryButton title="Vai al catalogo" onPress={() => router.push('/catalog')} />
  </EmptyState></Screen>;

  if (!quote) return <Screen><PageTitle title="Carrello" />
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

  const cta = <PrimaryButton title="Scegli consegna e paga" disabled={hasIssues || quote.item_count === 0 || loading}
    onPress={() => router.push('/checkout')} />;
  const summary = <>
    <SectionTitle>Riepilogo</SectionTitle>
    <SummaryRow label={`Prodotti (${cartItemCount(items)})`} value={formatEuro(subtotal)} />
    <SummaryRow label="Peso ordine" value={formatWeight(weight)} />
    <SummaryRow label="Consegna a domicilio" value={home ? formatShipping(home.price_cents) : 'Non disponibile'} />
    <SummaryRow label="Ritiro in negozio" value="Gratis" tone="green" />
    <Text style={styles.small}>Il totale finale dipende dalla consegna che scegli al passo successivo.</Text>
  </>;

  return <Screen onRefresh={refresh} refreshing={loading} footer={wide ? undefined : <View style={styles.footer}>
    <View style={styles.footerTotal}><Text style={styles.small}>Prodotti</Text><Text style={styles.total}>{formatEuro(subtotal)}</Text></View>
    <View style={{ flex: 1 }}>{cta}</View>
  </View>}>
    <PageTitle title="Carrello" subtitle={`${cartItemCount(items)} ${cartItemCount(items) === 1 ? 'articolo' : 'articoli'} · ${store?.name ?? ''}`} />
    <View style={wide ? styles.wide : undefined}><View style={wide ? { flex: 1.6, minWidth: 0 } : undefined}>
    {removed && <View style={styles.undo} accessibilityLiveRegion="polite">
      <Text style={styles.undoText}>{removed.name} rimosso dal carrello.</Text>
      <Pressable onPress={() => { add(removed.id, removed.qty); setRemoved(null); }} accessibilityRole="button"><Text style={styles.undoLink}>Annulla</Text></Pressable>
    </View>}
    {hasIssues && <Notice tone="error" title="Alcuni articoli richiedono attenzione"
      message="Modifica le quantità o rimuovi gli articoli segnalati per continuare." />}
    <View style={styles.shippingNote}><View style={styles.noteHeading}><Icon name="truck" color={colors.green} size={20} />
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
              <Text style={styles.removeText}>Rimuovi</Text></Pressable>
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
  undo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#EEF1EA', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  undoText: { flex: 1, fontSize: 14, color: colors.text },
  undoLink: { fontSize: 14, fontWeight: '700', color: colors.green, textDecorationLine: 'underline' },
  wide: { flexDirection: 'row', gap: 32, alignItems: 'flex-start' },
  summaryCard: { flex: 1, maxWidth: 380, backgroundColor: colors.surface, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: colors.line, marginTop: 8 },
  shippingNote: { backgroundColor: '#EDF2E5', borderRadius: 17, padding: 17, marginBottom: 8 },
  noteHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  noteTitle: { fontSize: 13, fontWeight: '600', color: colors.greenDark, flex: 1 },
  noteText: { fontSize: 13, lineHeight: 19, color: '#4F5C46', marginTop: 9 },
  progress: { height: 4, borderRadius: 2, backgroundColor: '#DCE4D2', marginTop: 13, overflow: 'hidden' },
  progressValue: { height: 4, backgroundColor: colors.green, borderRadius: 2 },
  line: { flexDirection: 'row', gap: 15, paddingVertical: 22, borderBottomWidth: 1, borderColor: colors.line },
  thumb: { width: 84, height: 100, backgroundColor: '#EEEFE9', borderRadius: 14, justifyContent: 'center', overflow: 'hidden' },
  name: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 5 },
  issue: { fontSize: 12, color: colors.danger, marginTop: 8, fontWeight: '500' },
  linePrice: { fontSize: 17, fontWeight: '600', color: colors.text, marginTop: 8 },
  lineBottom: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 12 },
  remove: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  removeText: { color: colors.muted, fontSize: 13, textDecorationLine: 'underline' },
  pickup: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  pickupText: { flex: 1, color: colors.green, fontSize: 12, lineHeight: 19 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  footerTotal: { minWidth: 73 }, small: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  total: { fontSize: 23, fontWeight: '600', letterSpacing: -0.6, marginTop: 3, color: colors.text },
});
