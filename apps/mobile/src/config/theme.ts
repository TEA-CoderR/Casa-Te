import { Platform } from 'react-native';

/**
 * Brand look (design F "La Tenda"): a solid deep green band (no stripes, straight edge) tops every phone page,
 * cards may hang over its edge; products sit on white plates on a warm ivory ground;
 * the logo yellow is the single signal (active tab, price chips, cart count); red only for discounts.
 * No pale tinted fills for states or messages (the September demo's pale-green panels, pills and icon circles):
 * a choice gets a green edge and a radio, a status a dot and words, a message a white plate with a coloured edge.
 * Keys `lime`, `cream`, `sand` and `stone` are kept for older screens and the desktop catalogue.
 */
export const colors = {
  /** Actions, links, active states (white text on it passes AA). */
  green: '#1F4127',
  greenDark: '#143019',
  /** Solid band behind phone headers. */
  brand: '#1F4127',
  /** Text on the green band that is not the title (≥4.5:1 on the band). */
  onBrand: '#CFDDC6',
  /** The logo's yellow: active tab, price chips, cart count, the order-ready card. */
  yellow: '#F3E33A',
  lime: '#F3E9D6',
  cream: '#F4EFE6',
  sand: '#F6EEDF',
  /** Phone pages: warm ivory ground under white plates. */
  page: '#F5F3EC',
  /** Quiet fills on the ivory ground (segmented controls, steppers). */
  well: '#EAE6DB',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#18201A',
  muted: '#5F665C',
  /** Secondary icons and inactive tabs: still ≥4.5:1 on white. */
  faint: '#6B7167',
  line: '#E3DED1',
  /** Desktop print rules (hairlines between catalogue rows and sections). */
  rule: '#E4DCCD',
  /** Warm stone ground (desktop footer, closing tiles, hover fills). */
  stone: '#F4EFE6',
  /** Product photographs always sit on white, like their studio backgrounds (owner's choice). */
  photo: '#FFFFFF',
  /** Thin frame around white photo plates on white pages. */
  photoLine: '#E3DED1',
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
 * Phone app (design F): Bodoni Moda (`display`) for page and section titles, Figtree for everything else,
 * prices in Figtree ExtraBold with raised cents. The desktop catalogue keeps EB Garamond (`serif*`).
 */
export const fonts = {
  serif: family('EBGaramond_400Regular', serifFallback),
  serifMedium: family('EBGaramond_500Medium', serifFallback),
  serifBold: family('EBGaramond_500Medium', serifFallback),
  display: family('BodoniModa_600SemiBold', serifFallback),
  sans: family('Figtree_400Regular', sansFallback),
  sansMedium: family('Figtree_500Medium', sansFallback),
  sansSemiBold: family('Figtree_600SemiBold', sansFallback),
  sansBold: family('Figtree_700Bold', sansFallback),
  heavy: family('Figtree_800ExtraBold', sansFallback),
  price: family('Figtree_800ExtraBold', sansFallback),
  priceBold: family('Figtree_700Bold', sansFallback),
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
