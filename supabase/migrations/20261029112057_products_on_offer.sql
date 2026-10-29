-- Lets the catalogue list discounted products first (store promotion or Club member price).
-- Expired member prices are cleared by refresh_display_prices, so the flag follows them.
alter table public.products
  add column if not exists on_offer boolean generated always as (compare_at_price_cents is not null or member_price_cents is not null) stored;
create index if not exists products_on_offer_idx on public.products (on_offer) where on_offer;
