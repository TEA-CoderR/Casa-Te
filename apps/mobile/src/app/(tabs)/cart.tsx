import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ProductVisual } from '@/components/ProductVisual';
import { PageTitle, PrimaryButton, QuantityControl, EmptyState } from '@/components/UI';
import { Icon } from '@/components/Icon';
import { colors } from '@/config/theme';
import { getCartSnapshot, useCartStore } from '@/store/cart';
import { calculateShipping, shippingLabel, FREE_SHIPPING_THRESHOLD, FREE_SHIPPING_MAX_WEIGHT_KG } from '@/config/shipping';
export default function CartScreen() {
  const items = useCartStore((s) => s.items);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);
  const { lines, subtotal, totalWeightKg, itemCount } = getCartSnapshot(items);
  const shipping = calculateShipping({ subtotal, weightKg: totalWeightKg, method: 'home' });
  const overweight = totalWeightKg > FREE_SHIPPING_MAX_WEIGHT_KG;
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  if (!lines.length) return <Screen><PageTitle title="Carrello" /><EmptyState title="Il carrello è vuoto"
    message="La tua casa aspetta nuove idee. Inizia da un piccolo essenziale.">
    <PrimaryButton title="Vai al catalogo" onPress={() => router.push('/catalog')} />
  </EmptyState></Screen>;
  return <Screen footer={<View style={styles.footer}>
    <View style={styles.footerTotal}><Text style={styles.small}>Subtotale</Text><Text style={styles.total}>€{subtotal.toFixed(2).replace('.', ',')}</Text></View>
    <View style={{ flex: 1 }}><PrimaryButton title="Vai al checkout" onPress={() => router.push('/checkout')} /></View>
  </View>}>
    <PageTitle title="Carrello" subtitle={itemCount + ' articoli'} />
    <View style={styles.shippingNote}><View style={styles.noteHeading}><Icon name="truck" color={colors.green} size={20} />
      <Text style={styles.noteTitle}>{overweight ? 'Il tuo ordine supera 10 kg' : remaining === 0 ? 'Spedizione gratuita raggiunta!' : 'La spedizione gratuita è vicina'}</Text></View>
      <Text style={styles.noteText}>{overweight ? 'Oltre 10 kg: tariffa provvisoria demo. Ritiro in negozio sempre gratuito.'
        : remaining ? `Mancano €${remaining.toFixed(2).replace('.', ',')} alla spedizione gratuita (fino a 10 kg).` : 'Per il tuo ordine fino a 10 kg, la consegna è gratis.'}</Text>
      {!overweight && <View style={styles.progress}><View style={[styles.progressValue, { width: `${Math.min(100, subtotal / FREE_SHIPPING_THRESHOLD * 100)}%` }]} /></View>}
    </View>
    {lines.map(({ product, quantity }) => <View key={product.id} style={styles.line}>
      <View style={styles.thumb}><ProductVisual id={product.id} label={product.name} inset={0.1} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.meta}>{product.weightKg.toFixed(1)} kg cad. · Demo</Text>
        <Text style={styles.linePrice}>€{(product.price * quantity).toFixed(2).replace('.', ',')}</Text>
        <View style={styles.lineBottom}><QuantityControl value={quantity} label={product.name} onChange={(q) => setQuantity(product.id, q)} />
          <Pressable onPress={() => remove(product.id)} style={styles.remove}><Text style={styles.removeText}>Rimuovi</Text></Pressable></View>
      </View>
    </View>)}
    <Text style={styles.sectionTitle}>Riepilogo</Text>
    <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotale</Text><Text style={styles.summaryValue}>€{subtotal.toFixed(2).replace('.', ',')}</Text></View>
    <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Peso ordine</Text><Text style={styles.summaryValue}>{totalWeightKg.toFixed(1)} kg</Text></View>
    <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Consegna a domicilio</Text><Text style={styles.summaryValue}>{shippingLabel(shipping)}</Text></View>
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
  linePrice: { fontSize: 17, fontWeight: '600', color: colors.text, marginTop: 8 },
  lineBottom: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 12 },
  remove: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  removeText: { color: colors.muted, fontSize: 10, textDecorationLine: 'underline' },
  sectionTitle: { fontSize: 19, fontWeight: '600', letterSpacing: -0.4, marginTop: 25, marginBottom: 14, color: colors.text },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, gap: 12 },
  summaryLabel: { color: colors.muted, fontSize: 13, flex: 1 },
  summaryValue: { color: colors.text, fontSize: 13, fontWeight: '500' },
  pickup: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  pickupText: { flex: 1, color: colors.green, fontSize: 12, lineHeight: 19 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  footerTotal: { minWidth: 73 }, small: { color: colors.muted, fontSize: 10 },
  total: { fontSize: 23, fontWeight: '600', letterSpacing: -0.6, marginTop: 3, color: colors.text },
});

