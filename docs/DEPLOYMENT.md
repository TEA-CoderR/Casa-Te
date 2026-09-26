# Deployment guide

Set up **two** environments: `staging` (Stripe test mode, seed data) and `production`
(Stripe live mode, real catalogue, no seed). Do every step below for each.

## 0. Accounts CASA & TE must own

| Service | Why | Notes |
|---|---|---|
| Supabase (Pro plan) | Database, auth, storage, functions | Region **EU Central (Frankfurt)**; Pro enables daily backups + PITR add-on |
| Stripe | Payments | Company verification (KYC) takes days: start early |
| Resend (or another SMTP) | Order emails + login codes | Verify the sending domain (SPF/DKIM) |
| Apple Developer Program | App Store | Organisation account needs a D-U-N-S number |
| Google Play Console | Play Store | Organisation account |
| Expo (EAS) | Native builds and store submission | Free tier is enough to start |
| Static hosting (Vercel / Netlify / Cloudflare Pages) | Web shop + admin console | Two sites |
| Domain | e.g. `shop.casate.it`, `gestione.casate.it` | |

## 1. Supabase project

```bash
npm i -g supabase            # or use npx supabase
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push             # applies supabase/migrations/*
# staging only (never production):
psql "$STAGING_DB_URL" -f supabase/seed.sql
```

Dashboard settings:

* **Database → Extensions**: `pg_cron` enabled (migration 0004 schedules `expire_stale_orders`).
  Verify with `select * from cron.job;`. If the job is missing, run the `cron.schedule(...)`
  statement from migration 0004 in the SQL editor.
* **Authentication → Providers → Email**: enabled, "Confirm email" on.
* **Authentication → Email Templates → Magic Link**: the customer app signs in with a 6-digit
  code, so the template must contain the token, e.g.
  `<h2>Il tuo codice CASA & TE</h2><p style="font-size:28px;letter-spacing:4px">{{ .Token }}</p><p>Valido 15 minuti.</p>`.
  Translate the other templates (Invite, Reset password) to Italian.
* **Authentication → SMTP**: configure Resend SMTP (Supabase's built-in mailer is rate limited
  and not for production).
* **Authentication → URL configuration**: Site URL = web shop URL; Redirect URLs:
  `https://gestione.casate.it/reset-password`, `https://shop.casate.it/**`, `casate://**`.
* **Authentication → Rate limits**: keep OTP limits (protects against abuse).
* **Storage**: bucket `product-images` is created by migration 0004 (public read).

### First administrator

1. Supabase → Authentication → Users → *Invite user* (your email). Do **not** use the link in that
   email: dashboard invites redirect to the Site URL (the web shop), not to the admin console.
2. Open the admin console, enter the same email and click **Password dimenticata / primo accesso**;
   the emailed link opens `/reset-password` on the console, where you set the password
   (this works before the account has a staff role).
3. In the SQL editor:
   ```sql
   insert into public.staff_members (user_id, role, email, display_name)
   select id, 'admin', email, 'Amministratore' from auth.users where email = 'you@casate.it';
   ```
   Further staff are invited from the admin console (**Personale**).

## 2. Edge Functions

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  WEB_SHOP_URL=https://shop.casate.it \
  ADMIN_URL=https://gestione.casate.it \
  APP_SCHEME=casate \
  ALLOWED_ORIGINS=https://shop.casate.it,https://gestione.casate.it \
  ORDER_WEBHOOK_SECRET=$(openssl rand -hex 32) \
  RESEND_API_KEY=re_... \
  EMAIL_FROM="CASA & TE <ordini@casate.it>"

for fn in checkout checkout-return stripe-webhook admin-refund admin-staff delete-account notify-order-event; do
  supabase functions deploy "$fn"
done
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
`supabase/config.toml` disables JWT verification only for `stripe-webhook`, `checkout-return` and
`notify-order-event` (they authenticate by signature / fixed redirect / shared secret).
The GitHub workflow **Deploy Supabase** does the same from CI.

### Order email notifications

Supabase → Database → Webhooks → *Create*: table `public.order_events`, event `INSERT`,
type *Supabase Edge Function* `notify-order-event`, HTTP header
`x-webhook-secret: <ORDER_WEBHOOK_SECRET>`. Emails sent: order confirmed, ready for pickup,
shipped (with tracking), cancelled, refund issued.

## 3. Stripe

1. Complete business verification; set the statement descriptor (e.g. `CASA E TE`).
2. **Settings → Payment methods**: enable Cards, Apple Pay, Google Pay; optionally PayPal,
   Satispay, Klarna. Checkout shows whatever is enabled — no code change needed.
3. **Developers → Webhooks → Add endpoint**:
   `https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook` with events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `refund.created`, `refund.updated`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. **Settings → Emails**: enable "Successful payments" and "Refunds" receipts.
5. Apple Pay on the web shop domain: Settings → Payment method domains → add `shop.casate.it`.
6. Test end-to-end in test mode with card `4242 4242 4242 4242` and the 3-D Secure card
   `4000 0027 6000 3184`.

## 4. Web shop (apps/mobile → web)

```bash
cd apps/mobile
cp .env.example .env    # EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo export --platform web      # output: apps/mobile/dist
```

Deploy `apps/mobile/dist` as a **single-page app**: every path must fall back to `index.html`
(needed for `/checkout/return`, `/product/<id>`). Netlify: `_redirects` with `/* /index.html 200`;
Vercel: rewrite `/(.*)` → `/index.html`; Cloudflare Pages: SPA mode is automatic.

## 5. Admin console (apps/admin)

```bash
cd apps/admin
cp .env.example .env    # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run build           # output: apps/admin/dist (SPA, same fallback rule)
```

Host on a separate subdomain. Recommended: protect with Cloudflare Access / IP allow-list in
addition to staff login.

## 6. Native apps (EAS)

```bash
npm i -g eas-cli && eas login
cd apps/mobile
eas init                         # links the Expo project; commit the generated projectId
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --environment production
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon> --environment production
eas build --platform all --profile preview       # internal testing (APK / ad-hoc)
eas build --platform all --profile production
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

Before the first store build: replace `assets/logo.png` with a 1024×1024 app icon and add a
splash screen; confirm bundle ids `it.casate.app` in `app.json`; fill App Store privacy
labels (email, name, phone, address, purchase history — linked to identity, not used for tracking)
and the Google Play Data safety form. Account deletion is available in-app (Profilo → Elimina account).

Run `npx expo install --fix` after installing dependencies to align native module versions with
the Expo SDK in `package.json`, and make sure the Expo Go version on test phones matches that SDK.

## 7. Go-live procedure

1. Production migrations applied; **do not** run `seed.sql`.
2. Stores: fill addresses, phones, hours (admin → Negozi).
3. Import the real catalogue (admin → Importa CSV) with weights and stock per store.
4. Real pickup points entered (or disable the method by deactivating all pickup points).
5. Switch Stripe keys to live, re-create the webhook in live mode.
6. Place a real order with each fulfilment method, then refund it from the admin console.
7. Complete `docs/LAUNCH_CHECKLIST.md`.

## 8. Operations

* **Backups**: Supabase Pro daily backups; enable PITR for production.
* **Monitoring**: Supabase → Logs (Edge Functions, Postgres); Stripe → Developers → Webhooks
  shows failed deliveries (Stripe retries for 3 days). Set up email alerts for webhook failures.
* **Payment/refund reconciliation**: admin Ordini → Esporta CSV includes the Stripe payment
  intent id for matching Stripe payouts.
