# Local stack without Docker (end-to-end testing)

`supabase start` needs Docker, and a real Stripe test payment needs a Stripe test account plus
network access to `api.stripe.com`. When neither is available (CI sandboxes, locked-down machines),
this folder runs an equivalent stack from official binaries so the whole purchase flow can still be
exercised locally:

| Piece | Local stand-in | Port |
|---|---|---|
| Postgres | PostgreSQL 16 from the system, all `supabase/migrations` + `seed.sql` | 54322 |
| Auth | **Supabase Auth (GoTrue) v2.177.0** — real server, runs its own `auth` migrations | via gateway |
| REST | **PostgREST v12.2.12** | via gateway |
| Edge Functions | `functions-server.ts` — the real `handler.ts` files under Deno | via gateway |
| API gateway | `gateway.mjs` — `/rest/v1`, `/auth/v1`, `/functions/v1` + `verify_jwt` from `supabase/config.toml` | 54321 |
| Stripe | `stripe-mock.mjs` — Checkout Sessions, refunds, hosted pay page, **signed** webhooks | 12111 |
| Email | Mailpit (auth emails; templates in `templates/` include `{{ .Token }}`) | UI 54324 |
| Web shop / admin | production builds served with SPA fallback | 8081 / 5173 |

```bash
tools/local-stack/start.sh          # fresh DB, build both apps, start everything (Linux x86_64)
tools/local-stack/e2e/run.sh        # full browser end-to-end run (Playwright), screenshots in .tools/e2e-shots
tools/local-stack/stop.sh
```

Keys and URLs are written to `.tools/local-stack/env`; logs to `.tools/local-stack/logs/`.
Test cards on the mock pay page: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined.

**What this does not prove:** behaviour of the real Stripe API/Checkout page (API version pinning,
payment methods, Stripe-side session expiry) and of hosted Supabase (Kong, Storage API, pg_cron,
database webhooks → `notify-order-event`, Resend). Those are verified in staging
(`docs/DEPLOYMENT.md` §3, `docs/HANDOFF.md` P1). The only production-code hook is the optional
`STRIPE_API_BASE` variable in `supabase/functions/_shared/stripe.ts` (defaults to `https://api.stripe.com`).
