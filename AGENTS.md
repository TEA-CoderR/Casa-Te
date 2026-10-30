# CASA & TE — Engineering instructions

Commercial online sales platform for CASA & TE (Italian household-goods chain, 5 stores: Arezzo, Lucca 1–4).
Read `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` first.

## Layout
- `apps/mobile` — customer app (Expo / React Native / Expo Router), also built as the web shop. UI in Italian.
- `apps/admin` — back office and store picking (Vite + React). UI in Italian.
- `packages/shared` — domain types, money/weight helpers, shipping algorithm, validation, error messages.
- `supabase/migrations` — schema, RLS and commerce RPCs (source of truth for money and stock).
- `supabase/functions` — Edge Functions (fetch-only, no SDK deps; logic in `handler.ts`, unit-tested in Node).
- `tests/db` — PostgreSQL test suite (runs migrations on a real server); `tests/functions` — Edge Function tests.

## Rules
1. Never compute a charged amount on the client. Change pricing/shipping/stock logic in SQL and keep
   `packages/shared` in sync; the parity test must stay green.
2. Do not change shipping business rules without explicit approval (`docs/PROJECT_CONTEXT.md` §6).
3. Every new table gets RLS **and explicit GRANTs** in the same migration (newer Supabase projects grant
   nothing to anon/authenticated/service_role by default); every new function gets explicit GRANTs
   (Supabase grants EXECUTE to anon/authenticated by default).
4. Money in integer cents, weight in integer grams.
5. Never add a new migration that edits an old one; always add a new file.
6. Do not invent real product data, prices, stock, addresses or legal data.
7. Run `npm test` (needs `psql` + PostgreSQL binaries or `DATABASE_URL`) and `npm run typecheck` before committing.

## Design rules (customer app, `apps/mobile`)
The phone app follows design F "La Tenda" (`apps/mobile/src/config/theme.ts`); the desktop shop is the printed catalogue.
The September demo (built with Codex) left generic AI patterns that kept coming back; do not reintroduce them.
1. **Start from the shared components** in `components/UI.tsx` (`OptionCard`, `RadioMark`, `StatusMark`, `Notice`,
   `PrimaryButton`, `SecondaryButton`, `QuantityControl`, `EmptyState`, `PriceTag`…) and `components/ShopMarks.tsx`;
   copy a screen's styles only after checking them against the design boards.
2. **Choices** (delivery, address, store, refund…): white card, radio on the left, the chosen one gets a green edge only.
   No tinted fill, no thicker coloured frame with a fill, no icon that turns into a filled circle.
3. **Status** (orders, returns): `StatusMark` — a dot and the words. The logo yellow is the single signal
   (active tab, price chips, cart count, "ready"/"approved"); red only for discounts and errors.
4. **Messages**: `Notice` — a white plate with a coloured edge and title, never a pale green/red/yellow panel.
5. **Icons** stand alone, never inside a tinted circle; prefer signs from the shop (`StepTag`, `EmptyReceipt`, `AwningMark`).
6. **Grounds**: ivory page (`colors.page`), white plates, warm neutrals (`well`, `stone`) for quiet fills.
   Pale tints are only for content that is not a state (department tiles, the home banners, the desktop offers tile).
7. **Type**: every text style sets `fontFamily` from `fonts` (Bodoni Moda titles, Figtree text); a `fontWeight` alone
   falls back to the system font on phones.
8. `npm run test:ui` checks 2–4 and 7 (`tools/ui-check`); a deliberate exception carries
   `// ui-check: allow (<reason>)` on the line or the line above. New UI is compared with the boards before merging.

