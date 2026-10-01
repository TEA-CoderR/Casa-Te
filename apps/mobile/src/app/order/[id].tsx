import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  FULFILMENT_LABELS, PAYMENT_STATUS_LABELS, formatEuro, formatShipping, formatWeight, friendlyError, orderStatusLabel,
} from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { OrderTimeline } from '@/components/OrderTimeline';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState, Loading, Notice, PrimaryButton, SecondaryButton, SectionTitle, SummaryRow } from '@/components/UI';
import { colors } from '@/config/theme';
import { cancelPendingOrder, fetchOrder, imageUrl, resumeCheckout } from '@/lib/api';
import { useStores } from '@/lib/hooks';
import { openCheckout } from '@/lib/payments';
import { useQuery, useRefetchOnFocus } from '@/lib/useQuery';
import { useCartStore } from '@/store/cart';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, loading, refetch } = useQuery(id ? `orders:${id}` : null, () => fetchOrder(id!));
  const { stores } = useStores();
  const add = useCartStore((s) => s.add);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useRefetchOnFocus(refetch);

  if (loading && !order) return <Screen stack><Loading /></Screen>;
  if (!order) return <Screen stack><EmptyState title="Ordine non trovato" message="Controlla di aver effettuato l'accesso." icon="search">
    <PrimaryButton title="I miei ordini" onPress={() => router.replace('/orders')} /></EmptyState></Screen>;

  const store = stores.find((s) => s.id === order.store_id);
  const pending = order.status === 'pending_payment' && new Date(order.expires_at) > new Date();
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await refetch(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  const reorder = () => { order.order_items.forEach((i) => i.product_id && add(i.product_id, i.quantity)); router.push('/cart'); };

  return <Screen stack maxWidth={720} onRefresh={refetch} refreshing={loading}>
    <Stack.Screen options={{ title: `Ordine ${order.order_number}` }} />
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.number}>{order.order_number}</Text>
        <Text style={styles.date}>{new Date(order.created_at).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })}</Text>
      </View>
      <View style={styles.badge}><Text style={styles.badgeText}>{orderStatusLabel(order.status, order.fulfilment)}</Text></View>
    </View>

    {pending && <Notice title="In attesa di pagamento" message="Completa il pagamento per confermare l'ordine.">
      <View style={{ gap: 8, marginTop: 6 }}>
        <PrimaryButton title={`Paga ${formatEuro(order.total_cents)}`} icon="card" loading={busy}
          onPress={() => act(async () => openCheckout(await resumeCheckout(order.id)))} />
        <SecondaryButton title="Annulla ordine" onPress={() => act(() => cancelPendingOrder(order.id))} disabled={busy} />
      </View>
    </Notice>}
    {order.payment_status === 'refunded' || order.payment_status === 'partially_refunded'
      ? <Notice tone="success" title={PAYMENT_STATUS_LABELS[order.payment_status]} message={`Importo rimborsato: ${formatEuro(order.refunded_cents)}. L'accredito può richiedere 5–10 giorni lavorativi.`} /> : null}
    {!!error && <Notice tone="error" message={error} />}

    <OrderTimeline order={order} events={order.order_events} />

    {order.tracking_number && <Pressable style={styles.tracking} disabled={!order.tracking_url}
      onPress={() => order.tracking_url && Linking.openURL(order.tracking_url)}>
      <Text style={styles.trackingText}>{order.carrier ?? 'Corriere'} · {order.tracking_number}</Text>
      {order.tracking_url && <Text style={[styles.trackingText, { textDecorationLine: 'underline' }]}>Traccia spedizione</Text>}
    </Pressable>}

    <SectionTitle>{FULFILMENT_LABELS[order.fulfilment]}</SectionTitle>
    {order.fulfilment === 'home' && order.shipping_address && <Text style={styles.block}>
      {order.shipping_address.full_name}{'\n'}{order.shipping_address.line1}{order.shipping_address.line2 ? `, ${order.shipping_address.line2}` : ''}{'\n'}
      {order.shipping_address.postal_code} {order.shipping_address.city} ({order.shipping_address.province})</Text>}
    {order.fulfilment === 'pickup' && order.pickup_point_snapshot && <Text style={styles.block}>
      {order.pickup_point_snapshot.name}{'\n'}{order.pickup_point_snapshot.address}, {order.pickup_point_snapshot.postal_code} {order.pickup_point_snapshot.city}</Text>}
    {order.fulfilment === 'store' && <Text style={styles.block}>
      {store?.name ?? 'Negozio'}{store?.address ? `\n${store.address}, ${store.city}` : ''}{store?.opening_hours ? `\nOrari: ${store.opening_hours}` : ''}
      {'\n'}Ritiro a nome di {order.customer_name}. Mostra il numero d'ordine in cassa.</Text>}
    {!!store?.phone && <Pressable onPress={() => Linking.openURL(`tel:${store.phone}`)}>
      <Text style={styles.link}>Contatta il negozio: {store.phone}</Text></Pressable>}

    <SectionTitle>Prodotti</SectionTitle>
    {order.order_items.map((item) => <View key={item.id} style={styles.item}>
      <View style={styles.thumb}><ProductImage uri={imageUrl(item.image_path)} sku={item.sku} label={item.name} inset={0.1} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemMeta}>{item.quantity} × {formatEuro(item.unit_price_cents)}</Text>
      </View>
      <Text style={styles.itemTotal}>{formatEuro(item.line_total_cents)}</Text>
    </View>)}

    <SectionTitle>Riepilogo</SectionTitle>
    <SummaryRow label="Prodotti" value={formatEuro(order.subtotal_cents)} />
    {order.discount_cents > 0 && <SummaryRow label={`Sconto ${order.coupon_code ?? ''}`} value={`-${formatEuro(order.discount_cents)}`} tone="green" />}
    <SummaryRow label="Spedizione" value={formatShipping(order.shipping_cents)} />
    <SummaryRow label="Peso" value={formatWeight(order.total_weight_g)} />
    <SummaryRow label="Totale (IVA inclusa)" value={formatEuro(order.total_cents)} strong />
    <SummaryRow label="Pagamento" value={PAYMENT_STATUS_LABELS[order.payment_status]} />

    <View style={{ marginTop: 24, gap: 10 }}>
      {order.status !== 'pending_payment' && <SecondaryButton title="Ordina di nuovo" icon="bag" onPress={reorder} />}
      <Text style={styles.fine}>Per resi o assistenza contatta il negozio indicando il numero d'ordine. Diritto di recesso entro 14 giorni dalla consegna.</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  number: { fontSize: 22, fontWeight: '600', color: colors.text },
  date: { fontSize: 12, color: colors.muted, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#EBF1E5' },
  badgeText: { color: colors.green, fontSize: 12, fontWeight: '600' },
  tracking: { marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 4 },
  trackingText: { color: colors.green, fontSize: 13, fontWeight: '500' },
  block: { fontSize: 13, lineHeight: 21, color: colors.text },
  link: { color: colors.green, marginTop: 10, fontWeight: '500' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#F1F2ED', overflow: 'hidden' },
  itemName: { fontSize: 13, color: colors.text, fontWeight: '500' },
  itemMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  itemTotal: { fontSize: 14, fontWeight: '600', color: colors.text },
  fine: { fontSize: 12, color: colors.muted, lineHeight: 17 },
});
