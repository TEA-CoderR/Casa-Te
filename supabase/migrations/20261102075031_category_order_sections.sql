-- Categorie tab: subcategories in shopping order, grouped under short headings inside the big departments
-- (Profumeria: Corpo, Capelli, Viso e trucco…), Dolciumi (3 products) moved to the end of the departments, and
-- better cover photos for the subcategories whose first choice read badly at tile size (thin or tiny packshots).

alter table public.categories add column if not exists section text check (section is null or char_length(section) between 1 and 40);
comment on column public.categories.section is 'Group heading of a subcategory inside its department (Categorie tab). Null = no heading.';
-- Same table-level grants and RLS as the other columns.

-- Subcategories of a department listed here and not in the list go after the listed ones.
update public.categories c set sort = 900, section = null
from public.categories d
where c.parent_id = d.id and d.slug in ('profumeria', 'detersivi', 'casalinghi', 'pets', 'monouso', 'ferramenta');

update public.categories c set sort = v.sort, section = v.section
from (values
  ('profumeria', 'bagnoschiuma-e-doccia', 10, 'Corpo'),
  ('profumeria', 'saponi', 20, 'Corpo'),
  ('profumeria', 'deodoranti', 30, 'Corpo'),
  ('profumeria', 'cura-corpo-e-mani', 40, 'Corpo'),
  ('profumeria', 'profumi', 50, 'Corpo'),
  ('profumeria', 'shampoo', 60, 'Capelli'),
  ('profumeria', 'balsamo-e-maschere-capelli', 70, 'Capelli'),
  ('profumeria', 'trattamenti-capelli', 80, 'Capelli'),
  ('profumeria', 'styling-capelli', 90, 'Capelli'),
  ('profumeria', 'colorazione-capelli', 100, 'Capelli'),
  ('profumeria', 'cura-viso', 110, 'Viso e trucco'),
  ('profumeria', 'struccanti-e-detergenti-viso', 120, 'Viso e trucco'),
  ('profumeria', 'trucco', 130, 'Viso e trucco'),
  ('profumeria', 'labbra', 140, 'Viso e trucco'),
  ('profumeria', 'solari', 150, 'Viso e trucco'),
  ('profumeria', 'profumeria-igiene-orale', 160, 'Igiene'),
  ('profumeria', 'profumeria-igiene-intima', 170, 'Igiene'),
  ('profumeria', 'assorbenti-e-salvaslip', 180, 'Igiene'),
  ('profumeria', 'rasatura', 190, 'Igiene'),
  ('profumeria', 'depilazione', 200, 'Igiene'),
  ('profumeria', 'cotone-e-dischetti', 210, 'Igiene'),
  ('profumeria', 'salviette', 220, 'Igiene'),
  ('profumeria', 'cura-piedi', 230, 'Igiene'),
  ('profumeria', 'prima-infanzia', 240, 'Bimbi e salute'),
  ('profumeria', 'incontinenza', 250, 'Bimbi e salute'),
  ('profumeria', 'parafarmacia', 260, 'Bimbi e salute'),
  ('profumeria', 'profumatori-ambiente', 270, 'Profumi per casa e auto'),
  ('profumeria', 'profumatori-auto', 280, 'Profumi per casa e auto'),
  ('detersivi', 'detersivi-lavatrice', 10, 'Bucato'),
  ('detersivi', 'ammorbidenti-e-profumatori-bucato', 20, 'Bucato'),
  ('detersivi', 'additivi-bucato-e-candeggina', 30, 'Bucato'),
  ('detersivi', 'capi-delicati-e-lavaggio-a-mano', 40, 'Bucato'),
  ('detersivi', 'detersivi-stiro', 50, 'Bucato'),
  ('detersivi', 'piatti-a-mano', 60, 'Stoviglie'),
  ('detersivi', 'lavastoviglie', 70, 'Stoviglie'),
  ('detersivi', 'sgrassatori-e-multiuso', 80, 'Pulizia della casa'),
  ('detersivi', 'pavimenti', 90, 'Pulizia della casa'),
  ('detersivi', 'bagno-e-anticalcare', 100, 'Pulizia della casa'),
  ('detersivi', 'wc-e-scarichi', 110, 'Pulizia della casa'),
  ('detersivi', 'vetri', 120, 'Pulizia della casa'),
  ('detersivi', 'disinfettanti-e-igienizzanti', 130, 'Pulizia della casa'),
  ('detersivi', 'legno-mobili-e-superfici-speciali', 140, 'Pulizia della casa'),
  ('detersivi', 'prodotti-base', 150, 'Pulizia della casa'),
  ('detersivi', 'insetticidi-e-repellenti', 160, 'Insetti'),
  ('casalinghi', 'casalinghi-cucina', 10, 'Cucina e tavola'),
  ('casalinghi', 'pentole-padelle-stampi', 20, 'Cucina e tavola'),
  ('casalinghi', 'piatti-bicchieri-tazze', 30, 'Cucina e tavola'),
  ('casalinghi', 'caffe-e-te', 40, 'Cucina e tavola'),
  ('casalinghi', 'conservazione', 50, 'Cucina e tavola'),
  ('casalinghi', 'casalinghi-accessori-pulizia', 60, 'Pulizia'),
  ('casalinghi', 'guanti', 70, 'Pulizia'),
  ('casalinghi', 'stiro', 80, 'Casa e ordine'),
  ('casalinghi', 'custodie-e-ordine', 90, 'Casa e ordine'),
  ('casalinghi', 'assorbiumidita', 100, 'Casa e ordine'),
  ('casalinghi', 'accessori-casa', 110, 'Casa e ordine'),
  ('casalinghi', 'cura-scarpe', 120, 'Casa e ordine'),
  ('casalinghi', 'accendini-e-accendifuoco', 130, 'Casa e ordine'),
  ('pets', 'cibo-gatto-umido', 10, 'Gatto'),
  ('pets', 'cibo-gatto-secco', 20, 'Gatto'),
  ('pets', 'snack-gatto', 30, 'Gatto'),
  ('pets', 'cibo-cane-umido', 40, 'Cane'),
  ('pets', 'cibo-cane-secco', 50, 'Cane'),
  ('pets', 'snack-cane', 60, 'Cane'),
  ('pets', 'igiene-e-lettiere', 70, 'Cura e accessori'),
  ('pets', 'antiparassitari', 80, 'Cura e accessori'),
  ('pets', 'accessori-e-giochi', 90, 'Cura e accessori'),
  ('pets', 'altri-animali', 100, 'Cura e accessori'),
  ('monouso', 'piatti-bicchieri-e-posate', 10, 'Tavola e feste'),
  ('monouso', 'tovaglioli-e-tovaglie', 20, 'Tavola e feste'),
  ('monouso', 'alluminio-pellicola-e-carta-forno', 30, 'Cucina'),
  ('monouso', 'sacchetti-gelo-e-freezer', 40, 'Cucina'),
  ('monouso', 'vaschette-e-contenitori', 50, 'Cucina'),
  ('monouso', 'asciugatutto', 60, 'Carta'),
  ('monouso', 'carta-igienica', 70, 'Carta'),
  ('monouso', 'fazzoletti-e-veline', 80, 'Carta'),
  ('ferramenta', 'materiale-elettrico', 10, null),
  ('ferramenta', 'pile', 20, null),
  ('ferramenta', 'utensili', 30, null),
  ('ferramenta', 'colle', 40, null),
  ('ferramenta', 'auto-e-manutenzione', 50, null)
) as v(dept, slug, sort, section)
join public.categories d on d.slug = v.dept
where c.slug = v.slug and c.parent_id = d.id;

update public.categories set sort = 100 where slug = 'dolciumi' and parent_id is null;

update public.categories c set cover_product_id = p.id
from (values
  ('deodoranti', '136881'),
  ('profumi', '346013'),
  ('colorazione-capelli', '341686'),
  ('labbra', '337910'),
  ('profumeria-igiene-orale', '127490'),
  ('profumatori-auto', '135341'),
  ('trattamenti-capelli', '349206'),
  ('cura-viso', '341703'),
  ('lavastoviglie', '348283'),
  ('insetticidi-e-repellenti', '93397'),
  ('custodie-e-ordine', '338749'),
  ('assorbiumidita', '130304'),
  ('accessori-casa', '345487'),
  ('arredo', '341403')
) as v(slug, sku)
join public.products p on p.sku = v.sku
where c.slug = v.slug;
