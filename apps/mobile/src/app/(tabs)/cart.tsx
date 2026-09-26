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
import { useCartQuote } from '@/lib/hooks';
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
  const { quote, error, loading, store, empty, refresh } = useCartQuote();

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

  return <Screen onRefresh={refresh} refreshing={loading} footer={<View style={styles.footer}>
    <View style={styles.footerTotal}><Text style={styles.small}>Subtotale</Text><Text style={styles.total}>{formatEuro(subtotal)}</Text></View>
    <View style={{ flex: 1 }}><PrimaryButton title="Vai al checkout" disabled={hasIssues || quote.item_count === 0 || loading}
      onPress={() => router.push('/checkout')} /></View>
  </View>}>
    <PageTitle title="Carrello" subtitle={`${cartItemCount(items)} articoli · ${store?.name ?? ''}`} />
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
            <Pressable onPress={() => remove(line.product_id)} style={styles.remove} accessibilityRole="button">
              <Text style={styles.removeText}>Rimuovi</Text></Pressable>
          </View>
        </View>
      </View>;
    })}
    <SectionTitle>Riepilogo</SectionTitle>
    <SummaryRow label="Subtotale" value={formatEuro(subtotal)} />
    <SummaryRow label="Peso ordine" value={formatWeight(weight)} />
    <SummaryRow label="Consegna a domicilio" value={home ? formatShipping(home.price_cents) : 'Non disponibile'} />
    <View style={styles.pickup}><Icon name="store" color={colors.green} size={21} /><Text style={styles.pickupText}>Preferisci ritirare in negozio? È sempre gratis.</Text></View>
  </Screen>;
}

const styles = StyleSheet.create({
  shippingNote: { backgroundColor: '#EDF2E5', borderRadius: 17, padding: 17, marginBottom: 8 },
  noteHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  noteTitle: { fontSize: 13, fontWeight: '600', color: colors.greenDark, flex: 1 },
  noteText: { fontSize: 11, lineHeight: 18, color: '#67745D', marginTop: 9 },
  progress: { height: 4, borderRadius: 2, backgroundColor: '#DCE4D2', marginTop: 13, overflow: 'hidden' },
  progressValue: { height: 4, backgroundColor: colors.green, borderRadius: 2 },
  line: { flexDirection: 'row', gap: 15, paddingVertical: 22, borderBottomWidth: 1, borderColor: colors.line },
  thumb: { width: 84, height: 100, backgroundColor: '#EEEFE9', borderRadius: 14, justifyContent: 'center', overflow: 'hidden' },
  name: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text },
  meta: { fontSize: 10, color: colors.muted, marginTop: 5 },
  issue: { fontSize: 12, color: colors.danger, marginTop: 8, fontWeight: '500' },
  linePrice: { fontSize: 17, fontWeight: '600', color: colors.text, marginTop: 8 },
  lineBottom: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 12 },
  remove: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  removeText: { color: colors.muted, fontSize: 11, textDecorationLine: 'underline' },
  pickup: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  pickupText: { flex: 1, color: colors.green, fontSize: 12, lineHeight: 19 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  footerTotal: { minWidth: 73 }, small: { color: colors.muted, fontSize: 10 },
  total: { fontSize: 23, fontWeight: '600', letterSpacing: -0.6, marginTop: 3, color: colors.text },
});
