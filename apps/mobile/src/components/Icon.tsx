import Svg, { Path } from 'react-native-svg';
import type { ColorValue } from 'react-native';
import { colors } from '@/config/theme';
const paths = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3Z',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  bag: 'M5 7h14l2 14H3L5 7Zm3 0V5a4 4 0 0 1 8 0v2',
  grid: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
  box: 'm3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10M7.5 4.5l9 5v5',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
  pin: 'M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0ZM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  chevron: 'm9 5 7 7-7 7', down: 'm6 9 6 6 6-6',
  arrow: 'M4 12h16m-6-6 6 6-6 6', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', check: 'm5 12 4 4L19 6',
  truck: 'M1 4h13v13H1ZM14 9h5l4 5v3h-9M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0M21 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  store: 'M3 9v12h18V9M2 9l2-7h16l2 7M2 9c0 4 5 4 5 0 0 4 5 4 5 0 0 4 5 4 5 0 0 4 5 4 5 0M9 21v-7h6v7',
  card: 'M2 5h20v14H2ZM2 9h20M6 15h4',
  shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-5 9 3 3 7-7',
  leaf: 'M20 3C7 1 1 9 6 16s16 2 14-13ZM4 21l12-12',
  bell: 'M5 9a7 7 0 0 1 14 0v6l2 3H3l2-3V9Zm4 12h6',
  help: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5M12 17v.1',
  close: 'm6 6 12 12M6 18 18 6',
  cart: 'M2 3h3l2.4 11.2a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.5L21 7H6M10 20.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0M19 20.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  sort: 'M4 6h16M7 12h10M10 18h4',
  back: 'm15 5-7 7 7 7',
  heart: 'M12 20.5s-8-4.6-8-11A4.5 4.5 0 0 1 12 6.6a4.5 4.5 0 0 1 8 2.9c0 6.4-8 11-8 11Z',
  share: 'M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v8h14v-8',
  menu: 'M4 6.5h16M4 12h16M4 17.5h16',
  list: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
  diamond: 'M6 3h12l4 6-10 12L2 9l4-6ZM2 9h20M12 21 8 9l4-6 4 6-4 12',
  drop: 'M12 3s7 7.6 7 12a7 7 0 0 1-14 0c0-4.4 7-12 7-12Z',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z',
  recycle: 'M7 19H4.5a1.5 1.5 0 0 1-1.3-2.3L7 10M13 19h6.5a1.5 1.5 0 0 0 1.3-2.3L18 12M9 5l1.7-2.3a1.5 1.5 0 0 1 2.6 0L17 9M5 13l2-3 3 1.5M16 22l-3-3 3-3M20 9l-3 0-1-3',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-1.5v-6a1.5 1.5 0 0 1 3 0V12m0-5.5a1.5 1.5 0 0 1 3 0V13m0-3.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4L3.5 15a1.5 1.5 0 0 1 2.5-1.6L8 16',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6ZM19 3v4M17 5h4',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8ZM5 21h14',
  copy: 'M9 9h11v11H9ZM5 15H4V4h11v1',
  weight: 'M4 7h16l2 14H2L4 7Zm5 0V5a3 3 0 1 1 6 0v2',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 22, color = colors.text, strokeWidth = 1.65, fill }: {
  name: IconName; size?: number; color?: ColorValue; strokeWidth?: number; fill?: ColorValue;
}) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <Path d={paths[name]} stroke={color} fill={fill ?? 'none'} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
