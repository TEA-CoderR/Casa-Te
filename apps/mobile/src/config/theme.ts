import { Platform } from 'react-native';

/**
 * November 2026: white pages and header band, cool neutral hairlines and fills, the logo's lime as the signal,
 * the shop-sign green for the logo and the Club, deep green for actions and the tab bar. Before that:
 * Brand look (design F "La Tenda"): the awning of a Tuscan shop front. Deep awning green with tone-on-tone
 * stripes and a scalloped edge frames every phone page; products sit on white plates on a warm ivory ground;
 * the logo yellow is the single signal (active tab, price chips, cart count); red only for discounts.
 * No pale tinted fills for states or messages (the September demo's pale-green panels, pills and icon circles):
 * a choice gets a green edge and a radio, a status a dot and words, a message a white plate with a coloured edge.
 * Keys `lime`, `cream`, `sand` and `stone` are kept for older screens and the desktop catalogue.
 */
export const colors = {
  /** Actions, links, active states (white text on it passes AA). */
  green: '#2D5A26',
  greenDark: '#143019',
  /** Awning band behind phone headers (stripes alternate `brand` and `stripe`). */
  brand: '#1F4127',
  stripe: '#234A2C',
  /** Filled controls (buttons, add, selected chips): ink on the white pages; the brand greens are small accents. */
  action: '#2D5A26',
  /** Light text on the dark green (tab bar, green buttons, the order-confirmed page). */
  onBrand: '#CFDDC6',
  /** Page headers (since the sign-in redesign): a white band with dark title, muted subtitle and light round buttons. */
  band: '#FFFFFF',
  bandText: '#121712',
  bandMuted: '#5D635C',
  bandButton: '#F3F4F1',
  /** The logo's own colours: lime lettering on the shop-sign green (the small sign in headers, the Club card). */
  sign: '#3B6B31',
  signInk: '#CDE434',
  /** The signal colour (active tab, price chips, cart count, the order card): the logo's lime since November 2026
   * (it was a lemon yellow #F3E33A). */
  yellow: '#D4E64A',
  lime: '#F3E9D6',
  cream: '#F4EFE6',
  sand: '#F6EEDF',
  /** Phone pages: warm ivory ground under white plates. */
  page: '#FFFFFF',
  /** Quiet fills on the ivory ground (segmented controls, steppers). */
  well: '#F3F4F1',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#121712',
  muted: '#5D635C',
  /** Secondary icons and inactive tabs: still ≥4.5:1 on white. */
  faint: '#6A7068',
  line: '#E6E8E4',
  /** Desktop print rules (hairlines between catalogue rows and sections). */
  rule: '#E4DCCD',
  /** Warm stone ground (desktop footer, closing tiles, hover fills). */
  stone: '#F4EFE6',
  /** Product photographs always sit on white, like their studio backgrounds (owner's choice). */
  photo: '#FFFFFF',
  /** Thin frame around white photo plates on white pages. */
  photoLine: '#E6E8E4',
  badge: '#C8231F',
  /** Discounts: solid red label and red sale price, meant to stand out. */
  sale: '#C8231F',
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
 * Phone app: Figtree everywhere (`display` = Figtree Bold for page and section titles, as on the sign-in pages),
 * prices in Figtree ExtraBold with raised cents. The desktop catalogue keeps EB Garamond (`serif*`).
 */
export const fonts = {
  serif: family('EBGaramond_400Regular', serifFallback),
  serifMedium: family('EBGaramond_500Medium', serifFallback),
  serifBold: family('EBGaramond_500Medium', serifFallback),
  /** Design "Pulito" (November 2026): Geist for everything, titles in Geist Bold (Figtree before). */
  display: family('Geist_700Bold', sansFallback),
  sans: family('Geist_400Regular', sansFallback),
  sansMedium: family('Geist_500Medium', sansFallback),
  sansSemiBold: family('Geist_600SemiBold', sansFallback),
  sansBold: family('Geist_700Bold', sansFallback),
  heavy: family('Geist_700Bold', sansFallback),
  price: family('Geist_600SemiBold', sansFallback),
  priceBold: family('Geist_700Bold', sansFallback),
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
  xl: 22,
  pill: 999,
} as const;

/** Soft card shadow used for product cards and floating search. */
export const cardShadow = {
  shadowColor: '#18201A',
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

/** Floating cards over the green band (store card, pass): a soft, offset shadow. */
export const floatShadow = {
  shadowColor: '#18201A',
  shadowOpacity: 0.13,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
} as const;

/** Height of the floating phone tab bar plus its margins (pages pad their bottom by this). */
export const TAB_BAR_SPACE = 88;
