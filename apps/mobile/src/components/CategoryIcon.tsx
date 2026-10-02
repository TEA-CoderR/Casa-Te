import Svg, { Path } from 'react-native-svg';
import type { ColorValue } from 'react-native';
import { colors } from '@/config/theme';

/** Line drawings for the store's departments (24×24, stroked). Keyed by category slug. */
const paths: Record<string, string> = {
  // Spray bottle
  detersivi: 'M9 3h5l3 2h-3v3h-4V3ZM10 8h4l3 4v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8l3-4ZM7 14h10',
  // Pot with lid
  casalinghi: 'M4 11h16v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6ZM2 13h2M20 13h2M5 11a7 3 0 0 1 14 0M12 6v2',
  // Towel on a hanger
  tessile: 'M12 8.5a2.2 2.2 0 1 1 2.2-2.2c0 1.2-2.2 1.4-2.2 2.9l8.6 6.1a.9.9 0 0 1-.5 1.7H3.9a.9.9 0 0 1-.5-1.7L12 9.2M6 17v4h12v-4M6 19h12',
  // Bathtub
  bagno: 'M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3ZM6 12V6a2 2 0 0 1 4 0v.5M7 20l-1 2M17 20l1 2',
  // Tap with a drop
  idraulica: 'M3 9h9a5 5 0 0 1 5 5v1h-3v-1a2 2 0 0 0-2-2H3ZM7 9V5M4 5h6M15.5 18.5c0 1 .7 1.8 0 2.5-.7-.7 0-1.5 0-2.5Z',
  // Hammer
  ferramenta: 'M9 3h7l4 4v2h-4l-2-2H9ZM14 7l-9.5 9.5a2 2 0 0 0 3 3L17 10',
  // Paper cup
  monouso: 'M5 7h14M6.5 7 8 21h8l1.5-14M7 3h10l1 4H6l1-4ZM7.3 12h9.4',
  // Sprout in a pot
  giardinaggio: 'M6 14h12l-1.5 7h-9ZM12 14V8M12 10c0-3-2-5-6-5 0 3 2 5 6 5ZM12 8c0-2.5 2-4 5-4 0 2.5-2 4-5 4',
  // Snowflake and sun ray: the season changes
  stagionale: 'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 3.5l3 2 3-2M9 20.5l3-2 3 2',
  // Paw
  pets: 'M12 13c-3 0-5.5 3.5-5.5 5.5 0 2 2 2.5 3.5 2 1-.3 1.4-.5 2-.5s1 .2 2 .5c1.5.5 3.5 0 3.5-2 0-2-2.5-5.5-5.5-5.5ZM4 10.5a1.6 2 0 1 0 3.2 0 1.6 2 0 1 0-3.2 0M7.6 5.5a1.6 2 0 1 0 3.2 0 1.6 2 0 1 0-3.2 0M13.2 5.5a1.6 2 0 1 0 3.2 0 1.6 2 0 1 0-3.2 0M16.8 10.5a1.6 2 0 1 0 3.2 0 1.6 2 0 1 0-3.2 0',
  // Toy blocks
  giocattoli: 'M4 13h7v7H4ZM13 13h7v7h-7ZM8.5 5h7v7h-7ZM12 7.5v3M6.5 15.5v2M16.5 15.5h-1.5v2h1.5',
  // Pencil
  cartoleria: 'M15 4l5 5L9 20H4v-5L15 4ZM13 6l5 5M4 20l3.5-1.5',
  // Perfume bottle
  profumeria: 'M6 11h12v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-9ZM10 11V8h4v3M9 8h6V5H9ZM15 5h2.5M9 15.5h6',
};
const fallback = 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z';

const key = (slug: string) => slug.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');

export function CategoryIcon({ slug, name = '', size = 32, color = colors.green, strokeWidth = 1.4 }: {
  slug: string; name?: string; size?: number; color?: ColorValue; strokeWidth?: number;
}) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <Path d={paths[key(slug)] ?? paths[key(name)] ?? fallback} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
