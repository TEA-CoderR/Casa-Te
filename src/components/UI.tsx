import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/config/theme';
import { Icon, type IconName } from './Icon';
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={styles.pageHeading}><View style={{ flex: 1 }}>
    <Text style={styles.title}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
  </View><View style={styles.demo}><Text style={styles.demoText}>DEMO</Text></View></View>;
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
  pageHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, marginTop: 8 },
  title: { fontSize: 30, fontWeight: '600', letterSpacing: -1, color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 6 },
  demo: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: '#EDF0E8' },
  demoText: { fontSize: 9, letterSpacing: 1, color: colors.green, fontWeight: '600' },
  button: { minHeight: 54, paddingHorizontal: 20, paddingVertical: 15, backgroundColor: colors.green,
    borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#fff', flexShrink: 1 },
  quantity: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 12 },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  quantityValue: { fontSize: 15, fontWeight: '600', minWidth: 22, textAlign: 'center' },
  empty: { paddingTop: 64, alignItems: 'center', paddingHorizontal: 20 },
  emptyIcon: { width: 94, height: 94, borderRadius: 47, backgroundColor: '#EDF2E8', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 23, fontWeight: '600', color: colors.text, marginTop: 24 },
  emptyMessage: { fontSize: 14, lineHeight: 22, color: colors.muted, textAlign: 'center', marginTop: 10 },
});
