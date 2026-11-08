import Svg, { Path } from 'react-native-svg';
import type { ColorValue } from 'react-native';
import { colors } from '@/config/theme';
import { ICON_PATHS } from '@/config/iconPaths';

export type IconName = keyof typeof ICON_PATHS;

/**
 * Icons: Phosphor (one drawn family, filled outlines on a 256 grid), November 2026. The names stay the app's own;
 * `strokeWidth` picks the weight (light under 1.6, bold from 2.2), `fill` the filled weight in that colour.
 */
export function Icon({ name, size = 22, color = colors.text, strokeWidth = 1.65, fill }: {
  name: IconName; size?: number; color?: ColorValue; strokeWidth?: number; fill?: ColorValue;
}) {
  const weight = fill ? 'fill' : strokeWidth < 1.6 ? 'light' : strokeWidth >= 2.2 ? 'bold' : 'regular';
  return <Svg width={size} height={size} viewBox="0 0 256 256" aria-hidden>
    <Path d={ICON_PATHS[name][weight]} fill={fill ?? color} />
  </Svg>;
}
