import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { PageTitle, EmptyState, PrimaryButton } from '@/components/UI';
import { Icon } from '@/components/Icon';
import { ProductVisual } from '@/components/ProductVisual';
import { useOrdersStore } from '@/store/orders';
import { colors } from '@/config/theme';
export default function OrdersScreen() {
  const orders = useOrdersStore((s) => s.orders);
  return <Screen><PageTitle title="I miei ordini" subtitle="Ogni piccolo passo verso casa." />
    {!orders.length ? <EmptyState icon="box" title="Nessun ordine ancora" message="Quando farai il tuo primo ordine demo, lo ritroverai qui.">
      <PrimaryButton title="Esplora il catalogo" onPress={() => router.push('/catalog')} /></EmptyState>
    : orders.map((order) => <View key={order.id} style={styles.order}>
      <View style={styles.top}><View><Text style={styles.date}>{new Date(order.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</Text>
        <Text style={styles.orderId}>{order.id}</Text></View>
        <View style={styles.status}><View style={styles.statusDot} /><Text style={styles.statusText}>Confermato</Text></View></View>
      {!!order.lines?.length && <View style={styles.products}>{order.lines.slice(0, 3).map((line) =>
        <View key={line.product.id} style={styles.thumb}><ProductVisual id={line.product.id} inset={0.13} /></View>)}</View>}
      <View style={styles.totalRow}><Text style={styles.meta}>{order.itemCount} articoli · {order.totalWeightKg.toFixed(1)} kg</Text>
        <Text style={styles.total}>€{order.total.toFixed(2).replace('.', ',')}</Text></View>
      <View style={styles.fulfilment}><Icon name={order.fulfilment === 'store' ? 'store' : 'truck'} size={18} color={colors.green} />
        <Text style={styles.fulfilmentText}>{order.fulfilment === 'store' ? 'Ritiro in negozio · ' + (order.store ?? 'Arezzo')
          : order.fulfilment === 'pickup' ? 'Punto di ritiro demo' : 'Consegna a domicilio'}</Text></View>
      <View style={styles.timeline}><Step label="Ordine ricevuto" done /><Step label="Pagamento simulato" done />
        <Step label="Preparazione in negozio" /><Step label={order.fulfilment !== 'home' ? 'Pronto per il ritiro' : 'Spedito / in consegna'} last /></View>
    </View>)}
  </Screen>;
}
function Step({ label, done, last }: { label: string; done?: boolean; last?: boolean }) {
  return <View style={styles.step}><View style={styles.track}>{!last && <View style={[styles.connector, done && { backgroundColor: '#AEC29A' }]} />}
    <View style={[styles.dot, done && styles.dotDone]}>{done && <Icon name="check" color="#fff" size={10} />}</View></View>
    <Text style={[styles.stepText, done && { color: colors.text }]}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  order: { backgroundColor: '#fff', borderRadius: 20, padding: 19, marginBottom: 18, borderWidth: 1, borderColor: '#E8EBE3' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  date: { fontSize: 16, fontWeight: '500', color: colors.text }, orderId: { fontSize: 9, color: colors.muted, marginTop: 5 },
  status: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, backgroundColor: '#EBF1E5' },
  statusDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.green }, statusText: { color: colors.green, fontSize: 10 },
  products: { flexDirection: 'row', gap: 9, marginTop: 20 },
  thumb: { width: 66, height: 66, borderRadius: 11, backgroundColor: '#F1F2ED', overflow: 'hidden' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line },
  meta: { color: colors.muted, fontSize: 11 }, total: { fontSize: 21, fontWeight: '600', color: colors.text },
  fulfilment: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 17 },
  fulfilmentText: { fontSize: 11, color: colors.green, flex: 1 },
  timeline: { marginTop: 18 }, step: { flexDirection: 'row', gap: 12, minHeight: 34 },
  track: { width: 18, alignItems: 'center' }, connector: { position: 'absolute', top: 9, bottom: -2, width: 1, backgroundColor: colors.line },
  dot: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#EDF0E8', borderWidth: 1, borderColor: '#DCE2D4', alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.green, borderColor: colors.green },
  stepText: { fontSize: 11, lineHeight: 17, color: '#9BA291' },
});

