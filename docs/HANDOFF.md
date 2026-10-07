# Handoff — commercial platform

Started 2026-09-27, last updated 2026-10-07. Read with `AGENTS.md`,
`docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (19–28), `docs/DEPLOYMENT.md`, `docs/LAUNCH_CHECKLIST.md`.

## Goal
Turn the September demo into a production online-sales system for CASA & TE (5 stores, Italy).
Chosen stack (confirmed by the user): **Supabase + Stripe**; first release = customer app (iOS/Android),
web shop (same Expo codebase), admin console, store picking; catalogue via admin + CSV import.

## State (2026-10-01)
- Everything is on `main` (PRs #1–#6 merged). The repository is **public** (needed for free GitHub Pages).
- **Staging is live**: web shop https://tea-coderr.github.io/Casa-Te/ and admin
  https://tea-coderr.github.io/Casa-Te/admin/ (GitHub Pages, `deploy-pages.yml` on every push to `main`),
  backed by Supabase project `kejjinbapxnjbceirrtv` and the **company** Stripe sandbox (since
  2026-10-07, see "Stripe account switch" below). Full flow verified with
  real Stripe test payments: browse → sign-in → pay → picking → refund (see sessions 4–5).
- Demo admin: `e2e.admin@casate.test` (password given to the owner in chat; staging only).
- Catalogue is still the 8 placeholder products from `seed.sql` (no real data — AGENTS.md rule 6).

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

## Session 5 — staging hardened, public demo (2026-09-28 → 10-01)
- 🐞 New Supabase API keys: `sb_secret_…`/`sb_publishable_…` are not JWTs. `_shared/supabase.ts`
  sends `sb_` keys only as `apikey`; `loadConfig()` prefers `SUPABASE_SECRET_KEYS` /
  `SUPABASE_PUBLISHABLE_KEYS` (JSON, key `default`). All 7 functions redeployed.
- 🐞 Newer Supabase projects grant **no table privileges** to anon/authenticated/service_role.
  Migration `20260928000002_api_role_grants.sql` grants them and re-applies the 0002/0005 narrowing;
  the test stub no longer emulates old defaults; `tests/db/sql/05_grants.sql`; AGENTS.md rule 3.
  (Before this the Stripe webhook failed with 42501/403.)
- 🐞 Supabase serves Edge Function `text/html` as `text/plain`, so `checkout-return` now only
  redirects (303 to `casate://…` or `WEB_SHOP_URL`) or returns a plain-text note.
- Email templates can no longer be edited without **custom SMTP**, so `{{ .Token }}` codes are not
  available yet. Web sign-in also works through the default email's link (`emailRedirectTo` = the
  page the customer came from). Built-in SMTP only delivers to project team members, a few per hour.
- GitHub Pages hosting: `tools/pages/assemble.mjs` (shop at `/<repo>/`, admin at `/<repo>/admin/`,
  `404.html` SPA fallback), Vite `ADMIN_BASE_PATH`, Expo `EXPO_BASE_URL` via `app.config.js`.
- UI refresh: shop home (promises, category cards, Click & Collect, footer) and admin (dark
  sidebar, split login, new dashboard).
- Owner already did: Stripe restricted key + webhook secret, `WEB_SHOP_URL`/`ADMIN_URL` secrets,
  Auth Site URL + redirect URL `https://tea-coderr.github.io/Casa-Te/**`, repo public + Pages.
- Verified on staging: real Checkout payments (CT26001002–04), webhooks recorded once, partial
  refund via `admin-refund` (€4,99, `refund.created/updated` idempotent), pg_cron released an
  unpaid order, admin storage upload allowed by policy.
- Deferred by the owner: Stripe Tax (head office + P.IVA), SDI e-invoicing provider, Google Pay /
  PayPal in the Dashboard (code needs no change: Checkout uses the Dashboard payment-method config).

## Stripe account switch (2026-10-07)
- Staging now uses the **company** Stripe account "CASA & TE S. FILIPPO S.R.L." (sandbox; registered
  with the company email; live mode pending Stripe verification). The personal sandbox
  `acct_1UKKXxLe2u4NCBLP` from session 4 is retired: its webhook was disabled by the owner.
- Restricted key (`STRIPE_SECRET_KEY`, set by the owner in Supabase secrets): Charges and Refunds
  **write**, Checkout Sessions **write**, Payment Intents **read**; no IP restriction (Supabase egress
  IPs are not fixed).
- Webhook destination "casa-te-staging": your account, **snapshot** payload, the same 6 events, URL
  `/functions/v1/stripe-webhook`; its signing secret is in `STRIPE_WEBHOOK_SECRET`.
- Verified on staging: order CT26001016 paid via Checkout (event ids now `…LVt8YFmWvP…`, the company
  account), webhook recorded once; partial refund €5,99 from admin → one `refunds` row,
  `refund.created/updated` idempotent.
- Go-live still to do: in **live** mode create a new restricted key + webhook with the same settings
  for the production environment. Stripe Tax deferred until the accountant decides (prices are VAT
  inclusive: `tax_behavior` must be `inclusive`, and per-item line items are needed first).

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
5. ~~Push, CI green, PR to `main`~~ (PR #1 merged).

**P1 — staging environment (needs the user to create accounts)**
6. ~~Supabase staging project, secrets, functions, first admin~~ (sessions 4–5).
7. ~~Stripe test mode lifecycle~~ (session 5). Still open: custom SMTP (e.g. Resend) so email
   templates with `{{ .Token }}` can be set, DB webhook → `notify-order-event` for order emails.
8. ~~Host web shop + admin~~ (GitHub Pages, staging). Still open: EAS `preview` build on real phones;
   production hosting/domain (decide whether to keep the repo public).
9. Clean up staging test data (orders CT26001001–04, `e2e.*@casate.test` users) when no longer needed.

**P2 — business/launch items (user/company input)** — see `docs/LAUNCH_CHECKLIST.md`:
>10 kg rule, coupon vs. free-shipping rule, fulfilment store model, legal texts
(`apps/mobile/src/content/legal.ts` placeholders), real catalogue with weights + stock, store
addresses/hours, real pickup points, app icon/splash, store listings, invoicing process with the accountant.

**P3 — later phases (not started)**
Courier integration (Packlink/Sendcloud labels + tracking), POS/ERP stock sync, loyalty card,
push notifications, native Stripe PaymentSheet, analytics + cookie consent, error monitoring (Sentry),
SDI e-invoicing integration, product search improvements (full-text/typo tolerance), multi-language.

## Conventions / gotchas
- Migrations are deployed to staging: never edit an existing file, always add a new one (AGENTS.md rule 5).
- The sandbox cannot reach `*.supabase.co` or `api.stripe.com`; smoke-test staging from SQL with
  `pg_net` via the Supabase MCP connector. Redeploying a function via MCP needs `import_map_path: "deno.json"`.
- The user works on Windows; their connected folder `C:\Users\XH\Desktop\Casa & Te CC` contains `&`,
  which breaks npm — use `C:\Users\XH\casa-te` (see `run-checks.ps1` delivered there, which extracts
  the project, installs, typechecks, tests, builds and writes `verify-log.txt`).
- Customer UI Italian; the user communicates in Chinese; engineering docs in English.
- Commit trailers: see the session's attribution instructions. Do not push to `main` without asking.
