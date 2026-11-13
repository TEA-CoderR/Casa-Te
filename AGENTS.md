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
The phone app follows the November 2026 design (`docs/design/ui-audit-2026-11.md`): a deep-green band (`colors.band`) with the
CT monogram texture (`Monogram`, `BandWatermark`), white pages for content, Figtree everywhere. Lime (`colors.bandLogo`) only
for what is yours and in progress: the member card (`ClubPass`), live order tickets, the paid receipt, the active tab, the cart
count, the account step of the welcome. The floating dark-green tab bar, the Categorie rail and every animation stay.
The desktop shop is the printed catalogue.
The September demo (built with Codex) left generic AI patterns that kept coming back; do not reintroduce them.
1. **Start from the shared components**: `components/UI.tsx` (`PrimaryButton`, `SecondaryButton`, `PillButton`, `SearchField`,
   `OptionCard`, `RadioMark`, `StatusMark`, `Notice`, `QuantityControl`, `EmptyState`, `PriceTag`…), `ListRow` / `ListGroup`
   for every list, `OrderTicket` for orders, `ClubPass` for the card. Sizes come only from `theme.ts`: `type` (font sizes),
   `radius` (`sm` 12, `md` 16, `lg` 22, `pill`), spacing in steps of 4. Do not write new values.
2. **Choices** (delivery, address, store, refund…): white card, radio on the left, the chosen one gets a green edge only.
   No tinted fill, no thicker coloured frame with a fill, no icon that turns into a filled circle.
3. **Status** (orders, returns): `StatusMark` — a dot and the words; lime as above; red only for discounts and errors.
4. **Messages**: `Notice` — a white plate with a coloured edge and title, never a pale green/red/yellow panel.
5. **Icons** stand alone, never inside a tinted circle.
6. **Say it once**: the same line (free pickup, the store name, a total) appears once per screen. Uppercase kickers only on
   tickets, the card, welcome steps, the store line of the home band and list group titles.
7. **Type**: every text style sets `fontFamily` from `fonts` (`display` for titles); a `fontWeight` alone
   falls back to the system font on phones.
8. `npm run test:ui` checks 2–4 and 7 (`tools/ui-check`); a deliberate exception carries
   `// ui-check: allow (<reason>)` on the line or the line above. Rejected directions are listed in §6 of the design plan.
