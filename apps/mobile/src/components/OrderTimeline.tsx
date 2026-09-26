import { StyleSheet, Text, View } from 'react-native';
import { orderStatusLabel, orderTimeline, type OrderEventRow, type OrderRow } from '@casa-te/shared';
import { colors } from '@/config/theme';
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
          {i < steps.length - 1 && <View style={[styles.connector, current > i && { backgroundColor: '#AEC29A' }]} />}
          <View style={[styles.dot, done && styles.dotDone]}>{done && <Icon name="check" color="#fff" size={10} />}</View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.stepText, done && { color: colors.text, fontWeight: current === i ? '600' : '400' }]}>
            {orderStatusLabel(step, order.fulfilment)}</Text>
          {at && <Text style={styles.at}>{fmt(at)}</Text>}
        </View>
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 12, minHeight: 40 },
  track: { width: 18, alignItems: 'center' },
  connector: { position: 'absolute', top: 9, bottom: -2, width: 1, backgroundColor: colors.line },
  dot: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#EDF0E8', borderWidth: 1, borderColor: '#DCE2D4', alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.green, borderColor: colors.green },
  stepText: { fontSize: 12, lineHeight: 17, color: '#9BA291' },
  at: { fontSize: 10, color: colors.muted, marginTop: 2 },
  cancelled: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#F8E9E7' },
});
