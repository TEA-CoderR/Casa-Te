import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/config/theme';
import { BrandLogo } from './BrandLogo';
import { Icon, type IconName } from './Icon';

const STRIPE = 22;
/** Enough stripes for the widest phone/tablet band; the band clips the rest. */
const STRIPES = Array.from({ length: 48 }, (_, i) => i);

/** The awning's tone-on-tone vertical stripes, painted behind the band's content. */
export function AwningStripes({ width = STRIPE }: { width?: number }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.stripes]}>
    {STRIPES.map((i) => <View key={i} style={{ width, backgroundColor: i % 2 ? colors.stripe : colors.brand }} />)}
  </View>;
}

/** The scalloped valance under the band: half-discs in the two stripe tones, one per stripe. */
export function AwningEdge() {
  return <View pointerEvents="none" style={styles.edge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {STRIPES.map((i) => <View key={i} style={[styles.scallop, { backgroundColor: i % 2 ? colors.stripe : colors.brand }]} />)}
  </View>;
}

/**
 * Phone header band: white, like the sign-in pages (it was the striped green awning of design F "La Tenda" until
 * November 2026; `AwningStripes` / `AwningEdge` stay for other awning-shaped marks). Layouts:
 * - inline (default): [left] title + subtitle … [right] in one row (Carrello, Ordini, Ordine);
 * - `stacked`: the buttons row, then a large title below it (Reparto, Home greeting, Accesso);
 * - `plain`: kept for callers; every band is plain now.
 * `pad` = [top, horizontal, bottom] inside the band; `overlap` is extra bottom room for a card that hangs from it.
 */
export function BrandHeader({ title, subtitle, logo, logoHeight = 36, left, right, overlap = 0, inScroll, stacked, plain,
  titleSize, titleGap, pad = [14, 16, 18], children }: PropsWithChildren<{
  title?: string; subtitle?: string; logo?: boolean; logoHeight?: number; left?: ReactNode; right?: ReactNode; overlap?: number;
  /** Rendered inside the page's scroll view (Screen `top`): the status bar inset is painted by `StatusBand`. */
  inScroll?: boolean; stacked?: boolean; plain?: boolean; titleSize?: number; titleGap?: number;
  pad?: [number, number, number];
}>) {
  const insets = useSafeAreaInsets();
  const size = titleSize ?? (stacked ? 34 : 28);
  const heading = !!title && <View style={[{ flexShrink: 1 }, stacked ? { marginTop: titleGap ?? 12 } : left ? { marginLeft: 12 } : null]}>
    <Text style={[styles.title, { fontSize: size, lineHeight: Math.round(size * 1.13) }]} accessibilityRole="header" numberOfLines={stacked ? 2 : 1}>{title}</Text>
    {!!subtitle && <Text style={[styles.subtitle, stacked && { fontSize: 14.5, marginTop: 2 }]} numberOfLines={stacked ? 2 : 1}>{subtitle}</Text>}
  </View>;
  // No zIndex: a card that hangs from the band (a later sibling in the scroll content) must paint over it.
  return <View>
    <View style={[styles.band, { paddingTop: (inScroll ? 0 : insets.top) + pad[0], paddingHorizontal: pad[1], paddingBottom: pad[2] + overlap }]}>
      {(left || right || logo || (!stacked && !!title)) && <View style={styles.row}>
        {left}
        {logo && <BrandLogo width={logoHeight * 1.9} color={colors.bandLogo} />}
        {!stacked && heading}
        <View style={{ flex: 1 }} />
        {right}
      </View>}
      {stacked && heading}
      {children}
    </View>
  </View>;
}

/** The status bar area above a scrolling awning (Screen `header` when the band is the Screen `top`). */
export function StatusBand() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.top, backgroundColor: colors.band, zIndex: 3 }} />;
}

/** A card that hangs from the awning's valance (store card, active order): pulls itself up over the band. */
export function HangingCard({ children, style, overlap = 34 }: PropsWithChildren<{ style?: ViewStyle; overlap?: number }>) {
  return <View style={[{ marginTop: -overlap - 12, marginHorizontal: 16, zIndex: 2, elevation: 6 }, style]}>{children}</View>;
}

/** The logo in its own colours as a small shop sign (lime on green), as on the sign-in pages. */
export function LogoSign({ height = 36 }: { height?: number }) {
  return <View style={[styles.sign, { borderRadius: height * 0.3, paddingVertical: height * 0.2, paddingHorizontal: height * 0.28 }]}
    accessibilityRole="header" accessibilityLabel="Casa & Te">
    <BrandLogo width={height * 1.6} color={colors.signInk} />
  </View>;
}

/** Round icon button on the band, with an optional yellow count. */
export function HeaderButton({ icon, label, onPress, count, filled }: {
  icon: IconName; label: string; onPress: () => void; count?: number; filled?: boolean;
}) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
    style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
    <Icon name={icon} size={icon === 'search' ? 20 : 21} color={colors.bandText} strokeWidth={icon === 'search' ? 2.1 : 1.8} fill={filled ? colors.bandText : undefined} />
    {!!count && <View style={styles.count}><Text style={styles.countText}>{count > 99 ? '99+' : count}</Text></View>}
  </Pressable>;
}

/** Round back button on the band. */
export function HeaderBack({ onPress, icon = 'back', label = 'Indietro' }: { onPress: () => void; icon?: IconName; label?: string }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
    style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
    <Icon name={icon} size={icon === 'close' ? 18 : 22} color={colors.bandText} strokeWidth={2.3} />
  </Pressable>;
}

/** Search field in the band (outlined, like the sign-in fields): a real input, or a button that opens the search page. */
export function HeaderSearch({ onPress, placeholder, ...input }: TextInputProps & { onPress?: () => void; placeholder: string }) {
  const [focused, setFocused] = useState(false);
  if (onPress) return <Pressable onPress={onPress} accessibilityRole="search" accessibilityLabel={placeholder}
    style={({ pressed }) => [styles.search, pressed && { opacity: 0.92 }]}>
    <Icon name="search" size={20} color={colors.text} strokeWidth={2.1} />
    <Text style={styles.placeholder} numberOfLines={1}>{placeholder}</Text>
  </Pressable>;
  return <View style={[styles.search, focused && styles.searchFocused]}>
    <Icon name="search" size={20} color={colors.text} strokeWidth={2.1} />
    <TextInput placeholder={placeholder} placeholderTextColor={colors.faint} accessibilityLabel={placeholder}
      style={styles.input} returnKeyType="search" autoCorrect={false} {...input}
      onFocus={(e) => { setFocused(true); input.onFocus?.(e); }} onBlur={(e) => { setFocused(false); input.onBlur?.(e); }} />
  </View>;
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.band, overflow: 'hidden' },
  sign: { backgroundColor: colors.sign, alignSelf: 'flex-start' },
  stripes: { flexDirection: 'row' },
  edge: { height: 12, flexDirection: 'row', overflow: 'hidden', marginTop: -1 },
  scallop: { width: STRIPE, height: 22, borderRadius: 11, marginTop: -11 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  title: { fontFamily: fonts.display, color: colors.bandText, letterSpacing: -0.6 },
  subtitle: { fontSize: 14, fontFamily: fonts.sans, color: colors.bandMuted, marginTop: 2 },
  button: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bandButton, alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', top: 1, right: -1, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4,
    backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11.5, fontFamily: fonts.heavy, color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 54, borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: '#8C9189' },
  searchFocused: { borderWidth: 2, borderColor: colors.green, paddingHorizontal: 15.5 },
  placeholder: { flex: 1, fontSize: 15.5, fontFamily: fonts.sansMedium, color: colors.muted },
  input: { flex: 1, minWidth: 0, height: 46, fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.text, outlineWidth: 0, outlineStyle: 'none' } as object,
});
