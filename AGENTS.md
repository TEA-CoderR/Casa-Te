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
