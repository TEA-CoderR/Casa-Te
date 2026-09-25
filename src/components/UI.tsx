import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, control, radius, spacing, typeScale } from '@/config/theme';
import { Icon, type IconName } from './Icon';
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={styles.pageHeading}><View style={{ flex: 1 }}>
    <Text style={styles.title}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
  </View><View accessibilityLabel="Versione demo" style={styles.demo}><Text style={styles.demoText}>DEMO</Text></View></View>;
}
export function DemoNote({ children }: PropsWithChildren) {
  return <Text accessibilityRole="text" style={styles.demoNote}>{children}</Text>;
}
export function PrimaryButton({ title, onPress, disabled, icon = 'arrow' }: {
  title: string; onPress: () => void; disabled?: boolean; icon?: IconName;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}>
    <Text style={styles.buttonText}>{title}</Text><Icon name={icon} color="#fff" size={20} />
  </Pressable>;
}
export function QuantityControl({ value, onChange, label = '', min = 0 }: {
  value: number; onChange: (value: number) => void; label?: string; min?: number;
}) {
  return <View style={styles.quantity}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Riduci quantità${label ? ` ${label}` : ''}`}
      disabled={value <= min} onPress={() => onChange(value - 1)} style={styles.step}>
      <Icon name="minus" size={16} color={value <= min ? colors.line : colors.text} />
    </Pressable><Text style={styles.quantityValue}>{value}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Aumenta quantità${label ? ` ${label}` : ''}`}
      onPress={() => onChange(value + 1)} style={styles.step}><Icon name="plus" size={16} /></Pressable>
  </View>;
}
export function EmptyState({ title, message, icon = 'bag', children }: PropsWithChildren<{
  title: string; message: string; icon?: IconName;
}>) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Icon name={icon} size={40} color={colors.green} /></View>
    <Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyMessage}>{message}</Text>
    <View style={{ width: '100%', marginTop: 24 }}>{children}</View>
  </View>;
}
const styles = StyleSheet.create({
  pageHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, marginTop: spacing.xs },
  title: { fontSize: typeScale.title, fontWeight: '700', letterSpacing: -0.7, color: colors.text },
  subtitle: { fontSize: typeScale.label, color: colors.muted, marginTop: spacing.xxs, lineHeight: 20 },
  demo: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  demoText: { fontSize: typeScale.caption, letterSpacing: 0.5, color: colors.green, fontWeight: '700' },
  demoNote: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 18 },
  button: { minHeight: control.minHeight, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.green,
    borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  buttonText: { fontSize: typeScale.body, fontWeight: '600', color: '#fff', flexShrink: 1 },
  quantity: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  step: { width: control.minHeight, height: control.minHeight, alignItems: 'center', justifyContent: 'center' },
  quantityValue: { fontSize: typeScale.body, fontWeight: '600', minWidth: 22, textAlign: 'center', color: colors.text },
  empty: { paddingTop: 64, alignItems: 'center', paddingHorizontal: spacing.md },
  emptyIcon: { width: 94, height: 94, borderRadius: 47, backgroundColor: '#EDF2E8', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 24, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  emptyMessage: { fontSize: typeScale.body, lineHeight: 24, color: colors.muted, textAlign: 'center', marginTop: spacing.xs },
});
