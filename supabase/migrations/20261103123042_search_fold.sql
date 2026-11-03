-- Search ignores accents and apostrophes: "caffè", "caffe'" and "caffe" find the same products.
-- The ERP writes "Caffe’" while customers type "caffè"; a few names carry accents ("Capacità").
-- packages/shared `searchKey` folds the typed text the same way.
create or replace function public.search_fold(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select translate(lower(p),
    'àáâäãåèéêëìíîïòóôöõøùúûüçñÀÁÂÄÃÅÈÉÊËÌÍÎÏÒÓÔÖÕØÙÚÛÜÇÑ''’‘`´',
    'aaaaaaeeeeiiiioooooouuuucnaaaaaaeeeeiiiioooooouuuucn');
  -- Capitals are listed too: lower() leaves them as they are under the C collation.
$$;
revoke all on function public.search_fold(text) from public;
grant execute on function public.search_fold(text) to anon, authenticated, service_role;

alter table public.products drop column search_text;
alter table public.products add column search_text text generated always as (
  public.search_fold(name || ' ' || coalesce(brand, '') || ' ' || sku || ' ' || coalesce(barcode, ''))
) stored;
create index products_search_idx on public.products using gin (search_text extensions.gin_trgm_ops);
