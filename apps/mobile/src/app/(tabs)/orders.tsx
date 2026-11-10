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

  // Phone (November 2026): the "In corso" / "Completati" switch; orders in progress as lime tickets (as on Home),
  // the finished ones as a plain list on hairlines.
  if (phone && orders?.length) {
    const DONE = new Set(['completed', 'cancelled']);
    const live = orders.filter((o) => !DONE.has(o.status));
    const past = orders.filter((o) => DONE.has(o.status));
    const euro = (c: number) => formatEuro(c).replace(/€\s/, '€');
    const count = (o: OrderWithItems) => o.order_items.reduce((s, i) => s + i.quantity, 0);
    const date = (o: OrderWithItems, year = true) => new Date(o.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}) });
    const place = (o: OrderWithItems) => o.fulfilment === 'store'
      ? `Ritiro a ${stores.find((x) => x.id === o.store_id)?.name.replace(/^CASA & TE\s*/, '') ?? 'negozio'}` : FULFILMENT_LABELS[o.fulfilment];
    return <Screen header={band} ground={palette.page} onRefresh={refetch} refreshing={loading && !!orders} contentContainerStyle={{ padding: 16, paddingTop: 18 }}>
      <View style={styles.seg} accessibilityRole="tablist">
        {([['active', 'In corso', live.length], ['done', 'Completati', past.length]] as const).map(([k, label, n]) => <Pressable key={k} onPress={() => setTab(k)}
          accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={[styles.segItem, tab === k && styles.segOn]}>
          <Text style={styles.segText}>{label}{n ? ` · ${n}` : ''}</Text></Pressable>)}
      </View>
      {tab === 'active' && !live.length && <Text style={styles.none}>Nessun ordine in corso.</Text>}
      {tab === 'done' && !past.length && <Text style={styles.none}>Nessun ordine completato.</Text>}
      {/* The same ticket on both tabs: lime while in progress, a quiet neutral once finished (greyed text if cancelled). */}
      <View style={{ gap: 12, marginTop: 16 }}>{(tab === 'active' ? live : past).map((order) => {
        const steps = orderTimeline(order.fulfilment);
        const at = steps.indexOf(order.status);
        const n = count(order);
        const finished = DONE.has(order.status);
        const cancelled = order.status === 'cancelled';
        const ink = cancelled ? colors.muted : colors.band;
        return <Pressable key={order.id} onPress={() => router.push(`/order/${order.id}`)} accessibilityRole="link"
          style={({ pressed }) => [styles.ticket, finished && styles.ticketDone, pressed && { transform: [{ scale: 0.985 }] }]}>
          <View style={styles.ticketTop}>
            <Text style={[styles.ticketKicker, { color: ink }]} numberOfLines={1}>ORDINE {order.order_number}</Text>
            <Text style={[styles.ticketDate, { color: ink }]}>{date(order, false)}</Text>
          </View>
          <Text style={[styles.ticketTitle, { color: ink }]} numberOfLines={1}>
            {order.status === 'ready' && order.fulfilment === 'store' ? 'Pronto al ritiro' : orderStatusLabel(order.status, order.fulfilment)}</Text>
          <Text style={[styles.ticketSub, { color: ink }]} numberOfLines={1}>{place(order)} · {n} {n === 1 ? 'articolo' : 'articoli'} · <Text
            style={cancelled ? { textDecorationLine: 'line-through' } : undefined}>{euro(order.total_cents)}</Text></Text>
          <View style={[styles.ticketThumbs, cancelled && { opacity: 0.5 }]}>{order.order_items.slice(0, 5).map((line) =>
            <View key={line.id} style={styles.ticketThumb}><View style={{ width: 38, height: 38 }}>
              <ProductImage uri={imageUrl(line.image_path)} sku={line.sku} inset={0} /></View></View>)}
            {order.order_items.length > 5 && <Text style={[styles.ticketMore, { color: ink }]}>+{order.order_items.length - 5}</Text>}</View>
          {!cancelled && order.status !== 'pending_payment' && <View style={styles.bars}>{[0, 1, 2, 3].map((i) =>
            <View key={i} style={[styles.bar, (finished || at >= Math.round(i * (steps.length - 1) / 3)) && styles.barOn]} />)}</View>}
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
  none: { fontSize: 15, fontFamily: fonts.sans, color: colors.muted, textAlign: 'center', marginTop: 32 },
  // In progress: the lime ticket (the logo's colours reversed), as on Home.
  ticket: { padding: 18, paddingBottom: 20, borderRadius: 22, backgroundColor: colors.bandLogo,
    shadowColor: '#143019', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  ticketKicker: { flexShrink: 1, fontSize: 11.5, letterSpacing: 2, fontFamily: fonts.sansBold, color: colors.band },
  ticketDate: { fontSize: 13, fontFamily: fonts.sansSemiBold, color: colors.band, opacity: 0.75 },
  ticketTitle: { fontSize: 26, lineHeight: 31, letterSpacing: -0.7, fontFamily: fonts.display, color: colors.band, marginTop: 8 },
  ticketSub: { fontSize: 14, fontFamily: fonts.sansMedium, color: colors.band, opacity: 0.8, marginTop: 2 },
  ticketThumbs: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  ticketThumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  ticketMore: { fontSize: 13, fontFamily: fonts.sansBold, color: colors.band, marginLeft: 4 },
  barOn: { backgroundColor: colors.band },
  // Finished: the same ticket in a quiet sage instead of the lime.
  ticketDone: { backgroundColor: '#E4EADF', shadowOpacity: 0.08 }, // ui-check: allow (finished orders: the ticket's quiet colour)
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, borderBottomWidth: 1, borderColor: '#ECECE7' },
  pastDate: { fontSize: 17, letterSpacing: -0.2, fontFamily: fonts.sansSemiBold, color: colors.text },
  pastMeta: { fontSize: 13, fontFamily: fonts.sans, color: colors.muted, marginTop: 2 },
  pastTotal: { fontSize: 16, fontFamily: fonts.sansBold, color: colors.text },
  order: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.line },
  bars: { flexDirection: 'row', gap: 4, marginTop: 14 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(31,65,39,0.16)' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  date: { fontSize: 16, fontFamily: fonts.heavy, color: colors.text }, orderId: { fontSize: 13, color: colors.muted, marginTop: 3, fontFamily: fonts.sansMedium },
  products: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EDEDE9', overflow: 'hidden' },
  more: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  meta: { color: colors.muted, fontSize: 13, fontFamily: fonts.sansMedium }, total: { fontSize: 18, fontFamily: fonts.heavy, color: colors.text },
  fulfilment: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  fulfilmentText: { fontSize: 13.5, color: colors.green, flex: 1, fontFamily: fonts.sansBold },
});
