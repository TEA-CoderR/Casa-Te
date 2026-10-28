# ERP (ITO) sync

Prices, promotions and stock come from ITO. ITO keeps a MySQL copy (`ysoft`) on the CASA & TE server in sync.
A small **sync agent** (`tools/erp-agent`, Node 20 + mysql2) next to that database reads it with a read-only user
and pushes changes to the shop: only what changed, plus a full resend once a day. `npm run dry-run` reads ysoft and
writes `dry-run.json` without sending anything.
Online orders are rung up at the store till by staff (admin → order → "Segna come registrato in cassa"). ITO
then deducts the goods and the next sync reports the new stock. An ITO endpoint that receives online orders
is planned but not specified yet.

```
ITO ──(ITO sync program)──▶ MySQL ysoft (CASA & TE server)
                              │  read-only user
                              ▼
                       sync agent (every few minutes)
                              │  HTTPS, HMAC-signed JSON
                              ▼
          Supabase Edge Function erp-sync ─▶ public.erp_apply_batch()
```

## Endpoint

`POST https://<project>.supabase.co/functions/v1/erp-sync` (no JWT; authenticated by signature)

| Header | Value |
|---|---|
| `X-Casate-Timestamp` | Unix time in seconds; refused if more than 5 minutes off |
| `X-Casate-Signature` | `v1=` + hex HMAC-SHA256 of `"<timestamp>.<raw body>"` with the shared secret |

The secret is the Edge Function secret `ERP_SYNC_SECRET`. It is set by the owner in Supabase and in the agent's
local config, and is never sent in chat or committed. The endpoint answers 503 while the secret is not set.

Body (at most 2000 products and 5000 store items per call; send larger syncs in several calls):

```json
{
  "store_code": "LU3",
  "sent_at": "2026-10-13T10:00:00Z",
  "products": [
    { "erp_code": "10001", "name": "SALDATOIO", "barcode": "8435269954351", "brand": "…", "vat_rate": 22,
      "price_cents": 590, "weight_g": 600, "active": true }
  ],
  "store_items": [
    { "erp_code": "10001", "price_cents": 590, "promo_price_cents": 450,
      "promo_starts_on": "2026-10-01", "promo_ends_on": "2026-10-31",
      "member_price_cents": 399, "member_price_ends_on": null, "quantity": 12 }
  ]
}
```

Rules (`supabase/migrations/20261013000002_erp_sync.sql`):
- `erp_code` = ITO `CodArticolo`; it is also the product SKU.
- **New products** need a name and a price. The weight is optional: the ERP has none, and a cart containing a
  product without a weight can only be collected in store (`quote_cart.weight_missing`). Weights are added later
  in the admin. Missing data is reported in `skipped` and nothing is invented.
- `image_url` (https) is stored as the product photo while the product has no photo uploaded in the admin. CASA & TE
  hosts the photos on its own server for now (agent `imageUrlTemplate`, e.g. `https://…/foto/{barcode}.jpg`).
- A partial row such as `{ "erp_code": "…", "active": false }` only deactivates the product.
- Name, brand, category, description and photos are set only when the product is created. After that they are
  curated in the admin. VAT, `active` and a missing barcode or weight are updated.
- **Store items** set the store price, the dated promotion and the ERP stock. Sellable quantity =
  ERP stock − quantity in this store's online orders that are not yet registered at the till.
- `member_price_cents` / `member_price_ends_on`: Club member price ("Prezzo Soci"; no end date = permanent). A row
  without the key keeps the stored member price (`20261028155548_member_prices.sql`).
- A row older than the last one applied (`sent_at`) is ignored (`stale`), so retries and out-of-order calls are safe.
- Response: `{ store_code, created, updated, store_items, stale, skipped: [{ erp_code, reason }] }`.

Price charged at checkout (`public.store_unit_price`, used by `quote_cart`):
the store price, or the promo price while it is valid today (Europe/Rome) and lower; the regular price is then
shown struck through. Club members (`is_club_member()`) pay the member price instead when it is valid and lower
(`public.member_unit_price`); everyone sees it on the product as "Prezzo Soci". Listing prices of ERP products are refreshed from the main online store every 15 minutes
(pg_cron `casa-te-refresh-display-prices`) and after each batch.

## Reading `ysoft` (to be confirmed with CASA & TE / ITO)

| Shop field | ysoft source |
|---|---|
| store | `negozio.N`: 0 = central warehouse, 1–5 = stores (S. Filippo = 3 → LU3) → shop store code via agent config |
| erp_code | `prodotti.CodArticolo` |
| name | `prodotti.Descrizione` (`Descrizione2`?) |
| barcode | `prodotti.CodBarre` (more in `codbarre`) |
| brand | `prodotti.marca` → `prodotti_marca.Descrizione` |
| vat_rate | `prodotti.CodIva` |
| list price | `prodotti.PrezzoVedi1` |
| store price | latest `negozio_prezzo` row for (CodArticolo, negozio), else list price |
| promotion | `promozioni` (Data_a, Data_f, negozio) + `promozioni_list.Prezzo_a`; also `prodotti.PrezzoVediOfferta` + `_inizio/_fine` |
| member price | `prodotti.PrezzoVedi3` (permanent) and `prodotti_vip.PrezzoVedi` until `Prezzofine` (dated); lowest valid wins |
| stock | `giacenza.G<N>` for store N |
| category | `prodotti.Categoria/Sottocategoria` → `categorie` (mapping to shop categories to define) |

Never read: purchase prices (`PrezzoForn`, `Prezzo_aqu`), customers, staff, sales.
Online articles (`tools/erp-agent/selection.mjs`): ITO's `web` flag is unused. Selected = sold (Qta > 0) in the last
365 days in `vendite_list_0..4` (CASA & TE's own export query) or in stock in the store, filtered by supplier
(`supplierInclude`, kept in `selection.json`), without stopped articles (`prodotti_stop`; `Blocco` is not a stop).
Computed once a day and cached in the agent state: the sales tables are MyISAM and long reads would block the tills.

## First launch: store pickup only
Home delivery and pickup points are switched off by setting "Prepara ordini da spedire" off on the stores
(admin → Negozi). The shop then shows them as "Prossimamente", keeps customers on store pickup and adds a notice
on the shipping page. Turning the flag back on reopens delivery for products that have a weight.
