import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/config/theme';
import { brandLogoOnGreen, LOGO_ASPECT } from '@/config/brand';
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
 * Phone header band (design F "La Tenda"): the striped awning of the shop front, edge to edge under the status bar,
 * ending in a scalloped edge. Either the logo or a page title (Bodoni), optional left/right buttons, rows below.
 * `overlap` leaves room under the content for a card that hangs from the valance (store card, pickup pass).
 */
export function BrandHeader({ title, subtitle, logo, left, right, overlap = 0, inScroll, children }: PropsWithChildren<{
  title?: string; subtitle?: string; logo?: boolean; left?: ReactNode; right?: ReactNode; overlap?: number;
  /** Rendered inside the page's scroll view (Screen `top`): the status bar inset is painted by `StatusBand`. */
  inScroll?: boolean;
}>) {
  const insets = useSafeAreaInsets();
  // No zIndex: a card that hangs from the band (a later sibling in the scroll content) must paint over it.
  return <View>
    <View style={[styles.band, { paddingTop: (inScroll ? 0 : insets.top) + 10, paddingBottom: 14 + overlap }]}>
      <AwningStripes />
      <View style={styles.row}>
        {left}
        {logo
          ? <Image source={brandLogoOnGreen} accessibilityLabel="Casa & Te — Per la tua casa e per te" accessibilityRole="header"
              style={{ width: 168, height: 168 / LOGO_ASPECT }} resizeMode="contain" />
          : <View style={{ flexShrink: 1 }}>
              <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
              {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
            </View>}
        <View style={{ flex: 1 }} />
        {right}
      </View>
      {children}
    </View>
    <AwningEdge />
  </View>;
}

/** The status bar area above a scrolling awning (Screen `header` when the band is the Screen `top`). */
export function StatusBand() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.top, backgroundColor: colors.brand, overflow: 'hidden', zIndex: 3 }}><AwningStripes /></View>;
}

/** A card that hangs from the awning's valance (store card, active order): pulls itself up over the band. */
export function HangingCard({ children, style, overlap = 34 }: PropsWithChildren<{ style?: ViewStyle; overlap?: number }>) {
  return <View style={[{ marginTop: -overlap - 12, marginHorizontal: 16, zIndex: 2, elevation: 6 }, style]}>{children}</View>;
}

/** Round icon button on the green band, with an optional yellow count. */
export function HeaderButton({ icon, label, onPress, count, filled }: {
  icon: IconName; label: string; onPress: () => void; count?: number; filled?: boolean;
}) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
    style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
    <Icon name={icon} size={21} color="#FFFFFF" strokeWidth={1.9} fill={filled ? '#FFFFFF' : undefined} />
    {!!count && <View style={styles.count}><Text style={styles.countText}>{count > 99 ? '99+' : count}</Text></View>}
  </Pressable>;
}

/** Round back button on the green band. */
export function HeaderBack({ onPress, icon = 'back', label = 'Indietro' }: { onPress: () => void; icon?: IconName; label?: string }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
    style={({ pressed }) => [styles.button, { marginRight: 10 }, pressed && { opacity: 0.7 }]}>
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
  band: { backgroundColor: colors.brand, paddingHorizontal: 16, gap: 12, overflow: 'hidden' },
  stripes: { flexDirection: 'row' },
  edge: { height: 12, flexDirection: 'row', overflow: 'hidden', marginTop: -1 },
  scallop: { width: STRIPE, height: 22, borderRadius: 11, marginTop: -11 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 46 },
  title: { fontSize: 27, lineHeight: 33, fontFamily: fonts.display, color: '#FFFFFF' },
  subtitle: { fontSize: 14, fontFamily: fonts.sansMedium, color: colors.onBrand, marginTop: 1 },
  button: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', top: 1, right: -1, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4,
    backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11.5, fontFamily: fonts.heavy, color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', paddingHorizontal: 18,
    shadowColor: '#0A180C', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  searchFocused: { borderWidth: 3, borderColor: colors.yellow, paddingHorizontal: 15 },
  placeholder: { flex: 1, fontSize: 15.5, fontFamily: fonts.sansMedium, color: colors.muted },
  input: { flex: 1, minWidth: 0, height: 46, fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.text, outlineWidth: 0 } as object,
});
