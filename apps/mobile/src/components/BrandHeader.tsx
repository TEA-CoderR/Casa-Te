import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/config/theme';
import { brandLogoStacked, STACKED_ASPECT } from '@/config/brand';
import { Icon, type IconName } from './Icon';

/** Radius of the band's rounded bottom corners (the cart and profile look). */
export const BAND_RADIUS = 28;

/**
 * Phone header band: solid deep green, edge to edge under the status bar, with rounded bottom corners (cards may
 * hang over it). Layouts:
 * - inline (default): [left] title + subtitle … [right] in one row (Carrello, Ordini, Ordine);
 * - `stacked`: the buttons row, then a large title below it (Reparto, Home greeting, Accesso);
 * `pad` = [top, horizontal, bottom] inside the band; `overlap` is extra bottom room for a card that hangs from it.
 */
export function BrandHeader({ title, subtitle, logo, logoHeight = 36, left, right, overlap = 0, inScroll, stacked,
  titleSize, titleGap, pad = [14, 16, 18], children }: PropsWithChildren<{
  title?: string; subtitle?: string; logo?: boolean; logoHeight?: number; left?: ReactNode; right?: ReactNode; overlap?: number;
  /** Rendered inside the page's scroll view (Screen `top`): the status bar inset is painted by `StatusBand`. */
  inScroll?: boolean; stacked?: boolean; titleSize?: number; titleGap?: number;
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
        {logo && <Image source={brandLogoStacked} accessibilityLabel="Casa & Te — Per la tua casa e per te" accessibilityRole="header"
          style={{ width: logoHeight * STACKED_ASPECT, height: logoHeight }} resizeMode="contain" />}
        {!stacked && heading}
        <View style={{ flex: 1 }} />
        {right}
      </View>}
      {stacked && heading}
      {children}
    </View>
  </View>;
}

/** The status bar area above a scrolling band (Screen `header` when the band is the Screen `top`). */
export function StatusBand() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.top, backgroundColor: colors.brand, zIndex: 3 }} />;
}

/** A card that hangs from the band's bottom edge (store card, active order): pulls itself up over the band. */
export function HangingCard({ children, style, overlap = 34 }: PropsWithChildren<{ style?: ViewStyle; overlap?: number }>) {
  return <View style={[{ marginTop: -overlap - 12, marginHorizontal: 16, zIndex: 2, elevation: 6 }, style]}>{children}</View>;
}

/** Round icon button on the green band, with an optional yellow count. */
export function HeaderButton({ icon, label, onPress, count, filled }: {
  icon: IconName; label: string; onPress: () => void; count?: number; filled?: boolean;
}) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
    style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
    <Icon name={icon} size={icon === 'search' ? 20 : 21} color="#FFFFFF" strokeWidth={icon === 'search' ? 2.1 : 1.8} fill={filled ? '#FFFFFF' : undefined} />
    {!!count && <View style={styles.count}><Text style={styles.countText}>{count > 99 ? '99+' : count}</Text></View>}
  </Pressable>;
}

/** Round back button on the green band. */
export function HeaderBack({ onPress, icon = 'back', label = 'Indietro' }: { onPress: () => void; icon?: IconName; label?: string }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
    style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
    <Icon name={icon} size={icon === 'close' ? 18 : 22} color="#FFFFFF" strokeWidth={2.3} />
  </Pressable>;
}

/** White search pill inside the band: a real input, or a button that opens the search page. */
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
  band: { backgroundColor: colors.brand, overflow: 'hidden', borderBottomLeftRadius: BAND_RADIUS, borderBottomRightRadius: BAND_RADIUS },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  title: { fontFamily: fonts.display, color: '#FFFFFF', letterSpacing: -0.3 },
  subtitle: { fontSize: 14, fontFamily: fonts.sans, color: colors.onBrand, marginTop: 2 },
  button: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', top: 1, right: -1, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4,
    backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11.5, fontFamily: fonts.heavy, color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', paddingHorizontal: 18,
    shadowColor: '#0A180C', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  searchFocused: { borderWidth: 3, borderColor: colors.yellow, paddingHorizontal: 15 },
  placeholder: { flex: 1, fontSize: 15.5, fontFamily: fonts.sansMedium, color: colors.muted },
  input: { flex: 1, minWidth: 0, height: 46, fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.text, outlineWidth: 0 } as object,
});
