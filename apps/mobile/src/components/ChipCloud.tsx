import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { colors, fonts } from '@/config/theme';
import { Icon } from './Icon';

const CHIP = 38;
const GAP = 8;
/** Rows shown before "Mostra tutte". */
const ROWS = 2;

/**
 * All the choices of a level (departments, or the subcategories of one) laid out in rows instead of one long
 * sideways strip, so every option can be seen without swiping. Folded to two rows with "Mostra tutte (n)";
 * it opens by itself when the chosen one sits further down.
 */
export function ChipCloud({ items, active, onSelect, moreLabel }: {
  items: Array<{ id: string | null; name: string }>;
  active: string | null;
  onSelect: (id: string | null) => void;
  /** "reparti" / "categorie": names the hidden ones in the toggle. */
  moreLabel: string;
}) {
  const [rowsY, setRowsY] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<boolean | null>(null);
  const limit = ROWS * (CHIP + GAP);
  const key = (id: string | null) => id ?? 'all';
  const hidden = items.filter((it) => (rowsY[key(it.id)] ?? 0) >= limit).length;
  const activeHidden = (rowsY[key(active)] ?? 0) >= limit;
  // Opened by the user, or automatically while the chosen item would be folded away.
  const expanded = open ?? activeHidden;
  const measured = Object.keys(rowsY).length >= items.length;

  return <View style={styles.wrap}>
    <View style={[styles.cloud, !expanded && measured && hidden > 0 && { maxHeight: limit - GAP, overflow: 'hidden' }]} accessibilityRole="tablist">
      {items.map((it) => {
        const on = active === it.id;
        return <Pressable key={key(it.id)} onPress={() => onSelect(it.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}
          onLayout={(e: LayoutChangeEvent) => { const y = Math.round(e.nativeEvent.layout.y); setRowsY((m) => (m[key(it.id)] === y ? m : { ...m, [key(it.id)]: y })); }}
          style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && !on && { backgroundColor: colors.well }]}>
          <Text style={[styles.chipText, on && { color: '#FFFFFF' }]} numberOfLines={1}>{it.name}</Text>
        </Pressable>;
      })}
    </View>
    {measured && hidden > 0 && <Pressable onPress={() => setOpen(!expanded)} accessibilityRole="button" accessibilityState={{ expanded }} hitSlop={6}
      style={styles.more}>
      <Text style={styles.moreText}>{expanded ? 'Mostra meno' : `Mostra tutte le ${moreLabel} (${items.length - 1})`}</Text>
      <View style={expanded && { transform: [{ rotate: '180deg' }] }}><Icon name="down" size={15} color={colors.green} strokeWidth={2.4} /></View>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16 },
  cloud: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  chip: { height: CHIP, maxWidth: '100%', paddingHorizontal: 14, borderRadius: CHIP / 2, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { fontSize: 14, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  more: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, minHeight: 28 },
  moreText: { fontSize: 14, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.green },
});
