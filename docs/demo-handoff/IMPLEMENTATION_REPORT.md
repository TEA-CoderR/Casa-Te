# Implementation report — September 25, 2026

Follow-up: Phase 4 native UI redesign was subsequently implemented at the user's request.
See `UI_REDESIGN.md` for current visuals and validation. The phase status below records
the initial implementation batch.

## Scope

Executed the master prompt through implementation Phases 0–3. Phase 4 visual polish
and Phase 5 approved content replacement have not been undertaken. Physical Android
and iOS acceptance remains open; compilation and browser checks do not establish
that a real phone runs without issues.

## Phase 0 — Runnable project

- Added Expo SDK 57 package manifest, lockfile, Expo config, strict TypeScript aliases,
  generated Expo environment declarations, and a Windows launcher.
- Installed dependencies matching the official Expo template and Expo compatibility check.
- Expo starts on port 8081. All native and web bundles compile, including the supplied logo.
- Corrected the tab icon color type for the current Expo Router API.
- Type checks and dependency compatibility checks pass.

## Phase 1 — Shopping flow

- Preserved existing Home, catalog search/category filtering, product detail, and cart UI.
- Isolated cart calculations in a domain module, using integer cents and grams to avoid
  floating-point threshold errors. Invalid quantities and unknown products are excluded.
- Added persistent preferred-store selection; Home displays the selected store.
- Added visible Italian demo disclosures, search empty state, and larger quantity/add controls.
- Gated routes on storage hydration to prevent early edits from racing persisted state.
- Automated browser flow verifies browsing, searching, product navigation, adding,
  changing quantity, removing products, and restoring the cart after reload.

## Phase 2 — Shipping and checkout

- `src/config/shipping.ts` is unchanged and remains the only shipping calculator.
- Added free-shipping progress and provisional-overweight messaging.
- All three delivery methods display recalculated rates and accessible selected states.
- Home address fields start empty and validate required fields plus a five-digit CAP.
- Store collection hides address fields and provides the store selector. Pickup points
  are labeled simulated; no real locker is invented or reserved.
- Added two mock payment choices; no payment details are collected.
- Eleven domain tests pass, including A1/A2, S1–S8, all subtotal/weight band boundaries,
  invalid quantities, and checkout totals/validation.
- Browser tests verify address visibility, free shipping with seven €9.99/0.8kg items,
  home-order confirmation, and provisional rates for an 11kg cart.

## Phase 3 — Orders

- Orders snapshot line items, selected store, mock payment, and home address when applicable.
- Confirmation awaits saving the order before clearing the cart; errors are shown and
  repeated confirmation taps are guarded.
- Success screen reads the persisted order instead of trusting a total in URL parameters.
- History includes fulfilment/store and explicitly simulated payment in the timeline.
- Browser tests verify confirmation, empty cart, saved order after reload, and store preferences.

## Changed files

Added: `.gitignore`, `package.json`, `package-lock.json`, `app.json`, `tsconfig.json`,
`expo-env.d.ts` (Expo generated), `start-demo.ps1`, `IMPLEMENTATION_REPORT.md`,
`src/domain/cart.ts`, `src/domain/checkout.ts`, `src/store/preferences.ts`,
`src/components/StoreSelector.tsx`, `src/components/PersistenceGate.tsx`,
`tests/business.test.ts`, and `tests/smoke.cjs`.

Updated: `README.md`, `src/store/cart.ts`, `src/store/orders.ts`, `src/types/order.ts`,
`src/components/Screen.tsx`, `src/components/ProductCard.tsx`, `src/app/_layout.tsx`,
`src/app/checkout.tsx`, `src/app/order-success.tsx`, `src/app/product/[id].tsx`, and the
tab files `_layout.tsx`, `index.tsx`, `catalog.tsx`, `cart.tsx`, `orders.tsx`, `profile.tsx`.

Local ignored outputs: `.tools/` (npm bootstrap because npm was absent), `.expo/`,
`node_modules/`, `dist/`, and `test-results/` (browser screenshots).

## Remaining checks and next task

1. Run the acceptance flow in Expo Go on physical Android and iOS phones, especially
   keyboard behavior, safe areas, back navigation, and closing/reopening the app.
2. Proceed to Phase 4 visual polish after device feedback. Browser screenshots were
   inspected at 390px (Home/checkout) and 360px (Orders); automated width checks also cover 430px.
3. Replace products, prices, images, and addresses only when approved content is supplied.

Environment notes: npm install reported 13 moderate dependency advisories; no forced
breaking upgrades were applied. Expo's development-tools download encountered a Windows
rename error and used its bundled fallback; application bundling and browser testing passed.
No backend, authentication, real payments, logistics API, or loyalty system was introduced.

References used for setup: [Expo Router installation](https://docs.expo.dev/router/installation/)
and [Expo src directory conventions](https://docs.expo.dev/router/reference/src-directory/).
Installed versions were verified against the official npm Expo template and `expo install --check`.
