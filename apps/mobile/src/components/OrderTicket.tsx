import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FULFILMENT_LABELS, orderTimeline } from '@casa-te/shared';
import { colors, radius, type } from '@/config/theme';
import { formatEuro } from '@/lib/price';
import { imageUrl, type OrderWithItems } from '@/lib/api';
import { customerOrderStatus } from '@/lib/orderText';
import { Icon } from './Icon';
import { ProductImage } from './ProductImage';

const DONE = new Set(['completed', 'cancelled']);

/**
 * The order as a ticket (plan §5.4), the same on Home, the order list and the order page:
 * lime while in progress, a quiet sage once finished (cancelled: muted ink and the total struck through).
 * `compact` shows the status, one line and the progress; `full` adds a white stub under a torn line (`stub`: the code).
 */
export function OrderTicket({ order, storeName, variant = 'compact', thumbs, onPress, stub, style }: {
  order: OrderWithItems; storeName?: string | null; variant?: 'compact' | 'full'; thumbs?: boolean;
  onPress?: () => void; stub?: ReactNode; style?: object;
}) {
  const finished = DONE.has(order.status);
  const cancelled = order.status === 'cancelled';
  const ink = cancelled ? colors.muted : colors.band;
  const steps = orderTimeline(order.fulfilment);
  const at = steps.indexOf(order.status);
  const n = order.order_items.reduce((s, i) => s + i.quantity, 0);
  const date = new Date(order.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  // "Lucca S. Filippo" → "S. Filippo": the line has to fit the total on one row.
  const shortStore = storeName ? storeName.match(/^\S+\s+(.+)$/)?.[1] ?? storeName : 'negozio';
  const place = order.fulfilment === 'store' ? `Ritiro a ${shortStore}` : FULFILMENT_LABELS[order.fulfilment];
  const full = variant === 'full' && !!stub;
  const status = customerOrderStatus(order.status, order.fulfilment);
  const top = <View style={[styles.top, finished && styles.done]}>
    <View style={styles.head}>
      <Text style={[styles.kicker, { color: ink }]} numberOfLines={1}>ORDINE {order.order_number}</Text>
      {onPress ? <Icon name="chevron" size={18} color={ink} strokeWidth={2.4} /> : <Text style={[styles.date, { color: ink }]}>{date}</Text>}
    </View>
    <Text style={[styles.status, { color: ink }]} numberOfLines={1} accessibilityRole="header">{status}</Text>
    {/* The full ticket sits over the order's details, which say store, total and items. */}
    {!full && <Text style={[styles.sub, { color: ink }]} numberOfLines={1}>
      {onPress ? `${date} · ` : ''}{place} · {n} {n === 1 ? 'articolo' : 'articoli'} · <Text
        style={cancelled ? { textDecorationLine: 'line-through' } : undefined}>{formatEuro(order.total_cents).replace(/€\s/, '€')}</Text></Text>}
    {thumbs && <View style={[styles.thumbs, cancelled && { opacity: 0.5 }]}>{order.order_items.slice(0, 5).map((line) =>
      <View key={line.id} style={styles.thumb}><View style={{ width: 38, height: 38 }}>
        <ProductImage uri={imageUrl(line.image_path)} sku={line.sku} inset={0} /></View></View>)}
      {order.order_items.length > 5 && <Text style={[styles.more, { color: ink }]}>+{order.order_items.length - 5}</Text>}</View>}
    {!cancelled && order.status !== 'pending_payment' && <View style={styles.bars}>{[0, 1, 2, 3].map((i) =>
      <View key={i} style={[styles.bar, (finished || at >= Math.round(i * (steps.length - 1) / 3)) && styles.barOn]} />)}</View>}
  </View>;
  const body = full ? <>
    {top}
    <View style={styles.tear}><View style={[styles.notch, { left: -12 }]} /><View style={styles.tearLine} /><View style={[styles.notch, { right: -12 }]} /></View>
    <View style={styles.stub}>{stub}</View>
  </> : top;
  const shell: object[] = [styles.ticket, finished ? styles.ticketDone : {}, full ? { backgroundColor: '#FFFFFF' } : {}, style ?? {}];
  if (!onPress) return <View style={shell} accessible accessibilityLabel={`${status}. Ordine ${order.order_number}`}>{body}</View>;
  return <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={`${status}. Ordine ${order.order_number}, ${date}`}
    style={({ pressed }) => [...shell, pressed && { transform: [{ scale: 0.985 }] }]}>{body}</Pressable>;
}

const styles = StyleSheet.create({
  ticket: { borderRadius: radius.lg, backgroundColor: colors.bandLogo, overflow: 'hidden',
    shadowColor: '#143019', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  ticketDone: { backgroundColor: '#E4EADF', shadowOpacity: 0.08 }, // ui-check: allow (finished orders: the ticket's quiet sage)
  top: { paddingTop: 16, paddingBottom: 18, paddingHorizontal: 18, backgroundColor: colors.bandLogo },
  done: { backgroundColor: '#E4EADF' }, // ui-check: allow (finished orders: the ticket's quiet sage)
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { ...type.kicker, flexShrink: 1 },
  date: { ...type.small, fontFamily: type.cardTitle.fontFamily, opacity: 0.75 },
  status: { ...type.ticket, marginTop: 6 },
  sub: { ...type.small, fontFamily: type.cardTitle.fontFamily, opacity: 0.8, marginTop: 2 },
  thumbs: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  more: { ...type.micro, fontSize: 13, marginLeft: 4 },
  bars: { flexDirection: 'row', gap: 4, marginTop: 14 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(31,65,39,0.16)' },
  barOn: { backgroundColor: colors.band },
  tear: { height: 24, justifyContent: 'center', backgroundColor: '#FFFFFF' },
  tearLine: { marginHorizontal: 22, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.line },
  notch: { position: 'absolute', top: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.page },
  stub: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20, alignItems: 'center', backgroundColor: '#FFFFFF' },
});
