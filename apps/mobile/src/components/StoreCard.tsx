import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, floatShadow, fonts } from '@/config/theme';
import { useStores } from '@/lib/hooks';
import { storeShortName } from './StoreSheet';

/** Little awning sign: green and ivory stripes over a white shop window (the store's mark in lists). */
export function AwningMark({ size = 44 }: { size?: number }) {
  const stripe = size / 6;
  return <View style={{ width: size, height: size, borderRadius: size * 0.3, overflow: 'hidden', backgroundColor: '#FFFFFF' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={{ flexDirection: 'row', height: size * 0.52 }}>
      {Array.from({ length: 6 }, (_, i) => <View key={i} style={{ width: stripe, backgroundColor: i % 2 ? colors.page : colors.green }} />)}
    </View>
    <View style={{ height: 2, backgroundColor: colors.green }} />
  </View>;
}

/**
 * The customer's store (design F): a white card that hangs from the awning. Stock, prices and free pickup are
 * always about this store, so it is named everywhere the customer shops. Opening hours come from the store table.
 */
export function StoreCard({ onPress, label = 'Ritiro gratuito nel tuo negozio', action = 'Cambia', flat }: {
  onPress: () => void; label?: string; action?: string; flat?: boolean;
}) {
  const { selected } = useStores();
  const name = storeShortName(selected);
  return <Pressable onPress={onPress} accessibilityRole="button"
    accessibilityLabel={name ? `${label}: ${name}. ${action} negozio` : 'Scegli il tuo negozio'}
    style={({ pressed }) => [styles.card, !flat && floatShadow, pressed && { opacity: 0.9 }]}>
    <AwningMark />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.label} numberOfLines={1}>{name ? label : 'Prezzi e disponibilità del negozio'}</Text>
      <Text style={styles.name} numberOfLines={1}>{name || 'Scegli il tuo negozio'}</Text>
      {!!selected?.opening_hours && <View style={styles.hours}>
        <View style={styles.dot} /><Text style={styles.hoursText} numberOfLines={1}>{selected.opening_hours}</Text>
      </View>}
    </View>
    <Text style={styles.action}>{name ? action : 'Scegli'}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#FFFFFF' },
  label: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.muted },
  name: { fontSize: 19, lineHeight: 24, fontFamily: fonts.display, color: colors.text },
  hours: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2E9B3A' },
  hoursText: { fontSize: 13, fontFamily: fonts.sansSemiBold, color: '#2B6631', flexShrink: 1 },
  action: { fontSize: 14, fontFamily: fonts.sansBold, color: colors.green },
});
