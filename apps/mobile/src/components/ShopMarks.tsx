import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, fonts } from '@/config/theme';

/**
 * Small signs taken from the shop instead of generic icons in tinted circles (design H):
 * a hanging yellow price tag with a number, and an empty till receipt.
 */

/** Hanging yellow tag ("cartellino") with a step number; the hole shows the card behind it (white by default). */
export function StepTag({ n, hole = '#FFFFFF' }: { n: number | string; hole?: string }) {
  return <View style={tag.box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={30} height={37} viewBox="0 0 30 37" style={StyleSheet.absoluteFill}>
      <Path d="M0 8.1 15 0l15 8.1V33a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4Z" fill={colors.yellow} />
      <Circle cx={15} cy={8.5} r={2.5} fill={hole} />
    </Svg>
    <Text style={tag.n}>{n}</Text>
  </View>;
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, Consolas, "Courier New", monospace' });

/** An empty till receipt for the empty cart: "ARTICOLI 0 · TOTALE € 0,00", with a torn zigzag edge. */
export function EmptyReceipt() {
  const teeth = 14;
  const w = 170, step = w / teeth;
  let d = `M0 0H${w}V1`;
  for (let i = teeth; i > 0; i--) d += `L${(i - 0.5) * step} 7L${(i - 1) * step} 1`;
  d += 'Z';
  return <View style={rc.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={rc.paper}>
      <Text style={[rc.t, rc.head]}>CASA & TE</Text>
      <View style={rc.rule} />
      <View style={rc.row}><Text style={rc.t}>ARTICOLI</Text><Text style={rc.t}>0</Text></View>
      <View style={rc.row}><Text style={[rc.t, rc.b]}>TOTALE</Text><Text style={[rc.t, rc.b]}>€ 0,00</Text></View>
    </View>
    <Svg width={w} height={8} viewBox={`0 0 ${w} 8`}><Path d={d} fill="#FFFFFF" /></Svg>
  </View>;
}

const tag = StyleSheet.create({
  box: { width: 30, height: 37, alignItems: 'center', justifyContent: 'center', paddingTop: 7 },
  n: { fontSize: 15, fontFamily: fonts.heavy, color: colors.text },
});

const rc = StyleSheet.create({
  wrap: { width: 170, alignSelf: 'center' },
  paper: { backgroundColor: '#FFFFFF', paddingTop: 12, paddingHorizontal: 14, paddingBottom: 7 },
  t: { fontFamily: MONO, fontSize: 11.5, lineHeight: 16, color: '#2A302B' },
  head: { textAlign: 'center', fontWeight: '700', letterSpacing: 2 },
  b: { fontWeight: '700' },
  rule: { borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9C4B6', marginVertical: 7 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
