import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PaymentMethod, PickupSlot } from '@casa-te/shared';
import { colors, fonts, radius, type } from '@/config/theme';
import { RadioMark } from './UI';

const ROME = 'Europe/Rome';
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: ROME, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const hm = (iso: string) => new Intl.DateTimeFormat('it-IT', { timeZone: ROME, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** "Oggi", "Domani", else "sab 16" (Europe/Rome). */
function dayLabel(key: string): { top: string; bottom: string } {
  const today = dayKey(new Date().toISOString());
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000).toISOString());
  const d = new Date(`${key}T12:00:00Z`);
  const date = new Intl.DateTimeFormat('it-IT', { timeZone: ROME, day: 'numeric', month: 'short' }).format(d);
  const weekday = new Intl.DateTimeFormat('it-IT', { timeZone: ROME, weekday: 'short' }).format(d);
  return { top: key === today ? 'Oggi' : key === tomorrow ? 'Domani' : weekday.replace('.', ''), bottom: date.replace('.', '') };
}

/** "oggi 10:00–11:00", "domani 10:00–11:00", "sab 16 nov, 10:00–11:00". */
export function slotText(start: string, end: string): string {
  const { top, bottom } = dayLabel(dayKey(start));
  const day = top === 'Oggi' || top === 'Domani' ? top.toLowerCase() : `${top} ${bottom},`;
  return `${day} ${hm(start)}–${hm(end)}`;
}

/**
 * The pickup time: day tabs, then the one-hour slots of that day as a grid of white chips; the chosen one gets the
 * green edge (choice rule). Slots come from pickup_slots() (opening hours, lead time, closures).
 */
export function PickupSlotPicker({ slots, value, onChange, day, onDay, error }: {
  slots: PickupSlot[]; value: string | null; onChange: (startsAt: string) => void;
  day: string | null; onDay: (key: string) => void; error?: string;
}) {
  const byDay = useMemo(() => {
    const m = new Map<string, PickupSlot[]>();
    for (const s of slots) { const k = dayKey(s.starts_at); m.set(k, [...(m.get(k) ?? []), s]); }
    return m;
  }, [slots]);
  const days = [...byDay.keys()];
  const current = day && byDay.has(day) ? day : days[0];
  return <View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days} style={{ flexGrow: 0 }}>
      {days.map((k) => {
        const on = k === current; const l = dayLabel(k);
        return <Pressable key={k} onPress={() => onDay(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
          accessibilityLabel={`${l.top} ${l.bottom}`} style={[styles.day, on && styles.dayOn]}>
          <Text style={[styles.dayTop, on && styles.dayTextOn]}>{l.top}</Text>
          <Text style={[styles.dayBottom, on && styles.dayTextOn]}>{l.bottom}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <View style={styles.grid} {...(error ? ({ dataSet: { fieldError: 'true' } } as object) : {})}>
      {(byDay.get(current ?? '') ?? []).map((s) => {
        const on = s.starts_at === value;
        return <Pressable key={s.starts_at} onPress={() => onChange(s.starts_at)} accessibilityRole="radio" accessibilityState={{ checked: on }}
          accessibilityLabel={`Dalle ${hm(s.starts_at)} alle ${hm(s.ends_at)}`} style={[styles.slot, on && styles.slotOn]}>
          <Text style={[styles.slotText, on && { fontFamily: fonts.sansBold }]}>{hm(s.starts_at)}–{hm(s.ends_at)}</Text>
        </Pressable>;
      })}
    </View>
    {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
  </View>;
}

/** Pay now online, or at the till when collecting (store pickup only). White cards, radio on the left. */
export function PayMethodPicker({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  const opt = (m: PaymentMethod, title: string, sub: string) => {
    const on = value === m;
    return <Pressable key={m} onPress={() => onChange(m)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.option, on && styles.optionOn]}>
      <RadioMark on={on} />
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSub}>{sub}</Text>
      </View>
    </Pressable>;
  };
  return <View style={{ gap: 8 }}>
    {opt('card', 'Paga ora online', 'Carta o portafoglio digitale, su pagina sicura Stripe')}
    {opt('store', 'Paga in negozio al ritiro', 'Contanti o carta alla cassa')}
  </View>;
}

const styles = StyleSheet.create({
  days: { gap: 8, paddingBottom: 10 },
  day: { minWidth: 72, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line,
    backgroundColor: '#FFFFFF', alignItems: 'center' },
  dayOn: { borderColor: colors.green, borderWidth: 2, paddingVertical: 7, paddingHorizontal: 11 },
  dayTop: { ...type.small, fontFamily: fonts.sansBold, color: colors.text },
  dayBottom: { ...type.small, fontSize: 12, color: colors.muted },
  dayTextOn: { color: colors.green },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '31.5%', minHeight: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center' },
  slotOn: { borderColor: colors.green, borderWidth: 2 },
  slotText: { ...type.small, fontFamily: fonts.sansSemiBold, color: colors.text },
  error: { ...type.small, color: colors.danger, marginTop: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    backgroundColor: '#FFFFFF' },
  optionOn: { borderColor: colors.green, borderWidth: 2, padding: 13 },
  optionTitle: { ...type.body, fontFamily: fonts.sansBold, color: colors.text },
  optionSub: { ...type.small, color: colors.muted, marginTop: 1 },
});
