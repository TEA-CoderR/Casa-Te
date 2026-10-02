import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { FULFILMENT_LABELS, orderStatusLabel } from '@casa-te/shared';
import { formatEuro } from '@/lib/price';
import { Screen } from '@/components/Screen';
import { EmptyState, Loading, Notice, PageTitle, PrimaryButton } from '@/components/UI';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { OrderTimeline } from '@/components/OrderTimeline';
import { colors } from '@/config/theme';
import { fetchOrders, imageUrl, type OrderWithItems } from '@/lib/api';
import { useQuery, useRefetchOnFocus } from '@/lib/useQuery';
import { useUser } from '@/store/session';

export default function OrdersScreen() {
  const user = useUser();
  const { data: orders, loading, error, refetch } = useQuery<OrderWithItems[]>(user ? `orders:list:${user.id}` : null, fetchOrders);
  useRefetchOnFocus(refetch);

  if (!user) return <Screen><PageTitle title="I miei ordini" />
    <EmptyState icon="user" title="Accedi per vedere i tuoi ordini" message="Segui lo stato delle consegne e dei ritiri in negozio.">
      <PrimaryButton title="Accedi o registrati" onPress={() => router.push({ pathname: '/auth/sign-in', params: { next: '/orders' } })} />
    </EmptyState></Screen>;

  return <Screen onRefresh={refetch} refreshing={loading && !!orders}>
    <PageTitle title="I miei ordini" subtitle="Ogni piccolo passo verso casa." />
    {error && !orders ? <Notice tone="error" message="Impossibile caricare gli ordini. Trascina verso il basso per riprovare." />
      : !orders ? <Loading />
      : !orders.length ? <EmptyState icon="box" title="Nessun ordine ancora" message="Quando farai il tuo primo ordine, lo ritroverai qui.">
          <PrimaryButton title="Esplora il catalogo" onPress={() => router.push('/catalog')} /></EmptyState>
      : orders.map((order) => <Pressable key={order.id} style={styles.order} accessibilityRole="button"
          onPress={() => router.push(`/order/${order.id}`)}>
        <View style={styles.top}><View style={{ flex: 1 }}>
          <Text style={styles.date}>{new Date(order.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          <Text style={styles.orderId}>{order.order_number}</Text></View>
          <View style={[styles.status, order.status === 'pending_payment' && { backgroundColor: '#FFF4D6' }]}>
            <View style={styles.statusDot} /><Text style={styles.statusText}>{orderStatusLabel(order.status, order.fulfilment)}</Text></View></View>
        <View style={styles.products}>{order.order_items.slice(0, 4).map((line) =>
          <View key={line.id} style={styles.thumb}><ProductImage uri={imageUrl(line.image_path)} sku={line.sku} inset={0.13} /></View>)}
          {order.order_items.length > 4 && <Text style={styles.more}>+{order.order_items.length - 4}</Text>}</View>
        <View style={styles.totalRow}><Text style={styles.meta}>{order.order_items.reduce((s, i) => s + i.quantity, 0)} articoli</Text>
          <Text style={styles.total}>{formatEuro(order.total_cents)}</Text></View>
        <View style={styles.fulfilment}><Icon name={order.fulfilment === 'store' ? 'store' : 'truck'} size={18} color={colors.green} />
          <Text style={styles.fulfilmentText}>{FULFILMENT_LABELS[order.fulfilment]}</Text><Icon name="chevron" size={16} color={colors.muted} /></View>
        {order.status !== 'pending_payment' && <OrderTimeline order={order} />}
      </Pressable>)}
  </Screen>;
}

const styles = StyleSheet.create({
  order: { backgroundColor: '#fff', borderRadius: 20, padding: 19, marginBottom: 18, borderWidth: 1, borderColor: '#E8EBE3' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  date: { fontSize: 16, fontWeight: '500', color: colors.text }, orderId: { fontSize: 12, color: colors.muted, marginTop: 5 },
  status: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, backgroundColor: '#EBF1E5' },
  statusDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.green }, statusText: { color: colors.green, fontSize: 12 },
  products: { flexDirection: 'row', gap: 9, marginTop: 20, alignItems: 'center' },
  thumb: { width: 60, height: 60, borderRadius: 11, backgroundColor: '#F1F2ED', overflow: 'hidden' },
  more: { color: colors.muted, fontSize: 12 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line },
  meta: { color: colors.muted, fontSize: 12 }, total: { fontSize: 21, fontWeight: '600', color: colors.text },
  fulfilment: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 17 },
  fulfilmentText: { fontSize: 12, color: colors.green, flex: 1 },
});
