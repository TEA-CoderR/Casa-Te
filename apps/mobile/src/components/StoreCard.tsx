import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, fonts } from '@/config/theme';
import { useStores } from '@/lib/hooks';
import { storeShortName } from './StoreSheet';

/**
 * Little shop sign (design F): green and ivory awning stripes with a white shop window below,
 * the window edged by a green line. 46 px on the home card, 40–42 px in lists.
 */
export function AwningMark({ size = 46 }: { size?: number }) {
  const stripe = size >= 44 ? 8 : 7;
  const count = Math.ceil(size / stripe);
  return <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), overflow: 'hidden', backgroundColor: colors.page }}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
      {Array.from({ length: count }, (_, i) => <View key={i} style={{ width: stripe, backgroundColor: i % 2 ? colors.page : colors.green }} />)}
    </View>
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(size * 0.48), backgroundColor: '#FFFFFF', borderTopWidth: 2, borderColor: colors.green }} />
  </View>;
}

/** "8:30 – 20:00" (any separator, "." or ":" in times) → minutes, or null when the hours are written differently. */
function parseHours(text: string | null | undefined): { open: number; close: number; closeText: string; openText: string } | null {
  const m = text?.match(/(\d{1,2})[.:](\d{2})\s*[-–—a]+\s*(\d{1,2})[.:](\d{2})/);
  if (!m) return null;
  const [h1, m1, h2, m2] = m.slice(1).map(Number);
  return { open: h1 * 60 + m1, close: h2 * 60 + m2, openText: `${h1}:${String(m1).padStart(2, '0')}`, closeText: `${h2}:${String(m2).padStart(2, '0')}` };
}

/**
 * Store status line: "Aperto · fino alle 20:00" / "Chiuso · apre alle 8:30" when the hours in the store table are a
 * simple daily range; otherwise the hours exactly as written in the back office.
 */
export function storeStatus(hours: string | null | undefined, now = new Date()): { text: string; open: boolean | null } | null {
  if (!hours) return null;
  const h = parseHours(hours);
  // Only a single daily range is turned into open/closed; hours that vary by weekday are shown as written.
  if (!h || /\b(lun|mar|mer|gio|ven|sab|dom)/i.test(hours.replace(/tutti i giorni|ogni giorno/i, ''))) return { text: hours, open: null };
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= h.open && t < h.close ? { text: `Aperto · fino alle ${h.closeText}`, open: true } : { text: `Chiuso · apre alle ${h.openText}`, open: false };
}

/**
 * The customer's store (design F): a white card that hangs from the awning. Stock, prices and free pickup are
 * always about this store, so it is named everywhere the customer shops.
 */
export function StoreCard({ onPress, label = 'Ritiro gratuito nel tuo negozio', action = 'Cambia', compact, showStatus = true, style }: {
  onPress: () => void; label?: string; action?: string; compact?: boolean; showStatus?: boolean; style?: ViewStyle;
}) {
  const { selected } = useStores();
  const name = storeShortName(selected).replace(/^(\S+)\s+(?!·)/, '$1 · ');
  const status = showStatus ? storeStatus(selected?.opening_hours) : null;
  return <Pressable onPress={onPress} accessibilityRole="button"
    accessibilityLabel={name ? `${label}: ${name}. ${action} negozio` : 'Scegli il tuo negozio'}
    style={({ pressed }) => [styles.card, compact && styles.compact, style, pressed && { opacity: 0.92 }]}>
    <AwningMark size={compact ? 40 : 46} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.label} numberOfLines={1}>{name ? label : 'Prezzi e disponibilità del negozio'}</Text>
      <Text style={[styles.name, compact && { fontSize: 18 }]} numberOfLines={1}>{name || 'Scegli il tuo negozio'}</Text>
      {!!status && <View style={styles.hours}>
        {status.open !== null && <View style={[styles.dot, !status.open && { backgroundColor: colors.faint }]} />}
        <Text style={[styles.hoursText, status.open === false && { color: colors.muted }]} numberOfLines={1}>{status.text}</Text>
      </View>}
    </View>
    <Text style={styles.action}>{name ? action : 'Scegli'}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#FFFFFF',
    shadowColor: '#18201A', shadowOpacity: 0.12, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  compact: { gap: 12, paddingVertical: 12 },
  label: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.muted },
  name: { fontSize: 19, lineHeight: 23, fontFamily: fonts.display, color: colors.text, marginTop: 1 },
  hours: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2E9B3A' },
  hoursText: { fontSize: 13, fontFamily: fonts.sansSemiBold, color: '#2E6B34', flexShrink: 1 },
  action: { fontSize: 13.5, fontFamily: fonts.sansBold, color: colors.green },
});
