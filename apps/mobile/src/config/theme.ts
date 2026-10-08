import { Platform } from 'react-native';

/**
 * Brand look (design D "Insegna"): the CASA & TE store sign — logo green with the yellow lettering —
 * for the header band, deep green for actions, red only for discounts, white product plates on a light ground.
 * Keys `lime`, `cream`, `sand` and `stone` are kept for older screens and the desktop catalogue.
 */
export const colors = {
  /** Actions, links, active tab (white text on it passes AA). */
  green: '#2F5A26',
  greenDark: '#22441C',
  /** The logo's green: header band and large brand surfaces only (white text on it is large/bold). */
  brand: '#51883F',
  /** The logo's yellow: badges, price tags and highlights on green. */
  yellow: '#F6EB11',
  /** Pale green fills (icon circles, availability). */
  mint: '#E7F0E1',
  lime: '#F3E9D6',
  cream: '#F4EFE6',
  sand: '#F6EEDF',
  /** Phone pages: light ground under white cards. */
  page: '#F4F5F1',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#1A1F17',
  muted: '#5D6657',
  /** Secondary icons and inactive tabs: still ≥4.5:1 on white. */
  faint: '#6B7265',
  line: '#E4E7E0',
  /** Desktop print rules (hairlines between catalogue rows and sections). */
  rule: '#E4DCCD',
  /** Warm stone ground (desktop footer, closing tiles, hover fills). */
  stone: '#F4EFE6',
  /** Product photographs always sit on white, like their studio backgrounds (owner's choice). */
  photo: '#FFFFFF',
  /** Thin frame around white photo plates on white pages. */
  photoLine: '#E4E7E0',
  badge: '#D62828',
  /** Discounts: solid red label and red sale price, meant to stand out. */
  sale: '#D62828',
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
 * Phone app (design D): Barlow for everything, Barlow Semi Condensed for prices (supermarket price tags).
 * The desktop catalogue keeps EB Garamond (`serif*`) and the Bodoni wordmark (`display`).
 */
export const fonts = {
  serif: family('EBGaramond_400Regular', serifFallback),
  serifMedium: family('EBGaramond_500Medium', serifFallback),
  serifBold: family('EBGaramond_500Medium', serifFallback),
  display: family('BodoniModa_600SemiBold', serifFallback),
  sans: family('Barlow_400Regular', sansFallback),
  sansMedium: family('Barlow_500Medium', sansFallback),
  sansSemiBold: family('Barlow_600SemiBold', sansFallback),
  sansBold: family('Barlow_700Bold', sansFallback),
  heavy: family('Barlow_800ExtraBold', sansFallback),
  price: family('BarlowSemiCondensed_800ExtraBold', sansFallback),
  priceBold: family('BarlowSemiCondensed_700Bold', sansFallback),
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
