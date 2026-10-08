import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts } from '@/config/theme';
import { Icon, type IconName } from './Icon';
import { useLayout } from '@/lib/hooks';

/** Desktop web: square-cut controls and sans labels, like the rest of the desktop catalogue. */
const deskButton = { borderRadius: 4 } as const;
const deskLabel = { fontSize: 15, fontFamily: fonts.sansSemiBold, fontWeight: '600', letterSpacing: 0.3 } as const;

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const { wide } = useLayout();
  return <View style={styles.pageHeading}><View style={{ flex: 1 }}>
    <Text style={[styles.title, wide && styles.serifTitle]} accessibilityRole="header">{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
  </View>{right}</View>;
}

export function PrimaryButton({ title, onPress, disabled, loading, icon = null }: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean; icon?: IconName | null;
}) {
  const off = disabled || loading;
  const { wide } = useLayout();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: off, busy: loading }} disabled={off} onPress={onPress}
    style={({ pressed }) => [styles.button, wide && deskButton, { opacity: off ? 0.45 : pressed ? 0.8 : 1 }]}>
    {loading ? <ActivityIndicator color="#fff" /> : icon ? <Icon name={icon} color="#fff" size={19} /> : null}
    <Text style={[styles.buttonText, wide && deskLabel]}>{title}</Text>
  </Pressable>;
}

export function SecondaryButton({ title, onPress, disabled, icon, danger }: {
  title: string; onPress: () => void; disabled?: boolean; icon?: IconName; danger?: boolean;
}) {
  const color = danger ? colors.danger : colors.green;
  const { wide } = useLayout();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.secondary, wide && deskButton, { borderColor: color, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
    {icon && <Icon name={icon} color={color} size={18} />}
    <Text style={[styles.secondaryText, { color }]}>{title}</Text>
  </Pressable>;
}

export function QuantityControl({ value, onChange, label = '', min = 0, max = 99, compact }: {
  value: number; onChange: (value: number) => void; label?: string; min?: number; max?: number; compact?: boolean;
}) {
  const { wide } = useLayout();
  const step = compact ? [styles.step, { width: 30, height: 32 }] : styles.step;
  return <View style={[styles.quantity, wide && deskButton]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Riduci quantità${label ? ` ${label}` : ''}`}
      disabled={value <= min} onPress={() => onChange(value - 1)} style={step}>
      <Icon name="minus" size={compact ? 14 : 16} color={value <= min ? colors.line : colors.text} strokeWidth={1.5} />
    </Pressable><Text style={[styles.quantityValue, compact && { fontSize: 15, minWidth: 16 }]} accessibilityLabel={`Quantità ${value}`}>{value}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Aumenta quantità${label ? ` ${label}` : ''}`}
      disabled={value >= max} onPress={() => onChange(value + 1)} style={step}>
      <Icon name="plus" size={compact ? 14 : 16} color={value >= max ? colors.line : colors.text} strokeWidth={1.5} />
    </Pressable>
  </View>;
}

export function EmptyState({ title, message, icon = 'bag', children }: PropsWithChildren<{
  title: string; message: string; icon?: IconName;
}>) {
  const { wide } = useLayout();
  return <View style={styles.empty}><View style={styles.emptyIcon}><Icon name={icon} size={40} color={colors.green} /></View>
    <Text style={[styles.emptyTitle, wide && { fontFamily: fonts.serif, fontWeight: '400', fontSize: 28 }]}>{title}</Text><Text style={styles.emptyMessage}>{message}</Text>
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
  const { wide } = useLayout();
  return <Text style={[styles.sectionTitle, wide && { fontFamily: fonts.serif, fontWeight: '400', fontSize: 24 }]} accessibilityRole="header">{children}</Text>;
}

export function SummaryRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'green' }) {
  return <View style={styles.summaryRow}>
    <Text style={[styles.summaryLabel, strong && { color: colors.text, fontSize: 18, fontFamily: fonts.heavy, fontWeight: '800' }]}>{label}</Text>
    <Text style={[styles.summaryValue, strong && { fontSize: 24, fontFamily: fonts.price, fontWeight: '800' }, tone === 'green' && { color: colors.green }]}>{value}</Text>
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
  title: { fontSize: 28, lineHeight: 33, fontFamily: fonts.heavy, fontWeight: '800', color: colors.text },
  serifTitle: { fontSize: 31, lineHeight: 37, fontFamily: fonts.serif, fontWeight: '400', letterSpacing: -0.2 },
  subtitle: { fontSize: 13.5, color: colors.muted, marginTop: 3, fontFamily: fonts.sansMedium },
  button: { minHeight: 50, paddingHorizontal: 24, paddingVertical: 13, backgroundColor: colors.green,
    borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontSize: 17, fontFamily: fonts.sansBold, fontWeight: '700', color: '#fff', flexShrink: 1, textAlign: 'center' },
  secondary: { minHeight: 48, borderRadius: 999, borderWidth: 1, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryText: { fontSize: 15, fontFamily: fonts.sansBold, fontWeight: '700' },
  quantity: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D3D8CD', borderRadius: 999, backgroundColor: colors.surface },
  step: { width: 40, height: 46, alignItems: 'center', justifyContent: 'center' },
  quantityValue: { fontSize: 17, fontFamily: fonts.sansBold, fontWeight: '700', minWidth: 22, textAlign: 'center', color: colors.text },
  empty: { paddingTop: 64, alignItems: 'center', paddingHorizontal: 20 },
  emptyIcon: { width: 94, height: 94, borderRadius: 47, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 24, fontFamily: fonts.heavy, fontWeight: '800', color: colors.text, marginTop: 24, textAlign: 'center' },
  emptyMessage: { fontSize: 14, lineHeight: 22, color: colors.muted, textAlign: 'center', marginTop: 10, fontFamily: fonts.sans },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: 6, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#D3D8CD', borderRadius: 10, paddingHorizontal: 14, fontSize: 16,
    color: colors.text, backgroundColor: colors.surface, fontFamily: fonts.sans },
  fieldError: { color: colors.danger, fontSize: 12, marginTop: 5, fontFamily: fonts.sans },
  fieldHint: { color: colors.muted, fontSize: 12, marginTop: 5, fontFamily: fonts.sans },
  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 8, minHeight: 44 },
  checkBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.green, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkBoxOn: { backgroundColor: colors.green },
  notice: { borderRadius: 14, padding: 16, marginBottom: 12, gap: 6 },
  noticeTitle: { fontSize: 15, fontFamily: fonts.sansBold, fontWeight: '700' },
  noticeText: { fontSize: 14, lineHeight: 19, fontFamily: fonts.sans },
  sectionTitle: { fontSize: 20, fontFamily: fonts.heavy, fontWeight: '800', marginTop: 28, marginBottom: 14, color: colors.text },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, gap: 12 },
  summaryLabel: { color: colors.muted, fontSize: 14.5, flex: 1, fontFamily: fonts.sansMedium },
  summaryValue: { color: colors.text, fontSize: 14.5, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line, minHeight: 56 },
  listTitle: { fontSize: 15.5, color: colors.text, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  listSubtitle: { fontSize: 12, color: colors.muted, marginTop: 3, fontFamily: fonts.sans },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.surface, marginBottom: 10, minHeight: 64 },
  optionOn: { borderColor: colors.green, borderWidth: 1.5, backgroundColor: '#F3F8EF' },
  optionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontSize: 15, fontFamily: fonts.sansSemiBold, fontWeight: '600', color: colors.text },
  optionDescription: { fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 16, fontFamily: fonts.sans },
  optionRight: { fontSize: 19, fontFamily: fonts.price, fontWeight: '800', color: colors.text },
});
