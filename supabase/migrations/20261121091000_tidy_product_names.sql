-- Product names: format cleanup reviewed on 21/11/2026 (docs/design/name-cleanup-draft.md). Only the format:
-- measurements "58x38x82h" -> "58×38×82 cm" (cm only when the name said cm), a number glued to a word gets a space,
-- supplier codes at the end are dropped. Safeguards found in the dry run: a code stays when dropping it would give
-- two products the same name; "cm" after a number stays with it ("Dorso 3 cm 35x2"); measurements are never codes.
-- Names edited by hand (name <> clean_product_name(erp_name)) are left alone; the ERP text stays in erp_name.
-- New ERP products get the same cleanup on insert.

create or replace function public.tidy_product_name(p_name text, p_codes boolean default true)
returns text language plpgsql immutable set search_path = '' as $$
declare
  s text := coalesce(p_name, '');
  n constant text := '([0-9]+(?:[.,][0-9]+)?)';
  x constant text := '\s*[xX*×]\s*h?\s*';
  cm constant text := '(?<![0-9]\s)(?<![0-9])\m[Cc][Mm]\.?\s*';
  code_end constant text := '\s+[0-9]?[A-Z]{1,3}(?![0-9A-Z]*[0-9]X[0-9])(?![0-9A-Z]*CM)(?=[0-9A-Z]*[0-9][0-9A-Z]*[0-9][0-9A-Z]*[0-9])[0-9][0-9A-Z]{2,}\s*$';
begin
  -- a number glued to a word of 4+ letters ("Selnova3" -> "Selnova 3"); not "Allin1", "Tuttoin1"
  s := regexp_replace(s, '([a-zà-ù]{4,})(?<!in)([0-9]+)(?![a-wyz0-9])', '\1 \2', 'g');
  -- measurements with cm in front ("Cm. 180x28x44h") or after ("37*29*83 cm"); without a unit only the ×
  s := regexp_replace(s, cm || n || x || n || x || n || '\s*h?(?![0-9A-Za-z])', '\1×\2×\3 cm', 'g');
  s := regexp_replace(s, cm || n || x || n || '\s*h?(?![0-9A-Za-z])', '\1×\2 cm', 'g');
  s := regexp_replace(s, n || x || n || x || n || '\s*h?\s*cm\M', '\1×\2×\3 cm', 'g');
  s := regexp_replace(s, n || '\s*[xX*]\s*h?\s*' || n || '\s*h?\s*cm\M', '\1×\2 cm', 'g');
  s := regexp_replace(s, '(?<![0-9A-Za-z/,.])' || n || '\s*[xX*]\s*' || n || '\s*[xX*]\s*' || n || '(?![0-9,.]*\s*mm)(?![0-9A-Za-z])', '\1×\2×\3', 'g');
  if p_codes then
    -- "C1913", "C12T6", "4PZ374"; "Yd-19803-A"; a number or code right after "cm" ("22 cm 9908", "cm Qb12485c")
    s := regexp_replace(s, code_end, '');
    s := regexp_replace(s, code_end, '');
    s := regexp_replace(s, '\s+[A-Za-z]{1,4}-[0-9]{3,}[A-Za-z0-9-]*\s*$', '');
    s := regexp_replace(s, '(\scm)\s+[0-9]{4,6}\s*$', '\1');
    s := regexp_replace(s, '(\scm)\s+(?![^ ]*[0-9][xX*×][0-9])(?=[A-Za-z0-9/-]*[0-9][A-Za-z0-9/-]*[0-9][A-Za-z0-9/-]*[0-9])[A-Za-z0-9/-]{4,}\s*$', '\1');
  end if;
  s := trim(regexp_replace(s, '\s{2,}', ' ', 'g'));
  return case when s = '' then p_name else s end;
end $$;
revoke all on function public.tidy_product_name(text, boolean) from public;
grant execute on function public.tidy_product_name(text, boolean) to authenticated, service_role;

-- One pass over the existing names, with the uniqueness safeguard.
with t as (
  select id, name, public.tidy_product_name(name) as full_after, public.tidy_product_name(name, false) as safe_after
  from public.products where erp_name is not null and name = public.clean_product_name(erp_name)
), dup as (
  select t.id from t where exists (select 1 from t o where o.id <> t.id and lower(o.full_after) = lower(t.full_after) and lower(o.name) <> lower(t.name))
)
update public.products p
set name = case when p.id in (select id from dup) then t.safe_after else t.full_after end
from t
where p.id = t.id and p.name <> case when p.id in (select id from dup) then t.safe_after else t.full_after end;

-- New products from the ERP: the same cleanup, keeping the code if another product already has that name.
create or replace function public.products_tidy_name()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if new.erp_name is not null and new.name = public.clean_product_name(new.erp_name) then
    v := public.tidy_product_name(new.name);
    if exists (select 1 from public.products o where o.id is distinct from new.id and lower(o.name) = lower(v)) then
      v := public.tidy_product_name(new.name, false);
    end if;
    new.name := v;
  end if;
  return new;
end $$;
revoke all on function public.products_tidy_name() from public, anon, authenticated;
create trigger products_tidy_name before insert on public.products
  for each row execute function public.products_tidy_name();
