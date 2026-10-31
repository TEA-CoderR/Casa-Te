-- Curated category covers. Until now the photo of a department or subcategory was the first stocked product with
-- a photo (featured first, then the oldest), which read as random on the home page and in the Categorie tab.
-- categories.cover_product_id is the product chosen by hand; category_overview uses it while that product is
-- active, has a photo and is in stock somewhere, and falls back to the automatic choice otherwise.
alter table public.categories add column if not exists cover_product_id uuid references public.products(id) on delete set null;
comment on column public.categories.cover_product_id is 'Product whose first photo represents the category (home tiles, Categorie tab). Null = automatic.';
-- Same table-level grants and RLS as the other columns (categories_read / categories_write).

create or replace function public.category_overview(p_avoid text[] default '{}')
returns table (category_id uuid, products integer, cover_path text, cover_sku text)
language sql stable security invoker set search_path = public
as $$
  with stocked as (
    select p.id, p.sku, p.category_id, p.featured, p.created_at,
      (select i.path from public.product_images i where i.product_id = p.id order by i.sort limit 1) as path
    from public.products p
    where p.active and p.category_id is not null
      and exists (select 1 from public.inventory v where v.product_id = p.id and v.quantity > 0)
  ), ranked as (
    select s.*, count(*) over (partition by s.category_id) as n,
      row_number() over (partition by s.category_id
        order by (s.path is null), (s.sku = any(coalesce(p_avoid, '{}'))), s.featured desc, s.created_at, s.sku) as r
    from stocked s
  ), auto as (
    select ranked.category_id, n, path, sku from ranked where r = 1
  ), curated as (
    -- The chosen product, also for a department (whose own products are usually none: they sit in its subcategories).
    select c.id as category_id, s.path, s.sku
    from public.categories c join stocked s on s.id = c.cover_product_id
    where s.path is not null
  )
  select coalesce(a.category_id, k.category_id), coalesce(a.n, 0)::integer, coalesce(k.path, a.path), coalesce(k.sku, a.sku)
  from auto a full join curated k on k.category_id = a.category_id;
$$;

revoke all on function public.category_overview(text[]) from public;
grant execute on function public.category_overview(text[]) to anon, authenticated, service_role;

-- The covers chosen by hand on 31/10/2026 (category slug, product sku): a recognisable product of each
-- department and subcategory, clean packshot, in stock. Rows whose category or product does not exist are skipped.
update public.categories c set cover_product_id = p.id
from (values
  ('bagnoschiuma-e-doccia', '108736'),
  ('saponi', '92746'),
  ('cura-corpo-e-mani', '16825'),
  ('deodoranti', '195000'),
  ('profumi', '110345'),
  ('shampoo', '337793'),
  ('balsamo-e-maschere-capelli', '14901'),
  ('trattamenti-capelli', '152072'),
  ('styling-capelli', '105016'),
  ('colorazione-capelli', '336468'),
  ('cura-viso', '15265'),
  ('struccanti-e-detergenti-viso', '349467'),
  ('trucco', '148275'),
  ('labbra', '197715'),
  ('solari', '349837'),
  ('profumeria-igiene-orale', '345668'),
  ('profumeria-igiene-intima', '196675'),
  ('assorbenti-e-salvaslip', '349482'),
  ('cotone-e-dischetti', '343406'),
  ('salviette', '103953'),
  ('rasatura', '197722'),
  ('depilazione', '197724'),
  ('cura-piedi', '184383'),
  ('prima-infanzia', '337730'),
  ('incontinenza', '112125'),
  ('parafarmacia', '175136'),
  ('profumatori-ambiente', '186623'),
  ('profumatori-auto', '66373'),
  ('caramelle-e-gomme', '166613'),
  ('detersivi-lavatrice', '337792'),
  ('ammorbidenti-e-profumatori-bucato', '195477'),
  ('additivi-bucato-e-candeggina', '195464'),
  ('capi-delicati-e-lavaggio-a-mano', '336328'),
  ('detersivi-stiro', '50923'),
  ('piatti-a-mano', '195425'),
  ('lavastoviglie', '15599'),
  ('sgrassatori-e-multiuso', '339661'),
  ('pavimenti', '15786'),
  ('bagno-e-anticalcare', '195448'),
  ('wc-e-scarichi', '336489'),
  ('vetri', '192616'),
  ('legno-mobili-e-superfici-speciali', '18625'),
  ('disinfettanti-e-igienizzanti', '336324'),
  ('prodotti-base', '30406'),
  ('insetticidi-e-repellenti', '38284'),
  ('casalinghi-cucina', '192076'),
  ('pentole-padelle-stampi', '341432'),
  ('piatti-bicchieri-tazze', '148564'),
  ('caffe-e-te', '41631'),
  ('conservazione', '51125'),
  ('casalinghi-accessori-pulizia', '36451'),
  ('guanti', '136298'),
  ('stiro', '341911'),
  ('custodie-e-ordine', '148551'),
  ('accessori-casa', '68017'),
  ('assorbiumidita', '43498'),
  ('cura-scarpe', '192608'),
  ('accendini-e-accendifuoco', '23712'),
  ('arredo', '213093'),
  ('calze', '342414'),
  ('arredo-bagno', '192765'),
  ('spugne-e-accessori-bagno', '336015'),
  ('raccordi-e-rubinetteria', '312277'),
  ('utensili', '172456'),
  ('materiale-elettrico', '199709'),
  ('pile', '338946'),
  ('colle', '34582'),
  ('auto-e-manutenzione', '195772'),
  ('piatti-bicchieri-e-posate', '184396'),
  ('tovaglioli-e-tovaglie', '28382'),
  ('alluminio-pellicola-e-carta-forno', '351003'),
  ('sacchetti-gelo-e-freezer', '146174'),
  ('vaschette-e-contenitori', '154629'),
  ('asciugatutto', '137744'),
  ('carta-igienica', '20061'),
  ('fazzoletti-e-veline', '41248'),
  ('attrezzi-accessori-giardino', '297996'),
  ('vasi-e-sottovasi', '338960'),
  ('arredo-giardino-barbecue', '336800'),
  ('natale-e-presepe', '163159'),
  ('feste-e-party', '51807'),
  ('mare-e-piscina', '134414'),
  ('borse-frigo-termici', '194218'),
  ('cibo-gatto-umido', '53210'),
  ('cibo-gatto-secco', '21728'),
  ('snack-gatto', '72301'),
  ('cibo-cane-umido', '53208'),
  ('cibo-cane-secco', '50775'),
  ('snack-cane', '143607'),
  ('igiene-e-lettiere', '343035'),
  ('antiparassitari', '143615'),
  ('accessori-e-giochi', '306559'),
  ('altri-animali', '148210'),
  ('giochi', '298845'),
  ('sport-e-all-aperto', '185948'),
  ('cancelleria', '138884'),
  ('colle-e-nastri-adesivi', '337441'),
  ('mobili-e-scaffali', '335386'),
  ('complementi-arredo', '196255'),
  ('illuminazione', '352537'),
  ('elettrodomestici-casa', '174331'),
  ('elettrodomestici-cucina', '136926'),
  ('elettrodomestici-cura-persona', '259583'),
  ('profumeria', '16825'),
  ('dolciumi', '166613'),
  ('detersivi', '337792'),
  ('casalinghi', '41631'),
  ('tessile', '163662'),
  ('bagno', '336015'),
  ('idraulica', '312277'),
  ('ferramenta', '338946'),
  ('monouso', '137744'),
  ('giardinaggio', '297996'),
  ('stagionale', '134414'),
  ('pets', '336506'),
  ('giocattoli', '298845'),
  ('cartoleria', '138884'),
  ('arredo-casa', '352537'),
  ('elettrodomestici', '136926')
) as v(slug, sku)
join public.products p on p.sku = v.sku
where c.slug = v.slug;
