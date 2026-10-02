import { Platform } from 'react-native';

/**
 * "Bottega" look: warm white ground, deep forest green for actions, serif for names and prices.
 * Keys `lime` and `greenDark` are kept for older screens; `lime` is now the soft cream accent.
 */
export const colors = {
  green: '#1F4A33',
  greenDark: '#163826',
  lime: '#F3E9D6',
  cream: '#F4EFE6',
  sand: '#F6EEDF',
  /** Pages are white like the design; warm tones stay on accents (chips, banners, photo backdrop). */
  background: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#1B2620',
  muted: '#5E625A',
  /** Secondary icons and inactive tabs: still ≥4.5:1 on white. */
  faint: '#686C64',
  line: '#ECE6DB',
  badge: '#B3261E',
  danger: '#A62F2F',
} as const;

/**
 * Font families: each weight is its own family, loaded with expo-font in app/_layout.tsx.
 * On the web shop a CSS fallback stack keeps text readable while the files load.
 */
const family = (name: string, fallback: string) => Platform.OS === 'web' ? `${name}, ${fallback}` : name;
const serifFallback = 'Georgia, "Times New Roman", serif';
const sansFallback = 'system-ui, -apple-system, "Segoe UI", sans-serif';
/**
 * EB Garamond for names, titles and prices (fine strokes, normal lining figures for prices);
 * Bodoni Moda only for the "Casa & Te" wordmark. Both are subset to Latin in assets/fonts (OFL).
 */
export const fonts = {
  serif: family('EBGaramond_400Regular', serifFallback),
  serifMedium: family('EBGaramond_500Medium', serifFallback),
  serifBold: family('EBGaramond_500Medium', serifFallback),
  display: family('BodoniModa_600SemiBold', serifFallback),
  sans: family('HankenGrotesk_400Regular', sansFallback),
  sansMedium: family('HankenGrotesk_500Medium', sansFallback),
  sansSemiBold: family('HankenGrotesk_600SemiBold', sansFallback),
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  pill: 999,
} as const;

/** Soft card shadow used for product cards and floating search. */
export const cardShadow = {
  shadowColor: '#3A2E1A',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;
