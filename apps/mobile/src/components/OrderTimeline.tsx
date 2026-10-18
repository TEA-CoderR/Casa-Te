import { StyleSheet, Text, View } from 'react-native';
import { orderStatusLabel, orderTimeline, type OrderEventRow, type OrderRow } from '@casa-te/shared';
import { colors, fonts } from '@/config/theme';
import { Icon } from './Icon';

const fmt = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function OrderTimeline({ order, events = [] }: { order: Pick<OrderRow, 'status' | 'fulfilment'>; events?: OrderEventRow[] }) {
  if (order.status === 'cancelled') {
    return <View style={styles.cancelled}><Icon name="close" size={16} color={colors.danger} />
      <Text style={{ color: colors.danger, fontSize: 12, flex: 1 }}>Ordine annullato</Text></View>;
  }
  const steps = orderTimeline(order.fulfilment);
  const current = steps.indexOf(order.status);
  return <View style={{ marginTop: 12 }}>
    {steps.map((step, i) => {
      const done = current >= i;
      const at = events.filter((e) => e.kind === 'status' && e.status === step).at(-1)?.created_at;
      return <View key={step} style={styles.step}>
        <View style={styles.track}>
          {i < steps.length - 1 && <View style={[styles.connector, current > i && { backgroundColor: colors.green }]} />}
          <View style={[styles.dot, done && styles.dotDone, current === i && styles.dotNow]}>{done && <Icon name="check" color={current === i ? colors.text : '#fff'} size={12} strokeWidth={3} />}</View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.stepText, done && { color: colors.text, fontFamily: current === i ? fonts.heavy : fonts.sansSemiBold }]}>
            {orderStatusLabel(step, order.fulfilment)}</Text>
          {at && <Text style={styles.at}>{fmt(at)}</Text>}
        </View>
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 14, minHeight: 54 },
  track: { width: 24, alignItems: 'center' },
  connector: { position: 'absolute', top: 14, bottom: -2, width: 2, backgroundColor: colors.line },
  dot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#D5D0C3', alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.green, borderColor: colors.green },
  dotNow: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  stepText: { fontSize: 15, lineHeight: 20, color: '#7A7F74', fontFamily: fonts.sansSemiBold, paddingTop: 1 },
  at: { fontSize: 12.5, color: colors.muted, marginTop: 2, fontFamily: fonts.sans },
  cancelled: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#F8E9E7' },
});
