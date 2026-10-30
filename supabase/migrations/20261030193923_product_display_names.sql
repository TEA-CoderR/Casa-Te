-- Readable product names for the shop.
-- The ERP descriptions are abbreviated for a till receipt ("Deox AMMORB.CONC.33 Lav.vanigliaeargan", "(Sap)",
-- "Ml.750"). The shop shows a cleaned name; the ERP text is kept in `erp_name` (never overwritten by this
-- function again) so staff can still find the original and the cleaning can be redone.
-- The ERP sync does not touch `name` on existing products; new products are cleaned on insert.

alter table public.products add column if not exists erp_name text;

-- Ordered rewrite rules: pattern (ARE, applied case-insensitively and globally) -> replacement.
create or replace function public.clean_product_name(p_name text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  s text := coalesce(p_name, '');
  r text[];
  rules text[][] := array[
    -- supplier tags and internal prefixes
    array['\s*\((sap|bli|sac|sfu|pla|cav|sca|bl|ita|int)\)\s*$', ''],
    array['^[A-Z][a-z]{1,2}/(?=[A-Za-z0-9])', ''],
    array['^dy_\s*', ''],
    array['^\(componente\)\s*', ''],
    array['''''', '’'],
    array['''', '’'],
    -- a letter glued after a dot: "Lav.vaniglia" -> "Lav. vaniglia" (not decimals, not "d’or.")
    array['\.(?=[A-Za-zÀ-ÿ])', '. '],
    -- units after the number: "750ML", "2 LT.", "200GR", "6 PZ."
    array['(\d)\s*ml\M\.?', '\1 ml '],
    array['(\d)\s*lt\M\.?', '\1 l '],
    array['(\d)\s*gr\M\.?', '\1 g '],
    array['(\d)\s*kg\M\.?', '\1 kg '],
    array['(\d)\s*cm\M\.?', '\1 cm '],
    array['(\d)\s*mt\M\.?', '\1 m '],
    array['(\d)\s*pz\M\.?', '\1 pz '],
    -- units before the number: "Ml.750", "Lt 2", "Gr.200", "Cm.30x45", "Mt.10", "Pz.6", "Kg.5"
    array['(?<!\d\s)\mml\.?\s*(\d{1,4}(?:[.,]\d+)?)(?![A-Za-z0-9])', '\1 ml'],
    array['(?<!\d\s)\mlt\.?\s*(\d{1,4}(?:[.,]\d+)?)(?![A-Za-z0-9])', '\1 l'],
    array['(?<!\d\s)\mgr\.?\s*(\d{1,4}(?:[.,]\d+)?)(?![A-Za-z0-9])', '\1 g'],
    array['(?<!\d\s)\mkg\.?\s*(\d{1,4}(?:[.,]\d+)?)(?![A-Za-z0-9])', '\1 kg'],
    array['(?<!\d\s)\mcm\.?\s*(\d{1,4}(?:[.,]\d+)?(?:\s*[x*]\s*\d{1,4}(?:[.,]\d+)?)*)(?![A-Za-z0-9])', '\1 cm'],
    array['(?<!\d\s)\mmt\.?\s*(\d{1,4}(?:[.,]\d+)?)(?![A-Za-z0-9])', '\1 m'],
    array['(?<!\d\s)\mpz\.?\s*(\d{1,4})(?![A-Za-z0-9])', '\1 pz'],
    -- an abbreviation glued to a number: "BALS.200" -> "BALS. 200"
    array['([A-Za-z]{2,})\.(?=\d)', '\1. '],
    array['(\d+)\s*lav\M\.?', '\1 lavaggi'],
    array['(\d+)\s*mis\M\.?', '\1 misurini'],
    array['(\d+)\s*tz\M\.?', '\1 tazze'],
    array['\mdia\.?\s*(\d)', 'Ø \1'],
    -- a unit left without its number ("Spray Ml.") is dropped
    array['\s(ml|lt|gr)\.\s*$', ''],
    -- brands and lines
    array['\mtes\.\s*or\.', 'Tesori d’Oriente'],
    array['\mtesori\s+d’\s*or\.', 'Tesori d’Oriente'],
    array['\mchantecl\.|\mchante\s+cl\.|\mchant\.', 'Chanteclair'],
    array['\mnaturav\.', 'Naturaverde'],
    array['\mgarn\.', 'Garnier'],
    array['\mbiop\.', 'Biopoint'],
    array['\mdr\.\s*beck\.', 'Dr. Beckmann'],
    array['\mfelce\s+azz\.', 'Felce Azzurra'],
    array['\momino\s+b\.', 'Omino Bianco'],
    array['\ms\.\s*di\s+sciamp\.', 'Spuma di Sciampagna'],
    array['\mprovenz\.', 'Provenzali'],
    array['\mm\.\s*lindo\M', 'Mastro Lindo'],
    -- abbreviated words (only unambiguous ones)
    array['\mbals\.', 'balsamo'],
    array['\mmasch\.\s*cap\.', 'maschera capelli'],
    array['\mmasch\.', 'maschera'],
    array['^sh\.\s*', 'Shampoo '],
    array['\msh\.(?=\s)', 'shampoo'],
    array['\mammorbid\.|\mammorb\.', 'ammorbidente'],
    array['\mliq\.', 'liquido'],
    array['\mpavim\.|\mpavi\.|\mpav\.', 'pavimenti'],
    array['\msgrass\.|\msgr\.', 'sgrassatore'],
    array['\mricar\.|\mric\.', 'ricarica'],
    array['\mconc\.', 'concentrato'],
    array['\msap\.', 'sapone'],
    array['\mc\.\s*igien\.', 'carta igienica'],
    array['\migienizz\.|\migieniz\.|\migien\.', 'igienizzante'],
    array['\mdisinfett\.|\mdisinfet\.|\mdisinf\.', 'disinfettante'],
    array['\mdeterg\.|\mdeter\.', 'detergente'],
    array['\mbicch\.', 'bicchieri'],
    array['\mcandegg\.|\mcandeg\.', 'candeggina'],
    array['\mbagnodoc\.', 'bagnodoccia'],
    array['\mbagnosch\.', 'bagnoschiuma'],
    array['\mdentif\.', 'dentifricio'],
    array['\mstrucc\.|\mstruc\.', 'struccante'],
    array['\midrat\.', 'idratante'],
    array['\mnutr\.', 'nutriente'],
    array['\mass\.(?=\s|$)', 'assortiti'],
    array['\mrett\.', 'rettangolare'],
    array['\mplaf\.', 'plafoniera'],
    array['\mapplv\.|\mappl\.', 'applique'],
    array['\msosp\.', 'sospensione'],
    array['\mportal\.', 'portalampada'],
    array['\mmultip\.', 'multipresa'],
    array['\madatt\.', 'adattatore'],
    array['\mavv\.', 'avvolgicavo'],
    array['\mprol\.', 'prolunga'],
    array['\mombr\.', 'ombrello'],
    array['\mpannol\.', 'pannolini'],
    array['\mfazz\.', 'fazzoletti'],
    array['\mcrocc\.|\mcroc\.', 'crocchette'],
    array['\malim\.', 'alimento'],
    array['\mlavast\.', 'lavastoviglie'],
    array['\mlavat\.', 'lavatrice'],
    array['\mlav\.', 'lavatrice'],
    array['\mtrigg\.|\mtrig\.', 'trigger'],
    array['\mplast\.', 'plastica'],
    array['\mtraspa\.|\mtrasp\.', 'trasparente'],
    array['\muniv\.', 'universale'],
    array['\mautom\.', 'automatico'],
    array['\melett\.', 'elettrico'],
    array['\mclass\.|\mclas\.', 'classico'],
    array['\mfresch\.', 'freschezza'],
    array['\mmusch\.', 'muschio'],
    array['\mbianch\.|\mbian\.', 'bianco'],
    array['\mintens\.', 'intenso'],
    array['\mantibatt\.', 'antibatterico'],
    array['\mpolv\.', 'polvere'],
    array['\mtratt\.|\mtrat\.', 'trattamento'],
    array['\mmicell\.|\mmicel\.', 'micellare'],
    array['\mallum\.', 'alluminio'],
    array['\mpiegh\.', 'pieghevole'],
    array['\mcherat\.', 'cheratina'],
    array['\mcp\.(?=\s)', 'coppia'],
    array['\mdeo\s+amb\.', 'deodorante ambiente'],
    array['\mcol\.(?=\s|$)', 'colori'],
    array['\mmod\.(?=\s)', 'modello'],
    -- tidy
    array['\s+([,;)])', '\1'],
    array['\(\s+', '('],
    array['\s{2,}', ' '],
    array['\s+$', '']
  ];
  w text;
  out text := '';
begin
  foreach r slice 1 in array rules loop
    s := regexp_replace(s, r[1], r[2], 'gi');
  end loop;
  -- Words in capitals (4+ letters, no digits) get a capital initial only; acronyms and short codes stay as they are.
  for w in select unnest(regexp_split_to_array(s, ' ')) loop
    if w ~ '^[A-ZÀ-Ý]{4,}[.,]?$' and w !~ '^(LED|USB|WC|PVC|ABS|TNT|BIO|XXL|HACCP|EVA|INOX|DVD)[.,]?$' then
      w := initcap(lower(w));
    end if;
    out := out || case when out = '' then '' else ' ' end || w;
  end loop;
  s := btrim(out);
  -- A trailing dot of an abbreviation left alone is dropped; the first letter is a capital.
  s := regexp_replace(s, '\s*\.$', '');
  if s = '' then return p_name; end if;
  return upper(left(s, 1)) || substr(s, 2);
end $$;

grant execute on function public.clean_product_name(text) to service_role;
revoke execute on function public.clean_product_name(text) from public, anon, authenticated;

-- Keep the ERP text once, then show the cleaned name.
update public.products set erp_name = name where erp_name is null;
update public.products set name = left(public.clean_product_name(erp_name), 200)
 where name is distinct from left(public.clean_product_name(erp_name), 200);

comment on column public.products.erp_name is 'Product name as imported from the ERP (before clean_product_name); staff edit `name`.';

-- New products (ERP sync, imports, admin) get the same cleaning; later edits of `name` are left alone.
-- Security definer: staff inserting through the admin cannot execute clean_product_name directly.
create or replace function public.products_clean_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.erp_name is null then new.erp_name := new.name; end if;
  new.name := left(public.clean_product_name(new.name), 200);
  return new;
end $$;

drop trigger if exists products_clean_name on public.products;
create trigger products_clean_name before insert on public.products
  for each row execute function public.products_clean_name();

