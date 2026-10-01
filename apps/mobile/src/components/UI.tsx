import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts } from '@/config/theme';
import { Icon, type IconName } from './Icon';

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return <View style={styles.pageHeading}><View style={{ flex: 1 }}>
    <Text style={styles.title} accessibilityRole="header">{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
  </View>{right}</View>;
}

export function PrimaryButton({ title, onPress, disabled, loading, icon = null }: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean; icon?: IconName | null;
}) {
  const off = disabled || loading;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: off, busy: loading }} disabled={off} onPress={onPress}
    style={({ pressed }) => [styles.button, { opacity: off ? 0.45 : pressed ? 0.8 : 1 }]}>
    {loading ? <ActivityIndicator color="#fff" /> : icon ? <Icon name={icon} color="#fff" size={19} /> : null}
    <Text style={styles.buttonText}>{title}</Text>
  </Pressable>;
}

export function SecondaryButton({ title, onPress, disabled, icon, danger }: {
  title: string; onPress: () => void; disabled?: boolean; icon?: IconName; danger?: boolean;
}) {
  const color = danger ? colors.danger : colors.green;
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.secondary, { borderColor: color, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
    {icon && <Icon name={icon} color={color} size={18} />}
    <Text style={[styles.secondaryText, { color }]}>{title}</Text>
  </Pressable>;
}

export function QuantityControl({ value, onChange, label = '', min = 0, max = 99 }: {
  value: number; onChange: (value: number) => void; label?: string; min?: number; max?: number;
}) {
  return <View style={styles.quantity}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Riduci quantità${label ? ` ${label}` : ''}`}
      disabled={value <= min} onPress={() => onChange(value - 1)} style={styles.step}>
      <Icon name="minus" size={16} color={value <= min ? colors.line : colors.text} />
    </Pressable><Text style={styles.quantityValue} accessibilityLabel={`Quantità ${value}`}>{value}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Aumenta quantità${label ? ` ${label}` : ''}`}
      disabled={value >= max} onPress={() => onChange(value + 1)} style={styles.step}>
      <Icon name="plus" size={16} color={value >= max ? colors.line : colors.text} />
    </Pressable>
  </View>;
}

export function EmptyState({ title, message, icon = 'bag', children }: PropsWithChildren<{
  title: string; message: string; icon?: IconName;
}>) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Icon name={icon} size={40} color={colors.green} /></View>
    <Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyMessage}>{message}</Text>
    <View style={{ width: '100%', maxWidth: 420, marginTop: 24, gap: 12 }}>{children}</View>
  </View>;
}

export function TextField({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return <View style={{ marginBottom: 12 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput placeholderTextColor={colors.faint} accessibilityLabel={label} {...props}
      // data-invalid lets the checkout scroll to and focus the first field with an error (web).
      {...({ dataSet: { invalid: error ? 'true' : 'false' } } as object)}
      style={[styles.input, error ? { borderColor: colors.danger, borderWidth: 1.5 } : null, props.style]} />
    {error ? <Text style={styles.fieldError} accessibilityLiveRegion="polite">{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
  </View>;
}

export function Checkbox({ checked, onChange, children }: PropsWithChildren<{ checked: boolean; onChange: (v: boolean) => void }>) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={styles.checkRow}>
    <View style={[styles.checkBox, checked && styles.checkBoxOn]}>{checked && <Icon name="check" color="#fff" size={14} />}</View>
    <View style={{ flex: 1 }}>{children}</View>
  </Pressable>;
}

export function Notice({ tone = 'info', title, message, children }: PropsWithChildren<{ tone?: 'info' | 'error' | 'success'; title?: string; message?: string }>) {
  const palette = tone === 'error' ? { bg: '#F8E9E7', fg: colors.danger } : tone === 'success' ? { bg: '#E8EFE6', fg: colors.greenDark } : { bg: colors.sand, fg: colors.greenDark };
  return <View style={[styles.notice, { backgroundColor: palette.bg }]} accessibilityRole={tone === 'error' ? 'alert' : undefined}>
    {title && <Text style={[styles.noticeTitle, { color: palette.fg }]}>{title}</Text>}
    {message && <Text style={[styles.noticeText, { color: palette.fg }]}>{message}</Text>}
    {children}
  </View>;
}

export function Loading({ label = 'Caricamento…' }: { label?: string }) {
  return <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
    <ActivityIndicator color={colors.green} /><Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
  </View>;
}

export function SectionTitle({ children }: PropsWithChildren) {
  return <Text style={styles.sectionTitle} accessibilityRole="header">{children}</Text>;
}

export function SummaryRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'green' }) {
  return <View style={styles.summaryRow}>
    <Text style={[styles.summaryLabel, strong && { color: colors.text, fontSize: 18, fontFamily: fonts.serif }]}>{label}</Text>
    <Text style={[styles.summaryValue, strong && { fontSize: 22, fontFamily: fonts.serif, fontWeight: '400' }, tone === 'green' && { color: colors.green }]}>{value}</Text>
  </View>;
}

export function ListRow({ icon, title, subtitle, onPress, danger }: { icon: IconName; title: string; subtitle?: string; onPress: () => void; danger?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.6 }]}>
    <Icon name={icon} color={danger ? colors.danger : colors.green} size={21} />
    <View style={{ flex: 1 }}>
      <Text style={[styles.listTitle, danger && { color: colors.danger }]}>{title}</Text>
      {subtitle && <Text style={styles.listSubtitle}>{subtitle}</Text>}
    </View>
    <Icon name="chevron" size={17} color={colors.muted} />
  </Pressable>;
}

export function OptionCard({ selected, onPress, icon, title, description, right, disabled }: {
  selected: boolean; onPress: () => void; icon?: IconName; title: string; description?: string; right?: string; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.option, selected && styles.optionOn, disabled && { opacity: 0.45 }]}>
    {icon && <View style={[styles.optionIcon, selected && { backgroundColor: colors.green }]}>
      <Icon name={icon} size={20} color={selected ? '#fff' : colors.green} /></View>}
    <View style={{ flex: 1 }}>
      <Text style={styles.optionTitle}>{title}</Text>
      {description && <Text style={styles.optionDescription}>{description}</Text>}
    </View>
    {right && <Text style={styles.optionRight}>{right}</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  pageHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 22, marginTop: 6, gap: 12 },
  title: { fontSize: 32, lineHeight: 40, fontFamily: fonts.serif, color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4, fontFamily: fonts.sans },
  button: { minHeight: 54, paddingHorizontal: 24, paddingVertical: 15, backgroundColor: colors.green,
    borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontSize: 17, fontFamily: fonts.serif, color: '#fff', flexShrink: 1, textAlign: 'center' },
  secondary: { minHeight: 48, borderRadius: 999, borderWidth: 1, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryText: { fontSize: 14, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  quantity: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 999, backgroundColor: colors.surface },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  quantityValue: { fontSize: 16, fontFamily: fonts.serif, minWidth: 22, textAlign: 'center', color: colors.text },
  empty: { paddingTop: 64, alignItems: 'center', paddingHorizontal: 20 },
  emptyIcon: { width: 94, height: 94, borderRadius: 47, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 26, fontFamily: fonts.serif, color: colors.text, marginTop: 24, textAlign: 'center' },
  emptyMessage: { fontSize: 14, lineHeight: 22, color: colors.muted, textAlign: 'center', marginTop: 10, fontFamily: fonts.sans },
  fieldLabel: { fontSize: 12, color: colors.muted, marginBottom: 6, fontFamily: fonts.sansMedium, fontWeight: '500' },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, fontSize: 15,
    color: colors.text, backgroundColor: colors.surface, fontFamily: fonts.sans },
  fieldError: { color: colors.danger, fontSize: 12, marginTop: 5, fontFamily: fonts.sans },
  fieldHint: { color: colors.muted, fontSize: 12, marginTop: 5, fontFamily: fonts.sans },
  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 8, minHeight: 44 },
  checkBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.green, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkBoxOn: { backgroundColor: colors.green },
  notice: { borderRadius: 14, padding: 16, marginBottom: 12, gap: 6 },
  noticeTitle: { fontSize: 14, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  noticeText: { fontSize: 13, lineHeight: 19, fontFamily: fonts.sans },
  sectionTitle: { fontSize: 23, fontFamily: fonts.serif, marginTop: 28, marginBottom: 14, color: colors.text },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, gap: 12 },
  summaryLabel: { color: colors.muted, fontSize: 14, flex: 1, fontFamily: fonts.sans },
  summaryValue: { color: colors.text, fontSize: 14, fontFamily: fonts.sansMedium, fontWeight: '500' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line, minHeight: 56 },
  listTitle: { fontSize: 15, color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500' },
  listSubtitle: { fontSize: 12, color: colors.muted, marginTop: 3, fontFamily: fonts.sans },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.surface, marginBottom: 10, minHeight: 64 },
  optionOn: { borderColor: colors.green, borderWidth: 1.5, backgroundColor: '#F7F6EF' },
  optionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontSize: 15, fontFamily: fonts.sansSemiBold, fontWeight: '600', color: colors.text },
  optionDescription: { fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 16, fontFamily: fonts.sans },
  optionRight: { fontSize: 16, fontFamily: fonts.serif, color: colors.text },
});
