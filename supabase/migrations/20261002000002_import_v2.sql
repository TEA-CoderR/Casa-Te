-- Product import v2: the spreadsheet can now carry everything the storefront shows.
-- New optional keys per row: subcategory (created under the category if missing), color,
-- unit + unit_quantity (pack size for the unit price), highlights ([{icon,label}], max 4),
-- variant_group / variant_title / variant_label, image_urls (array, max 10).
-- Empty cells never clear existing values. Prices, stock and validation rules are unchanged.

create or replace function public.admin_import_products(p_rows jsonb, p_dry_run boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row jsonb;
  v_idx integer := 0;
  v_report jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_updated integer := 0;
  v_failed integer := 0;
  v_cat_id uuid;
  v_cat text;
  v_product_id uuid;
  v_inserted boolean;
  v_store_code text;
  v_qty text;
  v_store_id uuid;
  v_sub text;
  v_parent_id uuid;
  v_parent_slug text;
  v_unit text;
  v_unit_qty numeric;
  v_highlights jsonb;
  v_images jsonb;
  v_url text;
  v_sort integer;
  v_group text;
begin
  if not public.is_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'invalid_rows' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'too_many_rows' using errcode = 'P0001'; end if;

  begin
    perform set_config('app.inventory_reason', 'import', true);
    for v_row in select * from jsonb_array_elements(p_rows) loop
      v_idx := v_idx + 1;
      begin
        v_cat_id := null;
        v_cat := nullif(trim(coalesce(v_row ->> 'category', '')), '');
        v_sub := nullif(trim(coalesce(v_row ->> 'subcategory', '')), '');
        if v_sub is not null and v_cat is null then raise exception 'sottocategoria senza categoria'; end if;
        if v_cat is not null then
          -- Top-level category (created if missing).
          select id, slug into v_parent_id, v_parent_slug from public.categories
          where parent_id is null and (slug = public.slugify(v_cat) or lower(name) = lower(v_cat)) limit 1;
          if v_parent_id is null then
            select id, slug into v_parent_id, v_parent_slug from public.categories
            where slug = public.slugify(v_cat) or lower(name) = lower(v_cat) limit 1;
          end if;
          if v_parent_id is null then
            insert into public.categories (slug, name) values (public.slugify(v_cat), v_cat) returning id, slug into v_parent_id, v_parent_slug;
          end if;
          v_cat_id := v_parent_id;
          -- Subcategory under it (created if missing; slug prefixed by the parent when already taken).
          if v_sub is not null then
            v_cat_id := null;
            select id into v_cat_id from public.categories
            where parent_id = v_parent_id and (lower(name) = lower(v_sub) or slug in (public.slugify(v_sub), v_parent_slug || '-' || public.slugify(v_sub))) limit 1;
            if v_cat_id is null then
              insert into public.categories (slug, name, parent_id, sort)
              values (case when exists (select 1 from public.categories where slug = public.slugify(v_sub))
                           then v_parent_slug || '-' || public.slugify(v_sub) else public.slugify(v_sub) end,
                      v_sub, v_parent_id, (select coalesce(max(sort), 0) + 1 from public.categories where parent_id = v_parent_id))
              returning id into v_cat_id;
            end if;
          end if;
        end if;

        -- Pack size for the unit price: both or neither.
        v_unit := nullif(lower(trim(coalesce(v_row ->> 'unit', ''))), '');
        v_unit_qty := nullif(v_row ->> 'unit_quantity', '')::numeric;
        if (v_unit is null) <> (v_unit_qty is null) then raise exception 'confezione: indica quantità e unità (es. 500 ml)'; end if;
        v_highlights := case when jsonb_typeof(v_row -> 'highlights') = 'array' and jsonb_array_length(v_row -> 'highlights') > 0
                             then v_row -> 'highlights' end;
        v_group := nullif(public.slugify(coalesce(v_row ->> 'variant_group', '')), '');
        if v_group is not null and nullif(trim(coalesce(v_row ->> 'variant_label', '')), '') is null then
          raise exception 'variante: indica il nome della variante';
        end if;

        insert into public.products as pr (sku, slug, name, description, brand, category_id, price_cents,
          compare_at_price_cents, vat_rate, weight_g, barcode, max_per_order, active, featured,
          color, unit, unit_quantity, highlights, variant_group, variant_title, variant_label)
        values (
          trim(v_row ->> 'sku'),
          public.slugify(v_row ->> 'name') || '-' || lower(regexp_replace(trim(v_row ->> 'sku'), '[^A-Za-z0-9]', '', 'g')),
          trim(v_row ->> 'name'),
          nullif(trim(coalesce(v_row ->> 'description', '')), ''),
          nullif(trim(coalesce(v_row ->> 'brand', '')), ''),
          v_cat_id,
          (v_row ->> 'price_cents')::integer,
          nullif(v_row ->> 'compare_at_price_cents', '')::integer,
          coalesce(nullif(v_row ->> 'vat_rate', '')::numeric, 22),
          (v_row ->> 'weight_g')::integer,
          nullif(trim(coalesce(v_row ->> 'barcode', '')), ''),
          coalesce(nullif(v_row ->> 'max_per_order', '')::integer, 99),
          coalesce((v_row ->> 'active')::boolean, true),
          coalesce((v_row ->> 'featured')::boolean, false),
          nullif(trim(coalesce(v_row ->> 'color', '')), ''),
          v_unit, v_unit_qty, coalesce(v_highlights, '[]'::jsonb),
          v_group,
          case when v_group is not null then nullif(trim(coalesce(v_row ->> 'variant_title', '')), '') end,
          case when v_group is not null then nullif(trim(coalesce(v_row ->> 'variant_label', '')), '') end)
        on conflict (sku) do update set
          name = excluded.name, description = coalesce(excluded.description, pr.description),
          brand = coalesce(excluded.brand, pr.brand), category_id = coalesce(excluded.category_id, pr.category_id),
          price_cents = excluded.price_cents, compare_at_price_cents = excluded.compare_at_price_cents,
          vat_rate = excluded.vat_rate, weight_g = excluded.weight_g,
          barcode = coalesce(excluded.barcode, pr.barcode), max_per_order = excluded.max_per_order,
          active = excluded.active, featured = excluded.featured,
          -- Empty cells keep what is already there.
          color = coalesce(excluded.color, pr.color),
          unit = case when excluded.unit is not null then excluded.unit else pr.unit end,
          unit_quantity = case when excluded.unit is not null then excluded.unit_quantity else pr.unit_quantity end,
          highlights = case when v_highlights is not null then excluded.highlights else pr.highlights end,
          variant_group = coalesce(excluded.variant_group, pr.variant_group),
          variant_title = case when excluded.variant_group is not null then excluded.variant_title else pr.variant_title end,
          variant_label = case when excluded.variant_group is not null then excluded.variant_label else pr.variant_label end
        returning pr.id, (pr.xmax = 0) into v_product_id, v_inserted;

        -- Images: image_urls (array, in order) and/or the legacy single image_url. Existing ones are kept.
        v_images := coalesce(case when jsonb_typeof(v_row -> 'image_urls') = 'array' then v_row -> 'image_urls' end, '[]'::jsonb);
        if nullif(trim(coalesce(v_row ->> 'image_url', '')), '') is not null then
          v_images := jsonb_build_array(v_row ->> 'image_url') || v_images;
        end if;
        if jsonb_array_length(v_images) > 10 then raise exception 'troppe immagini (massimo 10)'; end if;
        select coalesce(max(sort), -1) + 1 into v_sort from public.product_images where product_id = v_product_id;
        for v_url in select trim(x) from jsonb_array_elements_text(v_images) x loop
          continue when v_url = '';
          if v_url !~ '^https://' then raise exception 'image_url must start with https://'; end if;
          if not exists (select 1 from public.product_images where product_id = v_product_id and path = v_url) then
            insert into public.product_images (product_id, path, alt, sort) values (v_product_id, v_url, trim(v_row ->> 'name'), v_sort);
            v_sort := v_sort + 1;
          end if;
        end loop;

        if jsonb_typeof(v_row -> 'stock') = 'object' then
          for v_store_code, v_qty in select * from jsonb_each_text(v_row -> 'stock') loop
            select id into v_store_id from public.stores where code = upper(v_store_code);
            if v_store_id is null then raise exception 'unknown store code %', v_store_code; end if;
            if v_qty !~ '^\d+$' then raise exception 'invalid stock for %', v_store_code; end if;
            insert into public.inventory (store_id, product_id, quantity) values (v_store_id, v_product_id, v_qty::integer)
            on conflict (store_id, product_id) do update set quantity = excluded.quantity;
          end loop;
        end if;

        if v_inserted then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
        v_report := v_report || jsonb_build_object('row', v_idx, 'sku', v_row ->> 'sku',
          'result', case when v_inserted then 'created' else 'updated' end);
      exception when others then
        v_failed := v_failed + 1;
        v_report := v_report || jsonb_build_object('row', v_idx, 'sku', v_row ->> 'sku', 'result', 'error', 'error', sqlerrm);
      end;
    end loop;
    perform set_config('app.inventory_reason', '', true);
    if p_dry_run then raise exception 'dry_run_rollback'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback' then raise; end if;
  end;

  return jsonb_build_object('dry_run', p_dry_run, 'created', v_created, 'updated', v_updated,
                            'failed', v_failed, 'rows', v_report);
end $$;

revoke execute on function public.admin_import_products(jsonb, boolean) from public, anon;
grant execute on function public.admin_import_products(jsonb, boolean) to authenticated, service_role;
