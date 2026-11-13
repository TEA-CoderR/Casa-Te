import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts, radius, type } from '@/config/theme';
import { LOGO_MONO } from '@/config/logoPaths';
import { Barcode } from './Barcode';
import { Icon } from './Icon';

/** The interlaced CT of the logo, drawn as a vector (crisp at any size). */
export function Monogram({ width, color, opacity = 1, style }: { width: number; color: string; opacity?: number; style?: ViewStyle }) {
  return <View style={style} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={width} height={width / LOGO_MONO.aspect} viewBox={LOGO_MONO.viewBox}>
      <Path d={LOGO_MONO.d} fill={color} fillOpacity={opacity} />
    </Svg>
  </View>;
}

/** The big monogram as a quiet texture on the green band (Home, Profilo). */
export function BandWatermark({ top = 24 }: { top?: number }) {
  return <Monogram width={420} color={colors.bandLogo} opacity={0.07} style={{ position: 'absolute', right: -150, top }} />;
}

const spaced = (card: string) => card.replace(/(.{4})(?=.)/g, '$1 ');

/**
 * The member's card (November 2026): the logo's colours reversed — green lettering on the lime — hanging from the band.
 * With a linked card it carries the barcode to scan at the till (tap to enlarge); otherwise it invites the next step.
 */
export function ClubPass({ name, card, title, action, onPress, style, kicker = 'TESSERA SOCI' }: {
  kicker?: string; name?: string; card?: string | null; title?: string; action?: string; onPress?: () => void; style?: ViewStyle;
}) {
  const [zoom, setZoom] = useState(false);
  const press = card ? () => setZoom(true) : onPress;
  return <>
    <Pressable onPress={press} accessibilityRole="button"
      accessibilityLabel={card ? 'Tessera Soci: tocca per ingrandire il codice a barre' : [title, action].filter(Boolean).join('. ')}
      style={({ pressed }) => [styles.card, style, pressed && { transform: [{ scale: 0.985 }] }]}>
      <Monogram width={300} color={colors.band} opacity={0.07} style={{ position: 'absolute', right: -90, bottom: -70 }} />
      <View style={styles.head}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Monogram width={54} color={colors.band} />
      </View>
      {!!name && <Text style={styles.name} numberOfLines={1}>{name}</Text>}
      {card ? <View style={styles.code}>
        <Barcode value={card} height={52} color={colors.text} />
        <Text style={styles.number}>{spaced(card)}</Text>
      </View> : <View style={{ marginTop: 'auto' }}>
        {!!title && <Text style={styles.title}>{title}</Text>}
        {!!action && <View style={styles.button}><Text style={styles.buttonText}>{action}</Text></View>}
      </View>}
    </Pressable>
    {!!card && <ClubCodeModal card={card} visible={zoom} onClose={() => setZoom(false)} />}
  </>;
}

/** The member's barcode, large and on white, to scan at the till. */
export function ClubCodeModal({ card, visible, onClose }: { card: string; visible: boolean; onClose: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi">
      <View style={styles.big}>
        <Text style={styles.bigKicker}>TESSERA SOCI · CASA & TE</Text>
        <Barcode value={card} height={120} color="#000" />
        <Text style={styles.bigNumber} selectable>{spaced(card)}</Text>
        <Text style={styles.bigHint}>Mostrala alla cassa. Tocca per chiudere.</Text>
      </View>
    </Pressable>
  </Modal>;
}

/**
 * The member's card in one row (Home): a small lime card on the left, two lines, a chevron. With a linked card it opens
 * the barcode; without, `onPress` (to link it on the Club page).
 */
export function ClubRow({ card, title, text, onPress, style }: { card?: string | null; title: string; text: string; onPress?: () => void; style?: ViewStyle }) {
  const [zoom, setZoom] = useState(false);
  return <>
    <Pressable onPress={card ? () => setZoom(true) : onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${text}`}
      style={({ pressed }) => [styles.row, style, pressed && { opacity: 0.85 }]}>
      <View style={styles.mini}><Monogram width={26} color={colors.band} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowText} numberOfLines={1}>{text}</Text>
      </View>
      <Icon name="chevron" size={16} color={colors.faint} strokeWidth={2.2} />
    </Pressable>
    {!!card && <ClubCodeModal card={card} visible={zoom} onClose={() => setZoom(false)} />}
  </>;
}

const styles = StyleSheet.create({
  card: { height: 218, borderRadius: 22, padding: 18, paddingHorizontal: 20, backgroundColor: colors.bandLogo, overflow: 'hidden',
    shadowColor: '#143019', shadowOpacity: 0.32, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kicker: { fontSize: 11.5, letterSpacing: 2, fontFamily: fonts.sansBold, color: colors.band, marginTop: 4 },
  name: { fontSize: 19, fontFamily: fonts.sansSemiBold, color: colors.band, marginTop: -4 },
  code: { marginTop: 'auto', backgroundColor: '#FFFFFF', borderRadius: 12, paddingTop: 10, paddingBottom: 6, paddingHorizontal: 14 },
  number: { textAlign: 'center', fontSize: 12.5, letterSpacing: 2.4, fontFamily: fonts.sansSemiBold, color: colors.text, marginTop: 4 },
  title: { fontSize: 25, lineHeight: 28, letterSpacing: -0.6, fontFamily: fonts.display, color: colors.band },
  button: { alignSelf: 'flex-start', marginTop: 14, height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: colors.band, justifyContent: 'center' },
  buttonText: { fontSize: 15, fontFamily: fonts.sansSemiBold, color: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  mini: { width: 44, height: 28, borderRadius: 6, backgroundColor: colors.bandLogo, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...type.cardTitle, color: colors.text },
  rowText: { ...type.small, color: colors.muted, marginTop: 1 },
  scrim: { flex: 1, backgroundColor: 'rgba(12,24,15,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  big: { alignSelf: 'stretch', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 22, gap: 12 },
  bigKicker: { fontSize: 12, letterSpacing: 2, fontFamily: fonts.sansBold, color: colors.green, textAlign: 'center' },
  bigNumber: { textAlign: 'center', fontSize: 18, letterSpacing: 3, fontFamily: fonts.sansSemiBold, color: colors.text },
  bigHint: { textAlign: 'center', fontSize: 13, fontFamily: fonts.sans, color: colors.muted },
});
