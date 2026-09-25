# CASA & TE — Native UI redesign, 25 September 2026

Current project note (26 September 2026): package.json now uses Expo SDK 57 for the
installed Expo Go. The SDK 54 notes below describe an earlier connection attempt.
See DEMO_V0.2_DECISIONS.md for the later retail UI direction and B1 work.

Connection follow-up: the project now uses Expo SDK 54 (Expo 54.0.37 / React Native
0.81.5 / React 19.1.0) for store-installed Expo Go. The initial SDK 57 selection was
not suitable for that assumption. A Windows Public-network block of the exact Node
runtime was also found and repaired with user-authorized LocalSubnet TCP 8081 access.
See README.md and scripts/enable-expo-lan.ps1 for connection diagnostics and rollback.

The implementation remains a React Native / Expo mobile application with Expo Router.
The browser is used only for automated viewport inspection. Physical iOS and Android
interaction still needs device validation.

## What changed

- Home: typographic CASA & TE wordmark, preferred store, native search entry, lifestyle
  editorial image, shipping message, horizontally scrollable categories, product grid.
- Catalog: photographic demo product imagery, restrained product cards, horizontal
  category tabs, search clear control and price sorting.
- Native navigation: a consistent SVG icon set, safe-area-aware bottom tabs and
  back navigation when a product is opened directly.
- Product detail: large image, readable price/details, quantity stepper and fixed
  bottom add-to-cart action.
- Cart: product thumbnails, quantity controls, shipping progress, order summary
  and fixed checkout action.
- Checkout: delivery icons/radio states, address labels, payment selection and a
  fixed confirmation/total area. Keyboard avoidance is configured for iOS.
- Orders and success: product thumbnails, order summary and connected status timeline.
- Profile: store preferences and clearly labeled demo information.
- Removed emoji imagery from rendered screens. Mock prices, availability and photos
  remain visibly identified as demo content. Shipping and business rules are unchanged.

Shared additions: src/components/Icon.tsx, UI.tsx, ProductVisual.tsx,
src/data/productImages.ts. Updated Screen.tsx, ProductCard.tsx, root/tab layouts,
all shopping screens and tests/smoke.cjs. Added react-native-svg 15.15.4, the version
bundled with the installed Expo SDK at redesign time; the connection repair subsequently
aligned SVG to 15.12.1 for SDK 54. Existing original logo asset is retained.

## Validation

- Strict TypeScript check.
- Existing 11 business acceptance tests, including shipping band boundaries.
- Full browser shopping smoke test: browsing/search, cart quantity/removal, all delivery
  choices, free shipping, overweight rates, mock orders and persistence after reload.
- Actual rendered screenshots for Home, Catalog, Product, Cart, Checkout, Orders and
  Profile at 360, 390 and 430 pixels, saved to test-results/app-*.png.
- iOS, Android and web bundles compiled with Expo.
- Expo Go QR generated from the locally reachable LAN manifest, saved to
  test-results/expo-go.png. On this machine the current address is
  exp://192.168.1.94:8081. Both devices must use the same network.
- Real-device keyboard, gestures and safe-area acceptance remains pending.

## Run on phone

Run ./start-demo.ps1 from this directory, then scan the terminal QR with Expo Go.
An Expo development server is already running on port 8081 in this session.
The current QR is test-results/expo-go.png. The QR/address must be regenerated
if the computer changes networks. This is a development demo, not a signed store release.

## Generated assets

Mode: built-in imagegen skill/tool, not the API/CLI fallback.
Both selected outputs were copied into this project. No original asset was overwritten.

1. assets/home-editorial-v2.png — synthetic lifestyle photo.
2. assets/products-demo-v2.png — synthetic 4-by-2 product sprite sheet.
   ProductVisual renders individual cells without editing the source sheet.

Final prompt 1:
> Use case: photorealistic-natural. Asset type: landscape lifestyle banner for CASA & TE Italian household retail mobile app demo. Create a photorealistic editorial still life, landscape 3:2. A warm sunlit Italian kitchen counter with sage green ceramic bowls, neat folded beige cotton tea towels, simple glass food storage containers, a sprig of olive foliage in a cream ceramic vase. Composition: all main objects concentrated toward the right half and bottom right, left half is calm warm pale ivory plaster wall with soft window shadows, no distracting objects. Refined but approachable everyday homeware, natural materials, warm morning daylight, gentle realistic shadows. Palette ivory, sage green, pale oak, muted terracotta. No people, no text, no lettering, no logos, no borders. This is a demo illustration, no identifiable commercial brands. Save as project-bound raster asset.

Final prompt 2:
> Use case: product-mockup. Asset type: single precise product sprite sheet for a native household-shopping app demo. A landscape image with EXACTLY 4 columns and 2 rows of equal square cells, no gutters, no grid lines, each cell seamless identical solid warm off-white background #F3F3EF. Eight independent unbranded product photography cutouts centered in their own cell with at least 15 percent clear margins. TOP row left to right: 1 a sage green laundry detergent bottle with integrated handle and white cap, plain blank cream label, 2 six white kitchen paper towel rolls neatly stacked, 3 five transparent glass food storage containers with pale green lids neatly nested/grouped, 4 a single dark charcoal nonstick frying pan with wooden handle diagonally arranged fully inside cell. BOTTOM row left to right: 5 a simple matte light sage rectangular pedal waste bin, 6 a small warm beige mushroom shaped table lamp, 7 three neatly folded cotton towels in cream sage and sand, 8 a large cream fabric storage organizer box with handles. Photorealistic studio catalogue photography, soft contact shadows, consistent camera and lighting, every object entirely contained inside its own cell. No text, no numerals, no branding, no decorative props, no people, no watermarks. Strict 4-column 2-row grid, wide landscape 2:1 aspect ratio. These are synthetic demo products, not real inventory.

