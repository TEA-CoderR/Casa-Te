import { Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '@/config/theme';

const STAR = 'm12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9L12 2.5Z';
export const STAR_COLOR = '#E0A21B';

/** Read-only stars for an average (fractions are drawn as partial stars). */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${value.toLocaleString('it-IT')} su 5`}>
    {[0, 1, 2, 3, 4].map((i) => {
      const fill = Math.max(0, Math.min(1, value - i));
      const id = `s${i}-${Math.round(fill * 100)}`;
      return <Svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset={fill} stopColor={STAR_COLOR} /><Stop offset={fill} stopColor="#E6DFD1" />
        </LinearGradient></Defs>
        <Path d={STAR} fill={`url(#${id})`} />
      </Svg>;
    })}
  </View>;
}

/** 1–5 star picker for writing a review. */
export function StarInput({ value, onChange, size = 32 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel="Valutazione">
    {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio"
      accessibilityState={{ checked: value === n }} accessibilityLabel={`${n} ${n === 1 ? 'stella' : 'stelle'}`} hitSlop={4}>
      <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <Path d={STAR} fill={n <= value ? STAR_COLOR : '#E6DFD1'} stroke={n <= value ? STAR_COLOR : colors.line} strokeWidth={1} />
      </Svg>
    </Pressable>)}
  </View>;
}
