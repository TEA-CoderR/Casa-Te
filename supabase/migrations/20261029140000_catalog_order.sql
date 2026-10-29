-- Catalogue order: products are listed grouped by their (sub)category, in the order of the category tree,
-- instead of alphabetically across a whole department. Plus a one-off clean-up of the category tree.

-- 1) Position of each category in the tree: departments by sort/name, their subcategories right after.
alter table public.products add column if not exists category_rank integer;

create or replace function public.category_rank_of(p_category uuid)
returns integer language sql stable security definer set search_path = '' as $$
  with ranked as (
    select c.id, row_number() over (order by coalesce(t.sort, c.sort), coalesce(t.name, c.name),
      (c.parent_id is not null), c.sort, c.name) as r
    from public.categories c left join public.categories t on t.id = c.parent_id
  )
  select r::integer from ranked where id = p_category;
$$;

create or replace function public.refresh_category_ranks()
returns void language plpgsql security definer set search_path = '' as $$
begin
  with ranked as (
    select c.id, row_number() over (order by coalesce(t.sort, c.sort), coalesce(t.name, c.name),
      (c.parent_id is not null), c.sort, c.name)::integer as r
    from public.categories c left join public.categories t on t.id = c.parent_id
  )
  update public.products p set category_rank = ranked.r
  from ranked where ranked.id = p.category_id and p.category_rank is distinct from ranked.r;
  update public.products set category_rank = null where category_id is null and category_rank is not null;
end $$;

create or replace function public.products_set_category_rank()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.category_rank := case when new.category_id is null then null else public.category_rank_of(new.category_id) end;
  return new;
end $$;

drop trigger if exists products_category_rank on public.products;
create trigger products_category_rank before insert or update of category_id on public.products
  for each row execute function public.products_set_category_rank();

create or replace function public.categories_refresh_ranks()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_category_ranks();
  return null;
end $$;

drop trigger if exists categories_refresh_ranks on public.categories;
create trigger categories_refresh_ranks after insert or delete or update of sort, name, parent_id on public.categories
  for each statement execute function public.categories_refresh_ranks();

create index if not exists products_catalog_order_idx on public.products (category_rank, name) where active;

revoke all on function public.category_rank_of(uuid), public.refresh_category_ranks(),
  public.products_set_category_rank(), public.categories_refresh_ranks() from public, anon, authenticated;
grant execute on function public.refresh_category_ranks() to service_role;

-- 2) Clean-up (by slug, so it does nothing where these categories do not exist).
-- "Cucina e conservazione" duplicated two existing subcategories: kitchen tools to Cucina, containers to Conservazione.
update public.products p set category_id = (select id from public.categories where slug = 'casalinghi-cucina')
  where p.category_id = (select id from public.categories where slug = 'cucina-e-conservazione')
    and p.name ~* '(tasca|spago)' and exists (select 1 from public.categories where slug = 'casalinghi-cucina');
update public.products p set category_id = (select id from public.categories where slug = 'conservazione')
  where p.category_id = (select id from public.categories where slug = 'cucina-e-conservazione')
    and exists (select 1 from public.categories where slug = 'conservazione');

-- Subcategories without any product (leftovers of an older tree, several duplicated other names).
delete from public.categories c
  where c.parent_id is not null
    and c.slug in ('ammorbidente', 'superfici', 'piatti', 'tavola', 'cura-corpo', 'igiene-orale', 'cura-capelli',
      'igiene-intima', 'carta', 'tavola-monouso', 'sacchi-nettezza', 'cura-piante', 'decorazioni',
      'pets-cibo-gatto', 'pets-cibo-cane', 'pets-accessori', 'cucina-e-conservazione')
    and not exists (select 1 from public.products p where p.category_id = c.id);

-- Subcategories in a shopping order (laundry together, dishes together, ...).
update public.categories c set sort = o.pos * 10
from (select slug, pos from unnest(array[
    -- Detersivi
    'detersivi-lavatrice', 'ammorbidenti-e-profumatori-bucato', 'additivi-bucato-e-candeggina', 'capi-delicati-e-lavaggio-a-mano',
    'detersivi-stiro', 'piatti-a-mano', 'lavastoviglie', 'sgrassatori-e-multiuso', 'pavimenti', 'bagno-e-anticalcare',
    'wc-e-scarichi', 'vetri', 'legno-mobili-e-superfici-speciali', 'disinfettanti-e-igienizzanti', 'prodotti-base',
    'insetticidi-e-repellenti'
  ]) with ordinality as x(slug, pos)
  union all select slug, pos from unnest(array[
    -- Profumeria
    'bagnoschiuma-e-doccia', 'saponi', 'cura-corpo-e-mani', 'deodoranti', 'profumi', 'shampoo', 'balsamo-e-maschere-capelli',
    'trattamenti-capelli', 'styling-capelli', 'colorazione-capelli', 'accessori-capelli', 'cura-viso',
    'struccanti-e-detergenti-viso', 'trucco', 'labbra', 'solari', 'profumeria-igiene-orale', 'profumeria-igiene-intima',
    'assorbenti-e-salvaslip', 'cotone-e-dischetti', 'salviette', 'rasatura', 'depilazione', 'cura-piedi', 'prima-infanzia',
    'incontinenza', 'parafarmacia', 'profumatori-ambiente', 'profumatori-auto', 'confezioni-regalo'
  ]) with ordinality as x(slug, pos)
  union all select slug, pos from unnest(array[
    -- Casalinghi
    'casalinghi-cucina', 'pentole-padelle-stampi', 'piatti-bicchieri-tazze', 'caffe-e-te', 'conservazione',
    'casalinghi-accessori-pulizia', 'guanti', 'stiro', 'custodie-e-ordine', 'accessori-casa', 'assorbiumidita',
    'cura-scarpe', 'accendini-e-accendifuoco'
  ]) with ordinality as x(slug, pos)
  union all select slug, pos from unnest(array[
    -- Monouso
    'piatti-bicchieri-e-posate', 'tovaglioli-e-tovaglie', 'alluminio-pellicola-e-carta-forno', 'sacchetti-gelo-e-freezer',
    'vaschette-e-contenitori', 'asciugatutto', 'carta-igienica', 'fazzoletti-e-veline', 'sacchi-spazzatura'
  ]) with ordinality as x(slug, pos)
  union all select slug, pos from unnest(array[
    -- Pets
    'cibo-gatto-umido', 'cibo-gatto-secco', 'snack-gatto', 'cibo-cane-umido', 'cibo-cane-secco', 'snack-cane',
    'igiene-e-lettiere', 'antiparassitari', 'accessori-e-giochi', 'altri-animali'
  ]) with ordinality as x(slug, pos)
  union all select slug, pos from unnest(array[
    -- Ferramenta, Bagno, Giardinaggio, Stagionale
    'utensili', 'materiale-elettrico', 'pile', 'colle', 'auto-e-manutenzione'
  ]) with ordinality as x(slug, pos)
  union all select slug, pos from unnest(array['arredo-bagno', 'spugne-e-accessori-bagno']) with ordinality as x(slug, pos)
  union all select slug, pos from unnest(array['attrezzi-accessori-giardino', 'vasi-e-sottovasi', 'arredo-giardino-barbecue']) with ordinality as x(slug, pos)
  union all select slug, pos from unnest(array['natale-e-presepe', 'feste-e-party', 'carta-accessori-regalo', 'mare-e-piscina',
    'borse-frigo-termici']) with ordinality as x(slug, pos)
) o
where c.slug = o.slug and c.parent_id is not null and c.sort is distinct from (o.pos * 10)::integer;

select public.refresh_category_ranks();
