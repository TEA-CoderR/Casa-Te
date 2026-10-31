-- Unit prices ("€/kg", "€/l") came from wrong pack sizes on some imported products: a model code read as a
-- weight ("E2" → 2 g, "1xE27" → 27 g on ceiling lamps, sandpaper grit "g. 80"), or sizes that are not in the
-- name at all. Fix the ones whose size is written in the name; hide the unit price where the size is unknown
-- (better no unit price than a wrong one). Names cut short by an older import ("Bagno Ambra 6 ml" for 650 ml)
-- get the size back from the pack size. Keyed by sku; rows that do not exist are skipped.

-- 1. Not a measure of the content, or size unknown: no unit price.
update public.products set unit = null, unit_quantity = null
where sku in ('155815', '175136', '151785', '155805', '196668', '203391', '183680', '180424', '174657',
              '104558', '104560', '104561', '104562', '349386', '349387', '349388')
   or (unit = 'g' and unit_quantity = 27 and name ~* 'x\s?e27');

-- 2. Size written in the name.
update public.products p set unit = v.unit, unit_quantity = v.q
from (values
  ('15493', 'g', 380), ('172446', 'l', 1.15), ('172447', 'l', 1.15), ('172448', 'l', 1.15), ('254441', 'l', 1.25),
  ('171455', 'kg', 1), ('195178', 'kg', 5), ('183050', 'g', 100), ('191347', 'l', 1.25), ('351752', 'l', 1.056),
  ('197711', 'ml', 4.8), ('197715', 'ml', 4.8)
) as v(sku, unit, q)
where p.sku = v.sku;

-- 3. Names that say ml for litres ("Napisan 1,15 ml", "Amuchina 1 ml" = 1 l) or g for kg.
update public.products set name = regexp_replace(name, '1,15 ml', '1,15 l') where sku in ('172446', '172447', '172448');
update public.products set name = regexp_replace(name, '1,25 ml', '1,25 l') where sku = '254441';
update public.products set name = regexp_replace(name, '\m1 ml\M', '1 l') where sku = '15507';
update public.products set name = regexp_replace(name, '\m1 g\M', '1 kg') where sku = '30451';

-- 4. Sizes cut short in the name: the number in the name is the start of the real pack size ("6 ml" → "650 ml").
with t as (
  select id, name, unit, unit_quantity q, (regexp_match(name, '(\d+)\s?(ml|g)\M(?!.*\d\s?(ml|g)\M)', 'i')) m
  from public.products where unit in ('ml', 'g') and unit_quantity is not null
)
update public.products p
set name = regexp_replace(t.name, '(\d+)\s?(ml|g)\M(?!.*\d\s?(ml|g)\M)', trim(to_char(t.q, 'FM999999')) || ' ' || t.unit, 'i')
from t
where p.id = t.id and t.m is not null and lower(t.m[2]) = t.unit and t.q = trunc(t.q)
  and t.m[1]::numeric <> t.q and trim(to_char(t.q, 'FM999999')) like t.m[1] || '_%';
