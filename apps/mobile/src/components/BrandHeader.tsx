import type { PropsWithChildren, ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/config/theme';
import { brandLogoOnGreen, LOGO_ASPECT } from '@/config/brand';
import { Icon, type IconName } from './Icon';

/**
 * Phone header band (design D): the logo green of the store sign, edge to edge under the status bar.
 * Either the logo or a page title, optional left/right buttons, and rows (search, store) below.
 */
export function BrandHeader({ title, logo, left, right, children }: PropsWithChildren<{
  title?: string; logo?: boolean; left?: ReactNode; right?: ReactNode;
}>) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.band, { paddingTop: insets.top + 10 }]}>
    <View style={styles.row}>
      {left}
      {logo
        ? <Image source={brandLogoOnGreen} accessibilityLabel="Casa & Te — Per la tua casa e per te" accessibilityRole="header"
            style={{ width: 196, height: 196 / LOGO_ASPECT }} resizeMode="contain" />
        : <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>}
      <View style={{ flex: 1 }} />
      {right}
    </View>
    {children}
  </View>;
}

/** Round icon button on the green band, with an optional yellow count. */
export function HeaderButton({ icon, label, onPress, count, filled }: {
  icon: IconName; label: string; onPress: () => void; count?: number; filled?: boolean;
}) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
    style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
    <Icon name={icon} size={22} color="#FFFFFF" strokeWidth={1.9} fill={filled ? '#FFFFFF' : undefined} />
    {!!count && <View style={styles.count}><Text style={styles.countText}>{count > 99 ? '99+' : count}</Text></View>}
  </Pressable>;
}

/** Plain back chevron on the green band. */
export function HeaderBack({ onPress }: { onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Indietro" hitSlop={6}
    style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}>
    <Icon name="back" size={24} color="#FFFFFF" strokeWidth={2.2} />
  </Pressable>;
}

/** White search field inside the band: a real input, or a button that opens the search page. */
export function HeaderSearch({ onPress, placeholder, ...input }: TextInputProps & { onPress?: () => void; placeholder: string }) {
  if (onPress) return <Pressable onPress={onPress} accessibilityRole="search" accessibilityLabel={placeholder} style={styles.search}>
    <Icon name="search" size={20} color={colors.muted} strokeWidth={2} />
    <Text style={styles.placeholder} numberOfLines={1}>{placeholder}</Text>
  </Pressable>;
  return <View style={styles.search}>
    <Icon name="search" size={20} color={colors.muted} strokeWidth={2} />
    <TextInput placeholder={placeholder} placeholderTextColor={colors.faint} accessibilityLabel={placeholder}
      style={styles.input} returnKeyType="search" autoCorrect={false} {...input} />
  </View>;
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.brand, paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 46, gap: 4 },
  title: { fontSize: 24, fontFamily: fonts.heavy, fontWeight: '800', color: '#FFFFFF', flexShrink: 1 },
  button: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  back: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  count: { position: 'absolute', top: 2, right: 0, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4,
    backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11.5, fontFamily: fonts.heavy, fontWeight: '800', color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 14 },
  placeholder: { flex: 1, fontSize: 15.5, fontFamily: fonts.sansMedium, color: colors.muted },
  input: { flex: 1, minWidth: 0, height: 48, fontSize: 15.5, fontFamily: fonts.sansMedium, color: colors.text, outlineWidth: 0 } as object,
});
