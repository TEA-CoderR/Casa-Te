// Returns of an order (resi e assistenza): the requests with their status and code, and the way to ask for one.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  RETURN_GUARANTEE_DAYS, RETURN_REASON_LABELS, RETURN_STATUS_LABELS, RETURN_WINDOW_DAYS, REFUND_METHOD_LABELS,
  daysSinceHandover, friendlyError, returnableQuantities, type OrderItemRow, type OrderRow, type ReturnWithItems,
} from '@casa-te/shared';
import { Barcode } from '@/components/Barcode';
import { Icon } from '@/components/Icon';
import { Notice, StatusMark } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { cancelReturnRequest, fetchOrderReturns } from '@/lib/api';
import { formatEuro } from '@/lib/price';
import { useQuery, useRefetchOnFocus } from '@/lib/useQuery';

const STATUS_TEXT: Record<string, string> = {
  requested: 'Il negozio valuta la richiesta e ti risponde via email, di solito entro 2 giorni lavorativi.',
  approved: 'Porta gli articoli nel negozio dell’ordine e mostra questo codice alla cassa.',
  received: 'Abbiamo ricevuto gli articoli: completiamo il rimborso o il cambio a breve.',
  exchanged: 'Hai ricevuto il prodotto sostitutivo.',
  cancelled: 'Hai annullato questa richiesta.',
};

export function OrderReturns({ order }: { order: OrderRow & { order_items: OrderItemRow[] } }) {
  const returns = useQuery(`returns:${order.id}`, () => fetchOrderReturns(order.id));
  useRefetchOnFocus(returns.refetch);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const list = returns.data ?? [];
  const days = daysSinceHandover(order);
  const left = returnableQuantities(order.order_items, list);
  const canAsk = days !== null && days <= RETURN_GUARANTEE_DAYS && Object.values(left).some((q) => q > 0);
  const names = new Map(order.order_items.map((i) => [i.id, i.name]));

  const cancel = async (id: string) => {
    setBusy(id); setError('');
    try { await cancelReturnRequest(id); await returns.refetch(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  };

  if (days === null && !list.length) return null;
  return <View style={styles.wrap}>
    <Text style={styles.title} accessibilityRole="header">Resi e assistenza</Text>
    {!!error && <Notice tone="error" message={error} />}
    {list.map((r) => <ReturnCard key={r.id} ret={r} names={names} busy={busy === r.id} onCancel={() => cancel(r.id)} />)}
    {canAsk && <Pressable onPress={() => router.push({ pathname: '/reso/[orderId]', params: { orderId: order.id } })} accessibilityRole="button"
      style={({ pressed }) => [styles.ask, pressed && { opacity: 0.85 }]}>
      <Icon name="recycle" size={19} color={colors.green} strokeWidth={2} />
      <View style={{ flex: 1 }}>
        <Text style={styles.askTitle}>Richiedi reso o assistenza</Text>
        <Text style={styles.askText}>{days !== null && days <= RETURN_WINDOW_DAYS
          ? `Hai ancora ${Math.max(1, Math.ceil(RETURN_WINDOW_DAYS - days))} giorni per cambiare idea`
          : 'Prodotto difettoso, danneggiato o sbagliato'}</Text>
      </View>
      <Icon name="chevron" size={17} color={colors.muted} />
    </Pressable>}
  </View>;
}

function ReturnCard({ ret, names, busy, onCancel }: { ret: ReturnWithItems; names: Map<string, string>; busy: boolean; onCancel: () => void }) {
  const done = ret.status === 'refunded' || ret.status === 'exchanged';
  const bad = ret.status === 'rejected' || ret.status === 'cancelled';
  const text = ret.status === 'rejected' ? `Motivo: ${ret.decision_note ?? '—'}`
    : ret.status === 'refunded' ? ret.refund_method === 'voucher'
      ? `Buono di ${formatEuro(ret.refund_cents ?? 0)}: usa il codice al checkout entro 12 mesi.`
      : `Rimborso di ${formatEuro(ret.refund_cents ?? 0)} sul metodo di pagamento: l'accredito può richiedere 5–10 giorni lavorativi.`
    : STATUS_TEXT[ret.status];
  return <View style={styles.card}>
    <View style={styles.cardHead}>
      <Text style={styles.number}>{ret.return_number}</Text>
      <StatusMark label={RETURN_STATUS_LABELS[ret.status].split(':')[0]} tone={bad ? 'alert' : done ? 'done' : ret.status === 'approved' ? 'ready' : 'active'} />
    </View>
    <Text style={styles.meta}>{RETURN_REASON_LABELS[ret.reason]} · {ret.resolution === 'exchange' ? 'Cambio' : `Rimborso ${formatEuro(ret.amount_cents)} · ${REFUND_METHOD_LABELS[ret.refund_method ?? 'card']}`}</Text>
    {ret.return_items.map((ri) => <Text key={ri.order_item_id} style={styles.item} numberOfLines={1}>{ri.quantity} × {names.get(ri.order_item_id) ?? 'Articolo'}</Text>)}
    {!!text && <Text style={styles.text}>{text}</Text>}
    {ret.status === 'approved' && <View style={styles.code}><Barcode value={ret.return_number} height={56} /></View>}
    {!!ret.voucher_code && <View style={styles.voucher}>
      <Text style={styles.voucherLabel}>Codice buono</Text>
      <Text selectable style={styles.voucherCode}>{ret.voucher_code}</Text>
    </View>}
    {(ret.status === 'requested' || ret.status === 'approved') && <Pressable onPress={onCancel} disabled={busy} accessibilityRole="button" hitSlop={6}>
      <Text style={styles.cancel}>{busy ? 'Annullo…' : 'Annulla richiesta'}</Text></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18, gap: 10 },
  title: { fontSize: 21, lineHeight: 26, fontFamily: fonts.display, color: colors.text, marginLeft: 4 },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  askTitle: { fontSize: 15.5, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  askText: { fontSize: 12.5, color: colors.muted, fontFamily: fonts.sans, marginTop: 2 },
  card: { padding: 16, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, gap: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  number: { fontSize: 17, fontFamily: fonts.heavy, color: colors.text, letterSpacing: 0.3 },
  meta: { fontSize: 12.5, color: colors.muted, fontFamily: fonts.sans },
  item: { fontSize: 13.5, color: colors.text, fontFamily: fonts.sansMedium },
  text: { fontSize: 13, color: colors.text, fontFamily: fonts.sans, lineHeight: 18, marginTop: 4 },
  code: { marginTop: 8, padding: 10, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  voucher: { marginTop: 8, padding: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.green, alignItems: 'center' },
  voucherLabel: { fontSize: 11.5, color: colors.muted, fontFamily: fonts.sansBold, textTransform: 'uppercase', letterSpacing: 0.4 },
  voucherCode: { fontSize: 20, fontFamily: fonts.heavy, color: colors.green, letterSpacing: 1, marginTop: 2 },
  cancel: { fontSize: 13.5, color: colors.danger, fontFamily: fonts.sansSemiBold, marginTop: 8, textDecorationLine: 'underline' },
});
