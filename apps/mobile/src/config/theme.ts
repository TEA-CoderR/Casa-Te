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
  green: '#1F4127',
  greenDark: '#143019',
  /** Awning band behind phone headers (stripes alternate `brand` and `stripe`). */
  brand: '#1F4127',
  stripe: '#234A2C',
  /** Light text on the dark green (tab bar, green buttons, the order-confirmed page). */
  onBrand: '#CFDDC6',
  /** Page headers: a plain deep-green band with white text and the logo in lime (November 2026, after the Esselunga
   * reference: one brand colour at the top, white pages below; white and lime bands were tried before). */
  band: '#1F4127',
  bandText: '#FFFFFF',
  bandMuted: '#CFDDC6',
  bandButton: 'rgba(255,255,255,0.14)',
  /** The logo on the band. */
  bandLogo: '#CDE434',
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
  well: '#F2F2EF',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#18201A',
  muted: '#5F665C',
  /** Secondary icons and inactive tabs: still ≥4.5:1 on white. */
  faint: '#6B7167',
  line: '#E8E8E3',
  /** Desktop print rules (hairlines between catalogue rows and sections). */
  rule: '#E4DCCD',
  /** Warm stone ground (desktop footer, closing tiles, hover fills). */
  stone: '#F4EFE6',
  /** Product photographs always sit on white, like their studio backgrounds (owner's choice). */
  photo: '#FFFFFF',
  /** Thin frame around white photo plates on white pages. */
  photoLine: '#E8E8E3',
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
  /** Page and section titles: Figtree Bold, as on the sign-in pages (Bodoni Moda until November 2026). */
  display: family('Figtree_700Bold', sansFallback),
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

/**
 * Corners (November 2026 plan §3.2): `sm` fields, thumbnails, badges; `md` cards, list groups, product and option cards;
 * `lg` the member card, order tickets, sheet tops, the home carousel; `pill` every button, chip and search field.
 * `xl` is an alias of `lg` for older code.
 */
export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 22,
  pill: 999,
} as const;

/**
 * The phone type scale (plan §3.1). Every phone text size comes from here; spread one and add colour:
 * `{ ...type.cardTitle, color: colors.text }`. Prices keep `PriceTag`.
 */
export const type = {
  /** Only full green brand pages: welcome, order confirmed. */
  hero: { fontSize: 48, lineHeight: 52, letterSpacing: -1.6, fontFamily: fonts.display },
  /** The big name in the band: the home store, the Profilo name. */
  display: { fontSize: 36, lineHeight: 40, letterSpacing: -1.1, fontFamily: fonts.display },
  title: { fontSize: 28, lineHeight: 33, letterSpacing: -0.6, fontFamily: fonts.display },
  /** The status on an order ticket. */
  ticket: { fontSize: 26, lineHeight: 31, letterSpacing: -0.7, fontFamily: fonts.display },
  section: { fontSize: 22, lineHeight: 27, letterSpacing: -0.4, fontFamily: fonts.display },
  cardTitle: { fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: fonts.sansSemiBold },
  body: { fontSize: 15, lineHeight: 21, fontFamily: fonts.sans },
  small: { fontSize: 13, lineHeight: 18, fontFamily: fonts.sans },
  /** Uppercase: only tickets, the card, welcome steps, the home store line, list group titles. */
  kicker: { fontSize: 11.5, lineHeight: 14, letterSpacing: 1.6, fontFamily: fonts.sansBold },
  micro: { fontSize: 11, lineHeight: 13, letterSpacing: 0.2, fontFamily: fonts.sansBold },
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
