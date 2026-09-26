# Architecture

```
                ┌──────────────────────────┐        ┌──────────────────────────┐
 Customers ───▶ │ apps/mobile (Expo)        │        │ apps/admin (Vite+React)  │ ◀─── Staff
                │  iOS · Android · Web shop │        │  back office + picking   │
                └────────────┬─────────────┘        └────────────┬─────────────┘
                             │ supabase-js (anon key + user JWT)  │
                             ▼                                    ▼
        ┌─────────────────────────────────────────────────────────────────────────┐
        │ Supabase (EU region)                                                    │
        │  Auth (email OTP for customers, password+invite for staff)              │
        │  Postgres: schema + RLS + SECURITY DEFINER RPCs  ◀── single source of    │
        │            (quote_cart, create_order, stock, refunds, workflow)   truth  │
        │  Storage: product-images (public read, managers write)                  │
        │  pg_cron: expire_stale_orders() every 5 min                             │
        │  Edge Functions: checkout · checkout-return · stripe-webhook ·          │
        │                  admin-refund · admin-staff · delete-account ·          │
        │                  notify-order-event                                     │
        └───────────────┬───────────────────────────────┬─────────────────────────┘
                        │ REST (secret key)              │ REST
                        ▼                                ▼
                   ┌─────────┐                      ┌─────────┐
                   │ Stripe  │ ── webhooks ──▶      │ Resend  │ (transactional email)
                   └─────────┘                      └─────────┘
```

## Principles

1. **The database is authoritative.** Prices, discounts, shipping and stock are computed in
   Postgres (`quote_cart`, `create_order`). Clients only send product ids and quantities; any
   amount they send is ignored. Stripe is charged exactly `orders.total_cents`.
2. **Least privilege.** RLS is enabled on every table. Customers read the public catalogue and
   their own rows. Orders, refunds and stock movements cannot be written directly by clients.
   Payment/refund functions are callable only with the service role (Edge Functions).
3. **Idempotent money flows.** Webhook events are de-duplicated; `mark_order_paid` and
   `record_refund` are idempotent; Stripe requests use idempotency keys.
4. **Integer money and weight.** Euro cents and grams everywhere; no floating point in pricing.
5. **One shipping algorithm, three implementations kept in lock-step**: SQL
   (`shipping_cost_cents`), TypeScript (`packages/shared/src/shipping.ts`, used for the admin
   simulator) and the frozen approved demo calculator (test oracle). 468 parity cases run in CI.

## Order lifecycle

```
create_order ──▶ pending_payment ──(Stripe paid)──▶ paid ──▶ picking ──▶ ready ──┬─▶ shipped ──▶ completed   (home / pickup point)
      │               │                                                          └─▶ completed               (store pickup)
      │               └─(expired / cancelled / payment failed)──▶ cancelled  (stock released)
      └─ reserves stock immediately (row-level conditional UPDATE; no overselling)

paid / picking / ready ──(manager: refund + cancel)──▶ cancelled  (stock restored)
```

* Payment window: Stripe session 31 min, order 35 min; `pg_cron` releases stale orders.
* A payment that arrives after expiry is refunded automatically (`needs_refund`).
* Every stock change is written to `inventory_movements` with a reason.

## Key tables

| Table | Purpose |
|---|---|
| `stores` | 5 CASA & TE stores; flags `pickup_enabled`, `ships_orders` |
| `products`, `categories`, `product_images` | Catalogue (VAT-inclusive prices, weight in grams) |
| `inventory` | Sellable stock per store and product |
| `shipping_rates` | Configurable shipping rules (priority, subtotal and weight ranges) |
| `coupons` | Percent / fixed / free-shipping codes with limits |
| `profiles`, `addresses` | Customer data |
| `staff_members` | Staff roles: `admin`, `manager`, `store_staff` (bound to one store) |
| `orders`, `order_items`, `order_events` | Orders with price snapshots and a timeline |
| `refunds`, `stripe_events`, `inventory_movements` | Money and stock audit trails |

## Fulfilment model (v1)

Each order is prepared by **one store**: the customer's selected store. Store pickup is collected
there; home and pickup-point orders are packed there and handed to the courier (tracking entered
in the back office). Stock shown in the app is the stock of the selected store.

## Security notes

* Anon key is public by design; the service role key lives only in Edge Function secrets.
* `checkout-return` redirects only to the fixed app scheme or `WEB_SHOP_URL` (no open redirect).
* CSV exports neutralise spreadsheet formula injection.
* Admin console is `noindex` and should additionally sit behind the company SSO/IP allow-list if available.
