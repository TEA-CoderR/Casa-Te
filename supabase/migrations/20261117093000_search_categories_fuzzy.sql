-- Search that understands how customers ask (plan v3 L1):
-- * "detersivo piatti" found nothing: products are named "Svelto Piatti …" and only their category says "Detersivi
--   piatti". The names of the category and its parent now count (products.category_text, kept by triggers);
-- * singular/plural: a word of 5+ letters matches without its last vowel ("detersivo" finds "detersivi");
-- * spelling variants the shop lists (search_synonyms: "sciampo" → "shampoo");
-- * typos: when fewer than 6 products match, close spellings follow ("carta igenica"), marked `fuzzy`.
-- Display only: prices and stock are read again by the caller.

alter table public.products add column category_text text not null default '';

-- The activity log ignores the derived column, like search_text (copy of 20261003000002 with that one addition).
create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_watch text[] := case when tg_nargs > 0 and tg_argv[0] <> '' then string_to_array(tg_argv[0], ',') end;
  v_staff_only boolean := tg_nargs > 1 and tg_argv[1] = 'staff';
  v_ignore text[] := array['updated_at', 'created_at', 'search_text', 'category_text', 'rating_avg', 'rating_count', 'redemptions', 'updated_by'];
  v_actor uuid := auth.uid();
  v_changes text[] := '{}';
  v_details jsonb := '{}'::jsonb;
  v_label text;
  v_name text;
  k text;
begin
  if v_actor is not null and not public.is_staff() then return null; end if;
  if v_staff_only and v_actor is null then return null; end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) order by 1 loop
      continue when k = any(v_ignore) or (v_watch is not null and not k = any(v_watch));
      if v_new -> k is distinct from v_old -> k then
        v_changes := v_changes || k;
        if coalesce(length((v_old -> k)::text), 0) <= 120 and coalesce(length((v_new -> k)::text), 0) <= 120 then
          v_details := v_details || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
        end if;
      end if;
    end loop;
    if cardinality(v_changes) = 0 then return null; end if;
  end if;

  if tg_table_name = 'inventory' then
    select p.name || ' · ' || s.code into v_label from public.products p, public.stores s
      where p.id = (v_row ->> 'product_id')::uuid and s.id = (v_row ->> 'store_id')::uuid;
  elsif tg_table_name = 'app_settings' then
    v_label := 'app_settings';
  elsif tg_table_name = 'shipping_rates' then
    v_label := coalesce(v_row ->> 'label', v_row ->> 'method');
  elsif tg_table_name = 'product_reviews' then
    select p.name into v_label from public.products p where p.id = (v_row ->> 'product_id')::uuid;
  else
    v_label := coalesce(v_row ->> 'order_number', v_row ->> 'name', v_row ->> 'code', v_row ->> 'display_name',
      v_row ->> 'full_name', v_row ->> 'email', v_row ->> 'sku');
  end if;

  select coalesce(nullif(s.display_name, ''), s.email, u.email) into v_name
    from auth.users u left join public.staff_members s on s.user_id = u.id where u.id = v_actor;
  insert into public.activity_log (actor_id, actor_name, entity, entity_id, label, action, changes, details)
  values (v_actor, v_name, tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'product_id'),
    v_label, lower(tg_op), v_changes, v_details);
  return null;
end $$;

create or replace function public.category_search_text(p_category uuid)
returns text language sql stable set search_path = '' as $$
  select coalesce((select public.search_fold(c.name || ' ' || coalesce(parent.name, ''))
    from public.categories c left join public.categories parent on parent.id = c.parent_id where c.id = p_category), '');
$$;
revoke all on function public.category_search_text(uuid) from public, anon, authenticated;
grant execute on function public.category_search_text(uuid) to service_role;

create or replace function public.products_category_text()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.category_text := public.category_search_text(new.category_id);
  return new;
end $$;
revoke all on function public.products_category_text() from public, anon, authenticated;
create trigger products_category_text before insert or update of category_id on public.products
  for each row execute function public.products_category_text();

create or replace function public.categories_refresh_search_text()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.products p set category_text = public.category_search_text(p.category_id)
  where p.category_id = new.id or p.category_id in (select c.id from public.categories c where c.parent_id = new.id);
  return null;
end $$;
revoke all on function public.categories_refresh_search_text() from public, anon, authenticated;
create trigger categories_search_text after update of name, parent_id on public.categories
  for each row execute function public.categories_refresh_search_text();

update public.products set category_text = public.category_search_text(category_id) where category_id is not null;

-- Other ways customers write a word: `term` (folded, as typed) is searched as `expands_to`.
create table public.search_synonyms (
  term text primary key check (term = public.search_fold(term) and length(term) between 2 and 60),
  expands_to text not null check (length(expands_to) between 2 and 120),
  created_at timestamptz not null default now()
);
alter table public.search_synonyms enable row level security;
create policy search_synonyms_read on public.search_synonyms for select to anon, authenticated using (true);
create policy search_synonyms_write on public.search_synonyms for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
revoke all on public.search_synonyms from anon, authenticated;
grant select on public.search_synonyms to anon, authenticated;
grant insert, update, delete on public.search_synonyms to authenticated;
grant all on public.search_synonyms to service_role;
insert into public.search_synonyms (term, expands_to) values
  ('sciampo', 'shampoo'), ('shampo', 'shampoo'), ('sciampoo', 'shampoo');

-- A word of 5+ letters without its final vowel, so singular and plural meet ("detersivo"/"detersivi").
create or replace function public.search_stem(p text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select case when length(p) >= 5 and right(p, 1) in ('a', 'e', 'i', 'o') then left(p, length(p) - 1) else p end;
$$;
revoke all on function public.search_stem(text) from public;
grant execute on function public.search_stem(text) to anon, authenticated, service_role;

-- The return type gains `fuzzy`, so the function is recreated (same arguments; older apps ignore the new column).
drop function public.search_products(text, uuid, uuid[], boolean, integer, integer);
create function public.search_products(
  p_query text, p_store uuid default null, p_category_ids uuid[] default null,
  p_on_sale boolean default false, p_limit integer default 40, p_offset integer default 0)
returns table (product_id uuid, total bigint, fuzzy boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with typed as (
    select trim(public.search_fold(coalesce(p_query, ''))) as k
  ), q0 as (
    -- The whole text, or each word, replaced by its synonym when the shop listed one.
    select coalesce((select s.expands_to from public.search_synonyms s where s.term = typed.k),
      (select string_agg(coalesce(s.expands_to, w.word), ' ' order by w.ord)
       from regexp_split_to_table(typed.k, '\s+') with ordinality as w(word, ord)
       left join public.search_synonyms s on s.term = w.word
       where w.word <> ''), '') as k
    from typed
  ), q as (
    select public.search_fold(q0.k) as k,
           array_remove(regexp_split_to_array(public.search_fold(q0.k), '\s+'), '') as words
    from q0
  ), scope as (
    select p.id, p.name, p.brand, p.category_rank, p.search_text, p.category_text,
      exists (select 1 from public.inventory i where i.product_id = p.id and i.quantity > 0
              and (p_store is null or i.store_id = p_store)) as in_stock
    from public.products p, q
    where p.active and cardinality(q.words) > 0
      and (p_category_ids is null or p.category_id = any (p_category_ids))
      and (not p_on_sale or p.compare_at_price_cents is not null or p.member_price_cents is not null)
  ), strict as (
    -- Every word (without its final vowel) is in the name, brand, code — or in the category's names.
    select s.id, s.name, s.category_rank, s.in_stock,
      case when public.search_fold(s.name) like q.k || '%' then 0
           when ' ' || public.search_fold(s.name) || ' ' like '% ' || q.words[1] || ' %' then 1
           when ' ' || public.search_fold(s.name) like '% ' || public.search_stem(q.words[1]) || '%'
             or public.search_fold(coalesce(s.brand, '')) like q.words[1] || '%' then 2
           when s.search_text like '%' || public.search_stem(q.words[1]) || '%' then 3
           else 4 end as rank
    from scope s, q
    where not exists (select 1 from unnest(q.words) w
      where s.search_text not like '%' || public.search_stem(w) || '%'
        and s.category_text not like '%' || public.search_stem(w) || '%')
  ), close as (
    -- Few or no matches: products where each word is there or spelled almost like one of theirs.
    select s.id, s.name, s.category_rank, s.in_stock,
      (select avg(extensions.word_similarity(w, s.search_text)) from unnest(q.words) w) as likeness
    from scope s, q
    where (select count(*) from strict) < 6
      and not exists (select 1 from strict t where t.id = s.id)
      and not exists (select 1 from unnest(q.words) w
        where s.search_text not like '%' || public.search_stem(w) || '%'
          and (length(w) < 4 or extensions.word_similarity(w, s.search_text) < 0.45))
  ), hits as (
    select id, name, category_rank, in_stock, rank::numeric as rank, false as fuzzy from strict
    union all
    select id, name, category_rank, in_stock, 1 - likeness, true from close
  )
  select id, count(*) over (), fuzzy
  from hits
  order by fuzzy, in_stock desc, rank, category_rank nulls last, name, id
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;
revoke all on function public.search_products(text, uuid, uuid[], boolean, integer, integer) from public;
grant execute on function public.search_products(text, uuid, uuid[], boolean, integer, integer) to anon, authenticated, service_role;
