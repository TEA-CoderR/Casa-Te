import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { FULFILMENT_LABELS, orderStatusLabel, orderTimeline } from '@casa-te/shared';
import { formatEuro } from '@/lib/price';
import { Screen } from '@/components/Screen';
import { BrandHeader, HeaderBack } from '@/components/BrandHeader';
import { colors as palette } from '@/config/theme';
import { EmptyState, Loading, Notice, PageTitle, PrimaryButton } from '@/components/UI';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { OrderTimeline } from '@/components/OrderTimeline';
import { colors, fonts } from '@/config/theme';
import { fetchOrders, imageUrl, type OrderWithItems } from '@/lib/api';
import { useLayout } from '@/lib/hooks';
import { useQuery, useRefetchOnFocus } from '@/lib/useQuery';
import { useUser } from '@/store/session';
import { ALL_PRODUCTS } from '@/lib/links';

export default function OrdersScreen() {
  const phone = !useLayout().wide;
  // Phones: the green band with a way back (these pages open from the header heart and Profilo).
  const band = phone ? <BrandHeader title="I miei ordini" left={<HeaderBack onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} />} /> : undefined;
  const page = phone ? { header: band, ground: palette.page } : {};
  const user = useUser();
  const { data: orders, loading, error, refetch } = useQuery<OrderWithItems[]>(user ? `orders:list:${user.id}` : null, fetchOrders);
  useRefetchOnFocus(refetch);

  if (!user) return <Screen {...page}>{!phone && <PageTitle title="I miei ordini" />}
    <EmptyState icon="user" title="Accedi per vedere i tuoi ordini" message="Segui lo stato delle consegne e dei ritiri in negozio.">
      <PrimaryButton title="Accedi o registrati" onPress={() => router.push({ pathname: '/auth/sign-in', params: { next: '/orders' } })} />
    </EmptyState></Screen>;

  return <Screen {...page} onRefresh={refetch} refreshing={loading && !!orders}>
    {!phone && <PageTitle title="I miei ordini" subtitle="Ogni piccolo passo verso casa." />}
    {error && !orders ? <Notice tone="error" message="Impossibile caricare gli ordini. Trascina verso il basso per riprovare." />
      : !orders ? <Loading />
      : !orders.length ? <EmptyState icon="box" title="Nessun ordine ancora" message="Quando farai il tuo primo ordine, lo ritroverai qui.">
          <PrimaryButton title="Esplora il catalogo" onPress={() => router.push(ALL_PRODUCTS)} /></EmptyState>
      : orders.map((order) => <Pressable key={order.id} style={styles.order} accessibilityRole="button"
          onPress={() => router.push(`/order/${order.id}`)}>
        <View style={styles.top}><View style={{ flex: 1 }}>
          <Text style={styles.date}>{new Date(order.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          <Text style={styles.orderId}>{order.order_number}</Text></View>
          <View style={[styles.status, order.status === 'ready' && { backgroundColor: colors.yellow }, order.status === 'pending_payment' && { backgroundColor: '#FFF4D6' },
            (order.status === 'completed' || order.status === 'cancelled') && { backgroundColor: colors.well }]}>
            <View style={[styles.statusDot, order.status === 'ready' && { backgroundColor: colors.text }]} />
            <Text style={[styles.statusText, order.status === 'ready' && { color: colors.text }]}>{orderStatusLabel(order.status, order.fulfilment)}</Text></View></View>
        <View style={styles.products}>{order.order_items.slice(0, 4).map((line) =>
          <View key={line.id} style={styles.thumb}><ProductImage uri={imageUrl(line.image_path)} sku={line.sku} inset={0.13} /></View>)}
          {order.order_items.length > 4 && <Text style={styles.more}>+{order.order_items.length - 4}</Text>}</View>
        <View style={styles.totalRow}><Text style={styles.meta}>{order.order_items.reduce((s, i) => s + i.quantity, 0)} articoli</Text>
          <Text style={styles.total}>{formatEuro(order.total_cents)}</Text></View>
        <View style={styles.fulfilment}><Icon name={order.fulfilment === 'store' ? 'store' : 'truck'} size={18} color={colors.green} />
          <Text style={styles.fulfilmentText}>{FULFILMENT_LABELS[order.fulfilment]}</Text><Icon name="chevron" size={16} color={colors.muted} /></View>
        {order.status !== 'pending_payment' && (phone
          ? order.status !== 'cancelled' && <View style={styles.bars}>{orderTimeline(order.fulfilment).map((step, i, steps) =>
              <View key={step} style={[styles.bar, steps.indexOf(order.status) >= i && { backgroundColor: colors.green }]} />)}</View>
          : <OrderTimeline order={order} />)}
      </Pressable>)}
  </Screen>;
}

const styles = StyleSheet.create({
  order: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 10 },
  bars: { flexDirection: 'row', gap: 4, marginTop: 14 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.line },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  date: { fontSize: 16, fontFamily: fonts.heavy, color: colors.text }, orderId: { fontSize: 13, color: colors.muted, marginTop: 3, fontFamily: fonts.sansMedium },
  status: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: colors.mint },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green }, statusText: { color: colors.green, fontSize: 12.5, fontFamily: fonts.heavy },
  products: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFECE3', overflow: 'hidden' },
  more: { color: colors.muted, fontSize: 12 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  meta: { color: colors.muted, fontSize: 13, fontFamily: fonts.sansMedium }, total: { fontSize: 18, fontFamily: fonts.heavy, color: colors.text },
  fulfilment: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  fulfilmentText: { fontSize: 13.5, color: colors.green, flex: 1, fontFamily: fonts.sansBold },
});
