-- "Fotografa un prodotto" (plan v3 X3, step 1): the phone reads the text on the pack on the device (ML Kit /
-- Apple Vision, nothing is uploaded) and sends only that text here. Products are ranked by how much of their name
-- is printed on the pack; a barcode number read from the pack is an exact match.
-- Display only: prices and stock are read again by the caller.

create or replace function public.label_words(p text)
returns text language sql immutable parallel safe set search_path = '' as $$
  -- Folded, punctuation to spaces, numbers apart from their units ("930ml" -> "930 ml"), padded with spaces.
  select ' ' || trim(regexp_replace(regexp_replace(regexp_replace(public.search_fold(coalesce(p, '')),
    '[^a-z0-9]+', ' ', 'g'), '([0-9])([a-z])', '\1 \2', 'g'), '([a-z])([0-9])', '\1 \2', 'g')) || ' ';
$$;
revoke all on function public.label_words(text) from public;
grant execute on function public.label_words(text) to anon, authenticated, service_role;

create or replace function public.match_label_text(p_text text, p_store uuid default null, p_limit integer default 6)
returns table (product_id uuid, score numeric, exact boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with t as (
    select public.label_words(left(coalesce(p_text, ''), 4000)) as txt,
           -- Barcode digits are often read in groups ("8 001090 123456"): joined again before looking for codes.
           regexp_replace(regexp_replace(left(coalesce(p_text, ''), 4000), '([0-9])[ .-]+([0-9])', '\1\2', 'g'),
             '([0-9])[ .-]+([0-9])', '\1\2', 'g') as digits
  ), codes as (
    select distinct ltrim(m[1], '0') as code from t, regexp_matches(t.digits, '(?:^|[^0-9])([0-9]{8}|[0-9]{12,14})(?![0-9])', 'g') m
  ), words as (
    select distinct w from t, regexp_split_to_table(trim(t.txt), ' ') w where length(w) >= 4 and w !~ '^[0-9]+$'
    limit 80
  ), scope as (
    select p.id, p.name, p.brand, p.barcode, public.label_words(p.name) as nw,
      exists (select 1 from public.inventory i where i.product_id = p.id and i.quantity > 0
              and (p_store is null or i.store_id = p_store)) as in_stock
    from public.products p
    where p.active
      and (exists (select 1 from words where p.search_text like '%' || words.w || '%')
        or (p.barcode is not null and ltrim(p.barcode, '0') in (select code from codes)))
  ), scored as (
    select s.id, s.name, s.in_stock,
      s.barcode is not null and ltrim(s.barcode, '0') in (select code from codes) as exact,
      -- The name's words (letters only, 3+): how many are printed on the pack, singular or plural.
      (select count(*) from regexp_split_to_table(trim(s.nw), ' ') w where w ~ '^[a-z]{3,}$') as total,
      (select count(*) from regexp_split_to_table(trim(s.nw), ' ') w, t
        where w ~ '^[a-z]{3,}$' and t.txt like '% ' || public.search_stem(w) || '%') as matched,
      -- The size or quantity ("930", "750") printed on the pack tells variants apart.
      (select count(*) from regexp_split_to_table(trim(s.nw), ' ') w, t
        where w ~ '^[0-9]{2,}$' and t.txt like '% ' || w || ' %') as sizes,
      s.brand is not null and length(s.brand) >= 3 and (select t.txt from t) like '% ' || trim(public.label_words(s.brand)) || ' %' as brand_hit
    from scope s
  )
  select id,
    round(case when exact then 10 else
      matched::numeric / greatest(total, 1) + 0.15 * least(sizes, 2) + case when brand_hit then 0.2 else 0 end + 0.02 * matched end, 3),
    exact
  from scored
  where exact or matched >= 2 or (matched = 1 and total = 1)
  order by 2 desc, in_stock desc, name, id
  limit least(greatest(p_limit, 1), 20);
$$;
revoke all on function public.match_label_text(text, uuid, integer) from public;
grant execute on function public.match_label_text(text, uuid, integer) to anon, authenticated, service_role;
