import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, type } from '@/config/theme';
import { Icon, type IconName } from './Icon';

/**
 * The one list of the phone app (plan §3.6): no frame, a hairline between rows, rows at least 56 high,
 * a 17 title, an optional grey second line, an optional grey detail and a chevron on the right.
 */
export function ListRow({ title, subtitle, detail, icon, onPress, danger, chevron = !!onPress, right, first }: {
  title: string; subtitle?: string; detail?: string; icon?: IconName; onPress?: () => void; danger?: boolean;
  chevron?: boolean; right?: ReactNode; first?: boolean;
}) {
  const body = <>
    {!!icon && <Icon name={icon} size={21} color={danger ? colors.danger : colors.green} strokeWidth={1.9} />}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[styles.title, danger && { color: colors.danger }]} numberOfLines={2}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
    {!!detail && <Text style={styles.detail} numberOfLines={1}>{detail}</Text>}
    {right}
    {chevron && <Icon name="chevron" size={16} color={colors.faint} strokeWidth={2.2} />}
  </>;
  const style = [styles.row, first && { borderTopWidth: 0 }];
  if (!onPress) return <View style={style}>{body}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={[title, detail].filter(Boolean).join(', ')}
    style={({ pressed }) => [...style, pressed && { opacity: 0.6 }]}>{body}</Pressable>;
}

/** A group of rows with an optional uppercase title (ACCOUNT, ASSISTENZA). */
export function ListGroup({ title, children, style }: PropsWithChildren<{ title?: string; style?: object }>) {
  return <View style={[{ marginTop: title ? 28 : 0 }, style]}>
    {!!title && <Text style={styles.group} accessibilityRole="header">{title.toUpperCase()}</Text>}
    <View style={styles.rows}>{children}</View>
  </View>;
}

const styles = StyleSheet.create({
  rows: { borderBottomWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line },
  title: { ...type.cardTitle, color: colors.text },
  subtitle: { ...type.small, color: colors.muted, marginTop: 2 },
  detail: { ...type.small, fontFamily: fonts.sansMedium, color: colors.muted, maxWidth: '45%' },
  group: { ...type.kicker, color: colors.muted, marginBottom: 8 },
});
