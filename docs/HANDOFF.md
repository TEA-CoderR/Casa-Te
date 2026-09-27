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

## Session 3 (P0 steps 2–4)
- ✅ From a clean `npm ci` (no `.expo/` types): `expo install --check` (offline mode; the Expo API is
  unreachable from the sandbox — CI runs the online check), `npm run typecheck`, `npm test` (incl. DB
  suite), admin build, web export, `deno check --all */index.ts` — all green.
- 🐞 Fixed: `build:web` could ship the **previous** build's `EXPO_PUBLIC_SUPABASE_URL` (Metro transform
  cache). It now runs `expo export --clear`.
- 🐞 Fixed: admin `/reset-password` was unreachable for an account without a staff role, so the
  documented first-admin procedure dead-ended ("Accesso non autorizzato"). Also, dashboard invites
  redirect to the Site URL (web shop); `docs/DEPLOYMENT.md` §1 now says to set the password via
  "Password dimenticata / primo accesso" on the console.
- ✅ Step 4 done **without Docker/Stripe** (both blocked in the sandbox) using `tools/local-stack`:
  real Supabase Auth + PostgREST + all migrations, Edge Functions under Deno, Stripe mock with signed
  webhooks. `tools/local-stack/e2e/run.sh` passes: browse → cart → email OTP → checkout (home delivery,
  €17,98 + €6,90) → pay (4242) → paid order; first admin → staff invite → store picking → shipped
  → partial refund €4,99 → second order cancelled with full refund, stock restored; webhooks
  idempotent (`already_paid`, no duplicate refunds); store staff sees no refund actions.
- Added `STRIPE_API_BASE` (optional, default `https://api.stripe.com`) for the mock.
- Still to verify in staging (P1): real Stripe Checkout/API version, hosted Supabase (Kong, Storage,
  pg_cron, DB webhook → `notify-order-event` → Resend), native deep link return.

## Session 4 — staging deployed (2026-09-28)
- Supabase staging project `kejjinbapxnjbceirrtv` ("TEA-CoderR's Project", eu-central-1, Postgres 17),
  API `https://kejjinbapxnjbceirrtv.supabase.co`. Applied through the Supabase MCP connector:
  migrations 0001–0005 + `20260928000001_enable_pg_net`, then `seed.sql` (demo catalogue).
  `supabase_migrations.schema_migrations` versions were repaired to match the file names, so
  `supabase db push` treats them as applied. **Migrations 0001–0005 are now frozen (AGENTS.md rule 5).**
- Verified on staging: RLS on every table, pg_cron job `casa-te-expire-stale-orders` active, storage
  bucket + policies, EXECUTE grants as designed. Advisors: no real security issue; performance
  suggestions (wrap `auth.uid()` in `select`, 10 unindexed FKs, overlapping `FOR ALL` policies) → future migration.
- All 7 Edge Functions deployed (verify_jwt as in `config.toml`) and smoke-tested from SQL via pg_net
  (the sandbox cannot reach `*.supabase.co` directly).
- Stripe sandbox `acct_1UKKXxLe2u4NCBLP` ("casate 沙盒"): webhook endpoint `we_1UKL4tLe2u4NCBLPJMaplg9j`
  → `/functions/v1/stripe-webhook`, API version `2025-03-31.basil`, 6 events. Stripe Tax not set up
  (no head office / registration). Integration review and plan: see the session-4 chat summary.
- **Owner actions pending:** Edge Function secrets (`STRIPE_SECRET_KEY` as restricted key,
  `STRIPE_WEBHOOK_SECRET`, `WEB_SHOP_URL`, `ADMIN_URL`, `ALLOWED_ORIGINS`), Auth URL config and
  email templates with `{{ .Token }}`, custom SMTP, first admin (DEPLOYMENT.md §1).

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
2. ~~`cd apps/mobile && npx expo install --check`~~ (session 3; online check runs in CI).
3. ~~typecheck, tests, both builds, `deno check`~~ (session 3, all green).
4. ~~Local click-through~~ (session 3, `tools/local-stack/e2e/run.sh`; real Stripe → P1 step 7).
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
