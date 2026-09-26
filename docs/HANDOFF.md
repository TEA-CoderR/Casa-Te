# Handoff — commercial platform (branch `feature/commercial-platform`)

Written 2026-09-27 at the end of the first build session. Read with `AGENTS.md`,
`docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (19–28), `docs/DEPLOYMENT.md`, `docs/LAUNCH_CHECKLIST.md`.

## Goal
Turn the September demo into a production online-sales system for CASA & TE (5 stores, Italy).
Chosen stack (confirmed by the user): **Supabase + Stripe**; first release = customer app (iOS/Android),
web shop (same Expo codebase), admin console, store picking; catalogue via admin + CSV import.

## State
- `main` = untouched demo (`031e8f4`). All new work is on `feature/commercial-platform` (not merged, no PR yet).
- Built: Supabase schema/RLS/RPCs (migrations 0001–0005), 7 Edge Functions, `packages/shared`,
  rewritten customer app (`apps/mobile`), new admin console (`apps/admin`), CI + deploy workflows, docs.
- **Nothing is deployed.** No Supabase project, Stripe account or hosting exists yet.

## What was verified in session 1 (npm registry was blocked, so no real dependencies)
- ✅ `tests/db`: real PostgreSQL 16 with a Supabase emulation — migrations, RLS per role, order lifecycle,
  payment idempotency, expiry release, late-payment refund, refunds, CSV import, dashboard, coupons,
  and a 2-session race for the last unit. 468 shipping cases match the approved demo calculator.
- ✅ `tests/functions` (15), `packages/shared` tests (9), admin importer tests (5).
- ✅ Typecheck of apps **against hand-written stubs only** (third-party props/types NOT checked).
- ❌ Never run: `npm install`, real `tsc` with library types, Expo bundling, `vite build`, `deno check`,
  the apps on a device/browser, Edge Functions against real Supabase/Stripe.

## Session 2 (commit `a6cbf4c`, npm available)
- ✅ `npm install` works; `package-lock.json` committed.
- ✅ Pinned reanimated 4.5.1 / worklets 0.10.1 / svg 15.15.4 / expo-web-browser ~57.0.3 (SDK 57 bundled versions).
- ✅ Fixed `invoke` body typing (functions-js) in admin + mobile; admin tsconfig loads Node types.
- Re-run the full P0 list below to confirm typecheck, tests, both builds and `deno check` are all green.

## Known risk spots to check first
1. Dependency versions were written without the registry: `expo-web-browser ~57.0.0`,
   `@supabase/supabase-js ^2.49.0`, `react-native-url-polyfill ^2`, `react-router-dom ^7.6`,
   `vite ^7`, `@vitejs/plugin-react ^5`, `@types/react-dom ~19.2`. Run `npx expo install --fix` in
   `apps/mobile`. Note the old README mentioned SDK 54 but `package.json` pins SDK 57 — confirm which
   Expo Go the test phones use.
2. `apps/mobile` typecheck needs Expo-generated `expo-env.d.ts` / `.expo/types` (typed routes). If
   `npm run typecheck` fails on route typing, run `npx expo customize tsconfig.json` or start Expo once.
3. `(tabs)/_layout.tsx` uses `tabBarPosition` / `tabBarVariant` (React Navigation 7 bottom tabs).
4. `supabase/functions/_shared/stripe.ts` pins `Stripe-Version: 2025-03-31.basil` (override with
   `STRIPE_API_VERSION`). Verify against the account.
5. Supabase specifics relied on: PostgREST embedded filter `.eq('inventory.store_id', …)`,
   `order(..., { referencedTable })`, GoTrue `/auth/v1/invite?redirect_to=`, `/auth/v1/admin/users`,
   `pg_cron` creation in migration 0004 (wrapped in a DO block).
6. Customer OTP login requires the Supabase "Magic Link" template to contain `{{ .Token }}`.
7. Native checkout uses `WebBrowser.openAuthSessionAsync(url, 'casate://checkout/return')`; in Expo Go
   the `casate://` scheme is not registered, so the return screen relies on polling (works, less smooth).

## Next tasks (in order)
**P0 — make it build (no external accounts needed)**
1. ~~`npm install` at repo root; commit `package-lock.json`~~ (done in session 2).
2. `cd apps/mobile && npx expo install --check` (versions aligned in session 2 — confirm clean).
3. `npm run typecheck`, `npm test` (db tests need PostgreSQL binaries or `DATABASE_URL`),
   `npm run build -w @casa-te/admin`, `npm run build:web -w @casa-te/mobile`,
   `cd supabase/functions && deno check */index.ts`. Fix everything; keep tests green.
4. Run the web shop and admin locally against `supabase start` (needs Docker) or a staging project,
   click through: browse → cart → checkout (Stripe test) → order → admin picking → refund.
5. Push, confirm GitHub Actions CI is green, open a PR to `main` (ask the user before merging).

**P1 — staging environment (needs the user to create accounts)**
6. Supabase staging project (EU Frankfurt) → `supabase db push`, seed, secrets, deploy functions,
   first admin (`docs/DEPLOYMENT.md` §1–2).
7. Stripe test mode: webhook endpoint + events, test full lifecycle incl. expired session and
   dashboard refund (`docs/DEPLOYMENT.md` §3). Resend + DB webhook for emails.
8. Host web shop + admin (SPA fallback). EAS `preview` build on real Android/iOS phones.

**P2 — business/launch items (user/company input)** — see `docs/LAUNCH_CHECKLIST.md`:
>10 kg rule, coupon vs. free-shipping rule, fulfilment store model, legal texts
(`apps/mobile/src/content/legal.ts` placeholders), real catalogue with weights + stock, store
addresses/hours, real pickup points, app icon/splash, store listings, invoicing process with the accountant.

**P3 — later phases (not started)**
Courier integration (Packlink/Sendcloud labels + tracking), POS/ERP stock sync, loyalty card,
push notifications, native Stripe PaymentSheet, analytics + cookie consent, error monitoring (Sentry),
SDI e-invoicing integration, product search improvements (full-text/typo tolerance), multi-language.

## Conventions / gotchas
- Migrations 0001–0005 have never been deployed; until the first staging deploy they may still be
  amended. After that, follow AGENTS.md rule 5 (new files only).
- The user works on Windows; their connected folder `C:\Users\XH\Desktop\Casa & Te CC` contains `&`,
  which breaks npm — use `C:\Users\XH\casa-te` (see `run-checks.ps1` delivered there, which extracts
  the project, installs, typechecks, tests, builds and writes `verify-log.txt`).
- Customer UI Italian; the user communicates in Chinese; engineering docs in English.
- Commit trailers: see the session's attribution instructions. Do not push to `main` without asking.
