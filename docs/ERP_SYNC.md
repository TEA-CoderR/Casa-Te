# ERP (ITO) sync

Prices, promotions and stock come from ITO. ITO keeps a MySQL copy (`ysoft`) on the CASA & TE server in sync.
A small **sync agent** next to that database reads it with a read-only user and pushes changes to the shop.
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
      "promo_starts_on": "2026-10-01", "promo_ends_on": "2026-10-31", "quantity": 12 }
  ]
}
```

Rules (`supabase/migrations/20261013000002_erp_sync.sql`):
- `erp_code` = ITO `CodArticolo`; it is also the product SKU.
- **New products** are created only with a name, a price and a **weight** (shipping is priced by weight).
  Missing data is reported in `skipped` and nothing is invented.
- Name, brand, category, description and photos are set only when the product is created. After that they are
  curated in the admin. VAT, `active` and a missing barcode or weight are updated.
- **Store items** set the store price, the dated promotion and the ERP stock. Sellable quantity =
  ERP stock − quantity in this store's online orders that are not yet registered at the till.
- A row older than the last one applied (`sent_at`) is ignored (`stale`), so retries and out-of-order calls are safe.
- Response: `{ store_code, created, updated, store_items, stale, skipped: [{ erp_code, reason }] }`.

Price charged at checkout (`public.store_unit_price`, used by `quote_cart`):
the store price, or the promo price while it is valid today (Europe/Rome) and lower; the regular price is then
shown struck through. Listing prices of ERP products are refreshed from the main online store every 15 minutes
(pg_cron `casa-te-refresh-display-prices`) and after each batch.

## Reading `ysoft` (to be confirmed with CASA & TE / ITO)

| Shop field | ysoft source |
|---|---|
| store | `negozio.N` (0 = MAGAZZINO; S. Filippo = ?) → shop store code via agent config |
| erp_code | `prodotti.CodArticolo` |
| name | `prodotti.Descrizione` (`Descrizione2`?) |
| barcode | `prodotti.CodBarre` (more in `codbarre`) |
| brand | `prodotti.marca` → `prodotti_marca.Descrizione` |
| vat_rate | `prodotti.CodIva` |
| list price | `prodotti.PrezzoVedi1` |
| store price | latest `negozio_prezzo` row for (CodArticolo, negozio), else list price |
| promotion | `promozioni` (Data_a, Data_f, negozio) + `promozioni_list.Prezzo_a`; also `prodotti.PrezzoVediOfferta` + `_inizio/_fine` |
| stock | `giacenza.G<N>` for store N |
| category | `prodotti.Categoria/Sottocategoria` → `categorie` (mapping to shop categories to define) |

Never read: purchase prices (`PrezzoForn`, `Prezzo_aqu`), customers, staff, sales.
Open points: which articles go online (`prodotti.web`?), weights (not in ITO), photos (not in ITO), the S. Filippo
store number, priority between `negozio_prezzo` / `promozioni` / `PrezzoVediOfferta`, and the meaning of `PrezzoVedi2/3`.
