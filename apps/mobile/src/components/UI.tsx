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

/**
 * Price as a shop tag (design F): euro sign and cents small and raised, the euros large.
 * Display only: amounts always come from the server.
 */
export function PriceTag({ cents, size = 22, sale, color }: { cents: number; size?: number; sale?: boolean; color?: string }) {
  const euros = Math.floor(Math.abs(cents) / 100).toLocaleString('it-IT');
  const rest = String(Math.abs(cents) % 100).padStart(2, '0');
  const small = Math.round(size * 0.58);
  const ink = color ?? (sale ? colors.sale : colors.text);
  const base = { color: ink, fontFamily: fonts.price, fontWeight: '800' as const, letterSpacing: -0.3 };
  // Three pieces in a row, top-aligned: the cents sit raised next to the euros on every platform.
  return <View accessible accessibilityLabel={`${cents < 0 ? '-' : ''}${euros},${rest} euro`} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
    <Text style={[base, { fontSize: small, lineHeight: small * 1.2, marginTop: size * 0.46 }]}>{cents < 0 ? '−€' : '€'}</Text>
    <Text style={[base, { fontSize: size, lineHeight: size * 1.12 }]}>{euros}</Text>
    <Text style={[base, { fontSize: small, lineHeight: small * 1.2, marginTop: size * 0.02 }]}>,{rest}</Text>
  </View>;
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

export function EmptyState({ title, message, icon = 'bag', art, children }: PropsWithChildren<{
  title: string; message: string; icon?: IconName;
  /** Replaces the round icon (e.g. the empty receipt of the cart). */
  art?: ReactNode;
}>) {
  const { wide } = useLayout();
  return <View style={styles.empty}>{art ?? <View style={styles.emptyIcon}><Icon name={icon} size={40} color={colors.green} /></View>}
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
  // A white plate on the ivory page (design F): the tone shows in the edge and the title, never as a tinted fill.
  const ink = tone === 'error' ? colors.danger : tone === 'success' ? colors.green : colors.text;
  return <View style={[styles.notice, { borderColor: tone === 'info' ? colors.line : ink }]} accessibilityRole={tone === 'error' ? 'alert' : undefined}>
    {title && <Text style={[styles.noticeTitle, { color: ink }]}>{title}</Text>}
    {message && <Text style={[styles.noticeText, { color: tone === 'error' && !title ? ink : colors.text }]}>{message}</Text>}
    {children}
  </View>;
}

export function Loading({ label = 'Caricamento…' }: { label?: string }) {
  return <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
    <ActivityIndicator color={colors.green} /><Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 12 }}>{label}</Text>
  </View>;
}

export function SectionTitle({ children }: PropsWithChildren) {
  const { wide } = useLayout();
  return <Text style={[styles.sectionTitle, wide && { fontFamily: fonts.serif, fontWeight: '400', fontSize: 24 }]} accessibilityRole="header">{children}</Text>;
}

export function SummaryRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'green' }) {
  return <View style={styles.summaryRow}>
    <Text style={[styles.summaryLabel, strong && { color: colors.text, fontSize: 21, fontFamily: fonts.display }]}>{label}</Text>
    <Text style={[styles.summaryValue, strong && { fontSize: 27, fontFamily: fonts.price, fontWeight: '800', letterSpacing: -0.4 }, tone === 'green' && { color: colors.green }]}>{value}</Text>
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

/** Radio mark of the choice cards (design F checkout): a ring, with a green dot when chosen. */
export function RadioMark({ on }: { on: boolean }) {
  return <View style={[styles.radio, on && { borderColor: colors.green }]}>{on && <View style={styles.radioDot} />}</View>;
}

/**
 * A choice among a few (delivery, address, refund…), as in the design F checkout: a white card with the radio on the left;
 * the chosen one only gets a green edge. No tinted fill and no icon in a circle.
 */
export function OptionCard({ selected, onPress, title, description, right, disabled }: {
  selected: boolean; onPress: () => void; title: string; description?: string; right?: string; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.option, selected && styles.optionOn, disabled && { opacity: 0.45 }]}>
    <RadioMark on={selected} />
    <View style={{ flex: 1 }}>
      <Text style={styles.optionTitle}>{title}</Text>
      {description && <Text style={styles.optionDescription}>{description}</Text>}
    </View>
    {right && <Text style={styles.optionRight}>{right}</Text>}
  </Pressable>;
}

/**
 * Status of an order or a request, written like the shelf labels ("● DISPONIBILE"): a dot and the words, no tinted pill.
 * Only "ready" gets the logo yellow, the single signal of the app.
 */
/** Tone of an order status for `StatusMark`. */
export function orderStatusTone(status: string): 'active' | 'ready' | 'done' | 'alert' {
  return status === 'ready' ? 'ready' : status === 'cancelled' ? 'alert' : status === 'completed' ? 'done' : 'active';
}

export function StatusMark({ label, tone = 'active' }: { label: string; tone?: 'active' | 'ready' | 'done' | 'alert' }) {
  const ink = tone === 'alert' ? colors.danger : tone === 'done' ? colors.muted : colors.green;
  if (tone === 'ready') return <View style={styles.statusReady}><View style={[styles.statusDot, { backgroundColor: colors.text }]} />
    <Text style={[styles.statusText, { color: colors.text }]} numberOfLines={1}>{label}</Text></View>;
  return <View style={styles.status}><View style={[styles.statusDot, { backgroundColor: ink }]} />
    <Text style={[styles.statusText, { color: ink }]} numberOfLines={1}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  pageHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 22, marginTop: 6, gap: 12 },
  title: { fontSize: 29, lineHeight: 35, fontFamily: fonts.display, color: colors.text },
  serifTitle: { fontSize: 31, lineHeight: 37, fontFamily: fonts.serif, fontWeight: '400', letterSpacing: -0.2 },
  subtitle: { fontSize: 13.5, color: colors.muted, marginTop: 3, fontFamily: fonts.sansMedium },
  button: { minHeight: 56, paddingHorizontal: 24, paddingVertical: 14, backgroundColor: colors.green,
    borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontSize: 17, fontFamily: fonts.sansBold, fontWeight: '700', color: '#fff', flexShrink: 1, textAlign: 'center' },
  secondary: { minHeight: 52, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryText: { fontSize: 15, fontFamily: fonts.sansBold, fontWeight: '700' },
  quantity: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 999, backgroundColor: colors.page },
  step: { width: 40, height: 46, alignItems: 'center', justifyContent: 'center' },
  quantityValue: { fontSize: 17, fontFamily: fonts.heavy, fontWeight: '800', minWidth: 22, textAlign: 'center', color: colors.text },
  empty: { paddingTop: 64, alignItems: 'center', paddingHorizontal: 20 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 26, lineHeight: 31, fontFamily: fonts.display, color: colors.text, marginTop: 20, textAlign: 'center' },
  emptyMessage: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center', marginTop: 10, fontFamily: fonts.sans },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: 6, marginLeft: 2, fontFamily: fonts.sansBold, fontWeight: '700' },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 16, fontSize: 16,
    color: colors.text, backgroundColor: colors.surface, fontFamily: fonts.sansSemiBold },
  fieldError: { color: colors.danger, fontSize: 12, marginTop: 5, fontFamily: fonts.sans },
  fieldHint: { color: colors.muted, fontSize: 12, marginTop: 5, fontFamily: fonts.sans },
  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 8, minHeight: 44 },
  checkBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.green, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkBoxOn: { backgroundColor: colors.green },
  notice: { borderRadius: 18, padding: 16, marginBottom: 12, gap: 6, backgroundColor: colors.surface, borderWidth: 1 },
  noticeTitle: { fontSize: 15, fontFamily: fonts.sansBold, fontWeight: '700' },
  noticeText: { fontSize: 14, lineHeight: 19, fontFamily: fonts.sans },
  sectionTitle: { fontSize: 24, lineHeight: 29, fontFamily: fonts.display, marginTop: 28, marginBottom: 12, color: colors.text },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, gap: 12 },
  summaryLabel: { color: colors.muted, fontSize: 14.5, flex: 1, fontFamily: fonts.sansMedium },
  summaryValue: { color: colors.text, fontSize: 15, fontFamily: fonts.sansBold, fontWeight: '700' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line, minHeight: 56 },
  listTitle: { fontSize: 15.5, color: colors.text, fontFamily: fonts.sansBold, fontWeight: '700' },
  listSubtitle: { fontSize: 12, color: colors.muted, marginTop: 3, fontFamily: fonts.sans },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.surface, marginBottom: 10, minHeight: 66 },
  optionOn: { borderColor: colors.green, borderWidth: 2, paddingVertical: 13, paddingHorizontal: 15 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#B9B4A6', alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.green },
  optionTitle: { fontSize: 15.5, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  optionDescription: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18, fontFamily: fonts.sans },
  optionRight: { fontSize: 14, fontFamily: fonts.heavy, fontWeight: '800', color: colors.text },
  status: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0, minHeight: 28 },
  statusReady: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, height: 28, paddingHorizontal: 11, borderRadius: 14, backgroundColor: colors.yellow },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontFamily: fonts.heavy, fontWeight: '800' },
});
