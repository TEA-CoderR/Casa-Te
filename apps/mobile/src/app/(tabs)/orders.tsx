import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { FULFILMENT_LABELS, orderStatusLabel, orderTimeline } from '@casa-te/shared';
import { formatEuro } from '@/lib/price';
import { Screen } from '@/components/Screen';
import { BrandHeader, HeaderBack } from '@/components/BrandHeader';
import { colors as palette } from '@/config/theme';
import { EmptyState, Loading, Notice, orderStatusTone, PageTitle, PrimaryButton, StatusMark } from '@/components/UI';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { OrderTimeline } from '@/components/OrderTimeline';
import { colors, fonts } from '@/config/theme';
import { fetchOrders, imageUrl, type OrderWithItems } from '@/lib/api';
import { useLayout, useStores } from '@/lib/hooks';
import { useQuery, useRefetchOnFocus } from '@/lib/useQuery';
import { useUser } from '@/store/session';
import { ALL_PRODUCTS } from '@/lib/links';

export default function OrdersScreen() {
  const phone = !useLayout().wide;
  // Phones: the green band with a way back (these pages open from the header heart and Profilo).
  const band = phone ? <BrandHeader title="I miei ordini" titleSize={28} left={<HeaderBack onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} />} /> : undefined;
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const { stores } = useStores();
  const page = phone ? { header: band, ground: palette.page } : {};
  const user = useUser();
  const { data: orders, loading, error, refetch } = useQuery<OrderWithItems[]>(user ? `orders:list:${user.id}` : null, fetchOrders);
  useRefetchOnFocus(refetch);

  if (!user) return <Screen {...page}>{!phone && <PageTitle title="I miei ordini" />}
    <EmptyState icon="user" title="Accedi per vedere i tuoi ordini" message="Segui lo stato delle consegne e dei ritiri in negozio.">
      <PrimaryButton title="Accedi o registrati" onPress={() => router.push({ pathname: '/auth/sign-in', params: { next: '/orders' } })} />
    </EmptyState></Screen>;

  // Phone (design F, F-Ordini): "In corso" / "Completati" switch and one white card per order.
  if (phone && orders?.length) {
    const DONE = new Set(['completed', 'cancelled']);
    const list = orders.filter((o) => tab === 'done' ? DONE.has(o.status) : !DONE.has(o.status));
    const euro = (c: number) => formatEuro(c).replace(/€\s/, '€');
    return <Screen header={band} ground={palette.page} onRefresh={refetch} refreshing={loading && !!orders} contentContainerStyle={{ padding: 16, paddingTop: 10 }}>
      <View style={styles.seg} accessibilityRole="tablist">
        {([['active', 'In corso'], ['done', 'Completati']] as const).map(([k, label]) => <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab"
          accessibilityState={{ selected: tab === k }} style={[styles.segItem, tab === k && styles.segOn]}><Text style={styles.segText}>{label}</Text></Pressable>)}
      </View>
      {!list.length && <Text style={styles.none}>{tab === 'done' ? 'Nessun ordine completato.' : 'Nessun ordine in corso.'}</Text>}
      <View style={{ gap: 10, marginTop: 12 }}>{list.map((order) => {
        const n = order.order_items.reduce((s, i) => s + i.quantity, 0);
        const steps = orderTimeline(order.fulfilment);
        const at = steps.indexOf(order.status);
        const ready = order.status === 'ready';
        const done = DONE.has(order.status);
        const storeName = stores.find((x) => x.id === order.store_id)?.name.replace(/^CASA & TE\s*/, '').replace(/^(\S+)\s+(?!·)/, '$1 · ');
        return <Pressable key={order.id} onPress={() => router.push(`/order/${order.id}`)} accessibilityRole="link" style={styles.pOrder}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.pDate}>{new Date(order.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
              <Text style={styles.pNum}>{order.order_number} · {n} {n === 1 ? 'articolo' : 'articoli'}</Text>
            </View>
            <StatusMark label={orderStatusLabel(order.status, order.fulfilment)} tone={orderStatusTone(order.status)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>{order.order_items.slice(0, 5).map((line) =>
            <View key={line.id} style={styles.pThumb}><View style={{ width: 46, height: 46 }}><ProductImage uri={imageUrl(line.image_path)} sku={line.sku} inset={0} /></View></View>)}</View>
          {order.status !== 'cancelled' && order.status !== 'pending_payment' && <View style={styles.pBars}>{[0, 1, 2, 3].map((i) =>
            <View key={i} style={[styles.pBar, (done || at >= Math.round(i * (steps.length - 1) / 3)) && { backgroundColor: colors.green }]} />)}</View>}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
              <Icon name={order.fulfilment === 'store' ? 'store' : 'truck'} size={17} color={colors.green} strokeWidth={2} />
              <Text style={styles.pWhere} numberOfLines={1}>{order.fulfilment === 'store' ? `Ritiro a ${storeName ?? 'negozio'}` : FULFILMENT_LABELS[order.fulfilment]}</Text>
            </View>
            <Text style={styles.pTotal}>{euro(order.total_cents)}</Text>
          </View>
        </Pressable>;
      })}</View>
    </Screen>;
  }

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
          <StatusMark label={orderStatusLabel(order.status, order.fulfilment)} tone={orderStatusTone(order.status)} /></View>
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
  seg: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: colors.well },
  segItem: { flex: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: '#FFFFFF', shadowColor: '#18201A', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segText: { fontSize: 14.5, fontFamily: fonts.sansBold, color: colors.text },
  none: { fontSize: 14.5, fontFamily: fonts.sans, color: colors.muted, textAlign: 'center', marginTop: 32 },
  pOrder: { padding: 16, borderRadius: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: colors.line },
  pDate: { fontSize: 16, fontFamily: fonts.heavy, color: colors.text },
  pNum: { fontSize: 13, fontFamily: fonts.sans, color: colors.muted, marginTop: 2 },
  pThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFECE3', alignItems: 'center', justifyContent: 'center' },
  pBars: { flexDirection: 'row', gap: 4, marginTop: 14 },
  pBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.line },
  pWhere: { fontSize: 13.5, fontFamily: fonts.sansBold, color: colors.green, flexShrink: 1 },
  pTotal: { fontSize: 18, fontFamily: fonts.heavy, color: colors.text },
  order: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 10 },
  bars: { flexDirection: 'row', gap: 4, marginTop: 14 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.line },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  date: { fontSize: 16, fontFamily: fonts.heavy, color: colors.text }, orderId: { fontSize: 13, color: colors.muted, marginTop: 3, fontFamily: fonts.sansMedium },
  products: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFECE3', overflow: 'hidden' },
  more: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  meta: { color: colors.muted, fontSize: 13, fontFamily: fonts.sansMedium }, total: { fontSize: 18, fontFamily: fonts.heavy, color: colors.text },
  fulfilment: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  fulfilmentText: { fontSize: 13.5, color: colors.green, flex: 1, fontFamily: fonts.sansBold },
});
