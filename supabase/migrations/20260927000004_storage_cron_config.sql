-- Storage bucket for product images, scheduled jobs and initial business configuration.

-- ---------------------------------------------------------------------------
-- Product images bucket: public read, managers write.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "product images public read" on storage.objects for select
  using (bucket_id = 'product-images');
create policy "product images managers insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_manager());
create policy "product images managers update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_manager());
create policy "product images managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_manager());

-- ---------------------------------------------------------------------------
-- Release unpaid orders every 5 minutes (requires pg_cron, enabled by default on Supabase).
-- Skipped silently where pg_cron is unavailable (e.g. local test databases).
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('casa-te-expire-stale-orders', '*/5 * * * *', 'select public.expire_stale_orders()');
exception when others then
  raise notice 'pg_cron not available: schedule public.expire_stale_orders() externally (%).', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Agreed shipping model (docs/PROJECT_CONTEXT.md §6). Editable later in the admin console.
-- Identical to DEFAULT_SHIPPING_RULES in packages/shared/src/shipping.ts.
-- ---------------------------------------------------------------------------
insert into public.shipping_rates
  (method, priority, min_subtotal_cents, max_subtotal_cents, min_weight_g, max_weight_g, price_cents, provisional, label)
values
  ('home',   1,  6600, null, 0,     10000,    0, false, 'Spedizione gratuita da €66 (≤10 kg)'),
  ('pickup', 1,  6600, null, 0,     10000,    0, false, 'Spedizione gratuita da €66 (≤10 kg)'),
  ('home',   10, 0,    2499, 0,     2000,   490, false, '< €25 · 0–2 kg'),
  ('pickup', 10, 0,    2499, 0,     2000,   390, false, '< €25 · 0–2 kg'),
  ('home',   11, 0,    2499, 2001,  5000,   690, false, '< €25 · 2–5 kg'),
  ('pickup', 11, 0,    2499, 2001,  5000,   490, false, '< €25 · 2–5 kg'),
  ('home',   12, 0,    2499, 5001,  10000,  890, false, '< €25 · 5–10 kg'),
  ('pickup', 12, 0,    2499, 5001,  10000,  690, false, '< €25 · 5–10 kg'),
  ('home',   20, 2500, 4499, 0,     2000,   390, false, '€25–44,99 · 0–2 kg'),
  ('pickup', 20, 2500, 4499, 0,     2000,   290, false, '€25–44,99 · 0–2 kg'),
  ('home',   21, 2500, 4499, 2001,  5000,   590, false, '€25–44,99 · 2–5 kg'),
  ('pickup', 21, 2500, 4499, 2001,  5000,   390, false, '€25–44,99 · 2–5 kg'),
  ('home',   22, 2500, 4499, 5001,  10000,  790, false, '€25–44,99 · 5–10 kg'),
  ('pickup', 22, 2500, 4499, 5001,  10000,  590, false, '€25–44,99 · 5–10 kg'),
  ('home',   30, 4500, 6599, 0,     2000,   290, false, '€45–65,99 · 0–2 kg'),
  ('pickup', 30, 4500, 6599, 0,     2000,   190, false, '€45–65,99 · 0–2 kg'),
  ('home',   31, 4500, 6599, 2001,  5000,   490, false, '€45–65,99 · 2–5 kg'),
  ('pickup', 31, 4500, 6599, 2001,  5000,   290, false, '€45–65,99 · 2–5 kg'),
  ('home',   32, 4500, 6599, 5001,  10000,  690, false, '€45–65,99 · 5–10 kg'),
  ('pickup', 32, 4500, 6599, 5001,  10000,  490, false, '€45–65,99 · 5–10 kg'),
  ('home',   90, 0,    null, 10001, null,  1290, true,  '> 10 kg · PROVVISORIO'),
  ('pickup', 90, 0,    null, 10001, null,   990, true,  '> 10 kg · PROVVISORIO');

-- The five CASA & TE stores. Addresses, phones and hours are intentionally left empty:
-- fill them in the admin console with verified data.
insert into public.stores (code, name, city, province, sort) values
  ('AR1', 'CASA & TE Arezzo', 'Arezzo', 'AR', 1),
  ('LU1', 'CASA & TE Lucca 1', 'Lucca', 'LU', 2),
  ('LU2', 'CASA & TE Lucca 2', 'Lucca', 'LU', 3),
  ('LU3', 'CASA & TE Lucca 3', 'Lucca', 'LU', 4),
  ('LU4', 'CASA & TE Lucca 4', 'Lucca', 'LU', 5)
on conflict (code) do nothing;
