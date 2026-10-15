# Launch checklist

Items marked **[business]** need a decision or data from CASA & TE; **[legal]** need counsel.

## Business rules to confirm
- [ ] **[business]** Final shipping rule above 10 kg (currently provisional €12,90 home / €9,90 pickup point).
- [ ] **[business]** Coupons: discount reduces the value used for shipping bands and the €66 free-shipping threshold (current behaviour). Confirm or change.
- [ ] **[business]** Fulfilment: each order is prepared by the customer's selected store and stock is per store. Confirm, or designate one central store for home deliveries.
- [ ] **[business]** Delivery area (currently all of Italy with a valid CAP). Restrict if needed.
- [x] **[business]** Store pickup holding period: 14 days (terms, shipping page, "ready for pickup" email).
- [ ] **[business]** Delivery time promises for home / pickup-point delivery (`[2–4]` in `apps/mobile/src/content/legal.ts`, shown only once delivery is enabled).
- [ ] **[business]** Loyalty card integration (phase 2, out of scope for v1).

## Legal / compliance
- [ ] **[legal]** Complete and approve `terms`, `privacy`, `shipping` texts (`apps/mobile/src/content/legal.ts`). Company data
  is no longer in the code: admin → Negozi → **Aziende** holds the operator (CASA & TE GROUP S.R.L., Google Play publisher)
  and each store's company (seller of that store's orders); the legal pages, checkout and orders read it. Filled 15/10/2026: support and
  privacy email (companies table), no DPO, dates, pickup 14 days, retention periods. Still open: delivery times. Counsel to confirm the
  operator/seller roles (incl. whether the privacy notice should describe joint controllership, art. 26 GDPR).
- [ ] Every active store linked to its company (admin → Negozi). Orders snapshot the seller when placed.
- [x] EU ODR platform link removed (the platform closed on 20 July 2025, Reg. (EU) 2024/3228).
- [ ] **[legal]** Cookie/consent: the web shop uses only technical storage (session, cart). If analytics or marketing pixels are added, a consent banner is required.
- [ ] **[legal]** Data processing agreements (DPA) with Supabase, Stripe, Resend, courier.
- [ ] **[legal]** Register of processing activities (GDPR art. 30) updated.
- [ ] Omnibus directive: "prezzo barrato" must be the lowest price of the previous 30 days.
- [ ] Invoicing: orders with "Richiedo la fattura" must be invoiced through the SDI by the accounting system (export from admin → Ordini → Esporta CSV). Agree the process with the accountant.
- [ ] Corrispettivi telematici: agree with the accountant how online sales are recorded.

## Data
- [ ] Real product catalogue imported (SKU, name, price, **weight**, VAT, EAN, images).
- [ ] Stock per store imported and a process agreed to keep it updated (manual, CSV, or future POS integration).
- [ ] Store addresses, phones and opening hours filled in.
- [ ] Real pickup points entered or pickup-point delivery disabled; **demo pickup points deactivated**.
- [ ] Demo seed data absent from production (`select count(*) from products where description = 'Prodotto dimostrativo.'` = 0).
- [ ] Home hero image replaced with approved photography (`apps/mobile/assets/home-tuscany.jpg` was supplied by the owner for the demo; confirm usage rights).

## Payments
- [ ] Stripe account verified, live keys set, live webhook created and receiving events.
- [ ] Real test order + full refund done in live mode for each fulfilment method.
- [ ] Stripe receipts enabled; statement descriptor set.

## Logistics
- [ ] Courier contract (e.g. via Packlink/Sendcloud account) and packaging process per store.
- [ ] Staff trained on the picking workflow (docs/OPERATIONS.md).

## Apps
- [ ] App icon 1024×1024 and splash screen.
- [ ] App Store Connect listing: screenshots, description (IT), privacy labels, support URL, privacy policy URL.
- [ ] Google Play listing: Data safety, content rating, privacy policy URL.
- [ ] TestFlight / internal testing with store staff before public release.

## Security / operations
- [ ] Supabase: PITR enabled, SMTP configured, email templates in Italian with the OTP code.
- [ ] Admin console access restricted (SSO/IP allow-list) and all staff invited with correct roles.
- [ ] Web shop and admin on Cloudflare Pages with the company domain (`docs/DEPLOYMENT.md` §5b); GitHub Pages only for staging.
- [ ] `ALLOWED_ORIGINS` set to the real domains.
- [ ] Alerting on Stripe webhook failures and Edge Function errors.
- [ ] CI green on `main` (unit, database, build, Edge Function type-check).
