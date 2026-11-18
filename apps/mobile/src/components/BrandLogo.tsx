import Svg, { Path } from 'react-native-svg';
import { colors } from '@/config/theme';
import { LOGO_FULL, LOGO_STACKED } from '@/config/logoPaths';

/**
 * The CASA & TE logo exactly as the company uses it (the two C over the name, with or without the
 * "Per la tua casa e per te" line), drawn as vectors so it stays sharp at any size and in any colour.
 */
export function BrandLogo({ width, color = colors.green, tagline = false, label = 'Casa & Te — Per la tua casa e per te' }: {
  width: number; color?: string; tagline?: boolean; label?: string;
}) {
  const art = tagline ? LOGO_FULL : LOGO_STACKED;
  return <Svg width={width} height={width / art.aspect} viewBox={art.viewBox} accessibilityLabel={label} accessibilityRole="image">
    <Path d={art.d} fill={color} fillRule="evenodd" />
  </Svg>;
}
