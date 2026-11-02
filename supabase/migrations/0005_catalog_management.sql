-- ============================================================================
-- 0005 Catalogue management (Phase 4)
-- Each admin operation is one database function, so it either fully happens or
-- not at all. Functions run with the caller's rights (RLS still applies) and also
-- check the permission up front for a clear message.
-- ============================================================================

create or replace function public.assert_permission(perm text) returns void
language plpgsql stable as $$
begin
  if not public.has_permission(perm) then
    raise exception 'You don''t have permission to do that' using errcode = '42501';
  end if;
end $$;

-- Turn any text into a URL slug: "Silk Sarees & More" -> "silk-sarees-more"
create or replace function public.slugify(t text) returns text
language sql immutable as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(t), '[^a-z0-9]+', '-', 'g')), ''), 'item');
$$;

-- ---------------------------------------------------------------- categories
create or replace function public.category_usage(p_id uuid)
returns table (products int, children int)
language sql stable as $$
  select (select count(*)::int from public.product_categories where category_id = p_id),
         (select count(*)::int from public.categories where parent_id = p_id);
$$;

-- Safe delete: a category with subcategories or products can only be deleted
-- by moving them to another category first (done here in the same transaction).
create or replace function public.delete_category(p_id uuid, p_move_to uuid default null) returns void
language plpgsql as $$
declare
  n_products int;
  n_children int;
  moved uuid[];
  was_primary uuid[];
begin
  perform public.assert_permission('catalog.write');
  select products, children into n_products, n_children from public.category_usage(p_id);

  if p_move_to is null and (n_products > 0 or n_children > 0) then
    raise exception 'This category still has % product(s) and % subcategory(ies). Choose where to move them, or hide the category instead.',
      n_products, n_children using errcode = '23503';
  end if;

  if p_move_to is not null then
    if p_move_to = p_id or exists (
      with recursive down as (
        select id from public.categories where parent_id = p_id
        union all select c.id from public.categories c join down d on c.parent_id = d.id
      ) select 1 from down where id = p_move_to
    ) then
      raise exception 'Choose a category outside the one being deleted' using errcode = '23514';
    end if;

    update public.categories set parent_id = p_move_to where parent_id = p_id;

    -- Move products: remember which had this as primary, remove the old links,
    -- add the target where missing, then restore a primary where one was lost.
    select coalesce(array_agg(product_id), '{}'), coalesce(array_agg(product_id) filter (where is_primary), '{}')
      into moved, was_primary
      from public.product_categories where category_id = p_id;
    delete from public.product_categories where category_id = p_id;
    insert into public.product_categories (product_id, category_id, is_primary)
      select m, p_move_to, false from unnest(moved) m
      on conflict do nothing;
    update public.product_categories pc set is_primary = true
      where pc.category_id = p_move_to and pc.product_id = any (was_primary)
        and not exists (select 1 from public.product_categories x where x.product_id = pc.product_id and x.is_primary);
  end if;

  delete from public.categories where id = p_id;
end $$;

-- Set the order of sibling categories to the order of the ids given.
create or replace function public.reorder_categories(p_ids uuid[]) returns void
language plpgsql as $$
begin
  perform public.assert_permission('catalog.write');
  update public.categories c set sort_order = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
    where c.id = o.id;
end $$;

-- ---------------------------------------------------------------- products
-- Create or update a product with its categories, collections, variants, attribute
-- values and image order in one transaction. Returns the product id.
create or replace function public.save_product(p jsonb) returns uuid
language plpgsql as $$
declare
  pid uuid := nullif(p ->> 'id', '')::uuid;
  v jsonb;
  vid uuid;
  keep_variants uuid[] := '{}';
  first_cat uuid;
  i int := 0;
begin
  perform public.assert_permission('catalog.write');

  if pid is null then
    insert into public.products (slug, name, description, brand, status, is_featured, quote_only, seo_title, seo_description)
    values (p ->> 'slug', p ->> 'name', p ->> 'description', p ->> 'brand',
            coalesce(p ->> 'status', 'draft')::public.product_status,
            coalesce((p ->> 'is_featured')::boolean, false), coalesce((p ->> 'quote_only')::boolean, false),
            p ->> 'seo_title', p ->> 'seo_description')
    returning id into pid;
  else
    update public.products set
      slug = p ->> 'slug', name = p ->> 'name', description = p ->> 'description', brand = p ->> 'brand',
      status = coalesce(p ->> 'status', 'draft')::public.product_status,
      is_featured = coalesce((p ->> 'is_featured')::boolean, false),
      quote_only = coalesce((p ->> 'quote_only')::boolean, false),
      seo_title = p ->> 'seo_title', seo_description = p ->> 'seo_description'
    where id = pid;
    if not found then raise exception 'Product not found' using errcode = 'P0002'; end if;
  end if;

  -- Categories: replace the set; exactly one primary (the flagged one, else the first).
  delete from public.product_categories where product_id = pid;
  insert into public.product_categories (product_id, category_id, is_primary)
    select pid, (c ->> 'id')::uuid, false
    from jsonb_array_elements(coalesce(p -> 'categories', '[]')) c
    on conflict do nothing;
  select (c ->> 'id')::uuid into first_cat
    from jsonb_array_elements(coalesce(p -> 'categories', '[]')) with ordinality as x(c, n)
    order by (c ->> 'primary')::boolean desc nulls last, n limit 1;
  if first_cat is not null then
    update public.product_categories set is_primary = true where product_id = pid and category_id = first_cat;
  end if;

  -- Collections: replace the set, keeping existing positions.
  delete from public.collection_products
    where product_id = pid and collection_id not in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'collections', '[]')) x);
  insert into public.collection_products (collection_id, product_id, sort_order)
    select (x #>> '{}')::uuid, pid,
      coalesce((select max(sort_order) + 1 from public.collection_products cp where cp.collection_id = (x #>> '{}')::uuid), 0)
    from jsonb_array_elements(coalesce(p -> 'collections', '[]')) x
    on conflict do nothing;

  -- Variants: clear the default flag, upsert each, remove ones no longer listed.
  update public.product_variants set is_default = false where product_id = pid;
  for v in select * from jsonb_array_elements(coalesce(p -> 'variants', '[]')) loop
    vid := nullif(v ->> 'id', '')::uuid;
    if vid is null then
      insert into public.product_variants (product_id, sku, title, options, price, mrp, unit, min_qty, qty_step, max_qty,
                                           track_inventory, weight_grams, is_active, sort_order)
      values (pid, v ->> 'sku', coalesce(nullif(v ->> 'title', ''), 'Default'), coalesce(v -> 'options', '{}'),
              (v ->> 'price')::bigint, nullif(v ->> 'mrp', '')::bigint, coalesce(v ->> 'unit', 'piece')::public.selling_unit,
              coalesce((v ->> 'min_qty')::numeric, 1), coalesce((v ->> 'qty_step')::numeric, 1), nullif(v ->> 'max_qty', '')::numeric,
              coalesce((v ->> 'track_inventory')::boolean, true), nullif(v ->> 'weight_grams', '')::int,
              coalesce((v ->> 'is_active')::boolean, true), i)
      returning id into vid;
      if coalesce((v ->> 'initial_stock')::numeric, 0) > 0 then
        perform public.adjust_stock(vid, (v ->> 'initial_stock')::numeric, 'initial', 'Opening stock');
      end if;
    else
      update public.product_variants set
        sku = v ->> 'sku', title = coalesce(nullif(v ->> 'title', ''), 'Default'), options = coalesce(v -> 'options', '{}'),
        price = (v ->> 'price')::bigint, mrp = nullif(v ->> 'mrp', '')::bigint,
        unit = coalesce(v ->> 'unit', 'piece')::public.selling_unit,
        min_qty = coalesce((v ->> 'min_qty')::numeric, 1), qty_step = coalesce((v ->> 'qty_step')::numeric, 1),
        max_qty = nullif(v ->> 'max_qty', '')::numeric, track_inventory = coalesce((v ->> 'track_inventory')::boolean, true),
        weight_grams = nullif(v ->> 'weight_grams', '')::int, is_active = coalesce((v ->> 'is_active')::boolean, true),
        sort_order = i
      where id = vid and product_id = pid;
      if not found then raise exception 'Variant does not belong to this product' using errcode = 'P0002'; end if;
    end if;
    keep_variants := keep_variants || vid;
    i := i + 1;
  end loop;
  if array_length(keep_variants, 1) is null then
    raise exception 'A product needs at least one variant with a price' using errcode = '23514';
  end if;
  delete from public.product_variants where product_id = pid and id <> all (keep_variants);
  update public.product_variants set is_default = true
    where id = (select id from public.product_variants where product_id = pid and is_active order by sort_order limit 1);
  if not exists (select 1 from public.product_variants where product_id = pid and is_default) then
    raise exception 'At least one variant must be active' using errcode = '23514';
  end if;

  -- Attribute values (filters): replace.
  delete from public.product_attribute_values where product_id = pid;
  insert into public.product_attribute_values (product_id, attribute_id, value)
    select pid, (a ->> 'attribute_id')::uuid, trim(val #>> '{}')
    from jsonb_array_elements(coalesce(p -> 'attributes', '[]')) a,
         jsonb_array_elements(coalesce(a -> 'values', '[]')) val
    where trim(val #>> '{}') <> ''
    on conflict do nothing;

  -- Image order and alt text (uploads and deletes are separate calls).
  update public.product_images pi set sort_order = x.n - 1, alt = coalesce(x.img ->> 'alt', pi.alt)
    from jsonb_array_elements(coalesce(p -> 'images', '[]')) with ordinality as x(img, n)
    where pi.id = (x.img ->> 'id')::uuid and pi.product_id = pid;

  return pid;
end $$;

-- Copy a product as a draft (new slug and SKUs). Images point at the same files.
create or replace function public.duplicate_product(p_id uuid) returns uuid
language plpgsql as $$
declare
  src public.products;
  new_id uuid;
  new_slug text;
  n int := 1;
begin
  perform public.assert_permission('catalog.write');
  select * into src from public.products where id = p_id;
  if not found then raise exception 'Product not found' using errcode = 'P0002'; end if;
  loop
    new_slug := src.slug || '-copy' || case when n = 1 then '' else '-' || n end;
    exit when not exists (select 1 from public.products where slug = new_slug);
    n := n + 1;
  end loop;

  insert into public.products (slug, name, description, brand, status, is_featured, quote_only, seo_title, seo_description)
  values (new_slug, src.name || ' (copy)', src.description, src.brand, 'draft', false, src.quote_only, src.seo_title, src.seo_description)
  returning id into new_id;

  insert into public.product_categories (product_id, category_id, is_primary)
    select new_id, category_id, is_primary from public.product_categories where product_id = p_id;
  insert into public.collection_products (collection_id, product_id, sort_order)
    select collection_id, new_id, sort_order from public.collection_products where product_id = p_id;
  insert into public.product_attribute_values (product_id, attribute_id, value)
    select new_id, attribute_id, value from public.product_attribute_values where product_id = p_id;
  insert into public.product_variants (product_id, sku, title, options, price, mrp, unit, min_qty, qty_step, max_qty,
                                       track_inventory, weight_grams, is_default, is_active, sort_order)
    select new_id, left(sku, 30) || '-C' || n || '-' || substr(md5(random()::text), 1, 4), title, options, price, mrp, unit,
           min_qty, qty_step, max_qty, track_inventory, weight_grams, is_default, is_active, sort_order
    from public.product_variants where product_id = p_id;
  insert into public.product_images (product_id, storage_path, alt, sort_order)
    select new_id, storage_path, alt, sort_order from public.product_images where product_id = p_id;
  return new_id;
end $$;

-- Bulk edits from the product list. Returns the number of products changed.
create or replace function public.bulk_update_products(p_ids uuid[], p_action text, p_value text) returns int
language plpgsql as $$
declare
  n int;
  pct numeric;
begin
  perform public.assert_permission('catalog.write');
  case p_action
    when 'status' then
      update public.products set status = p_value::public.product_status where id = any (p_ids);
    when 'add_category' then
      insert into public.product_categories (product_id, category_id, is_primary)
        select id, p_value::uuid, not exists (select 1 from public.product_categories x where x.product_id = p.id and x.is_primary)
        from public.products p where id = any (p_ids)
        on conflict do nothing;
    when 'remove_category' then
      delete from public.product_categories where product_id = any (p_ids) and category_id = p_value::uuid;
      -- give any product that lost its primary a new one
      update public.product_categories pc set is_primary = true
        where pc.product_id = any (p_ids)
          and not exists (select 1 from public.product_categories x where x.product_id = pc.product_id and x.is_primary)
          and pc.category_id = (select min(category_id::text)::uuid from public.product_categories y where y.product_id = pc.product_id);
    when 'price_percent' then
      pct := p_value::numeric;
      if pct <= -90 or pct > 500 then
        raise exception 'Price change must be between -90%% and +500%%' using errcode = '22023';
      end if;
      -- Selling price and MRP move together (rounded to whole rupees) so discounts stay consistent.
      update public.product_variants set
        price = round(price * (1 + pct / 100) / 100) * 100,
        mrp = case when mrp is null then null else greatest(round(mrp * (1 + pct / 100) / 100) * 100, round(price * (1 + pct / 100) / 100) * 100) end
        where product_id = any (p_ids);
    else
      raise exception 'Unknown bulk action %', p_action using errcode = '22023';
  end case;
  select count(*) into n from public.products where id = any (p_ids);
  return n;
end $$;

-- ---------------------------------------------------------------- CSV import
-- One row = one product with one variant. Rows are validated by the app first;
-- this re-checks everything and applies all rows or none.
-- Row keys: sku, name, slug?, category_slug, price, mrp?, unit?, min_qty?, qty_step?, stock?, status?, description?, collections? (array of slugs)
create or replace function public.import_products(p_rows jsonb, p_update_existing boolean default false) returns jsonb
language plpgsql as $$
declare
  r jsonb;
  vid uuid;
  cur_on_hand numeric;
  created int := 0;
  updated int := 0;
  skipped int := 0;
  base_slug text;
  slug_try text;
  n int;
  pid uuid;
begin
  perform public.assert_permission('catalog.write');
  for r in select * from jsonb_array_elements(p_rows) loop
    select v.id into vid from public.product_variants v where lower(v.sku) = lower(r ->> 'sku');
    if vid is not null then
      if not p_update_existing then skipped := skipped + 1; continue; end if;
      update public.product_variants set price = (r ->> 'price')::bigint, mrp = nullif(r ->> 'mrp', '')::bigint where id = vid;
      if nullif(r ->> 'stock', '') is not null then
        select on_hand into cur_on_hand from public.inventory where variant_id = vid;
        if (r ->> 'stock')::numeric <> cur_on_hand then
          perform public.adjust_stock(vid, (r ->> 'stock')::numeric - cur_on_hand, 'import', 'CSV import');
        end if;
      end if;
      updated := updated + 1;
      continue;
    end if;

    base_slug := coalesce(nullif(r ->> 'slug', ''), public.slugify(r ->> 'name'));
    slug_try := base_slug; n := 2;
    while exists (select 1 from public.products where slug = slug_try) loop
      slug_try := base_slug || '-' || n; n := n + 1;
    end loop;

    pid := public.save_product(jsonb_build_object(
      'slug', slug_try, 'name', r ->> 'name', 'description', r ->> 'description',
      'status', coalesce(nullif(r ->> 'status', ''), 'draft'),
      'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'primary', true)), '[]') from public.categories where slug = r ->> 'category_slug'),
      'collections', (select coalesce(jsonb_agg(c.id), '[]') from public.collections c
                      where c.slug in (select jsonb_array_elements_text(coalesce(r -> 'collections', '[]')))),
      'variants', jsonb_build_array(jsonb_build_object(
        'sku', r ->> 'sku', 'price', r ->> 'price', 'mrp', r ->> 'mrp', 'unit', coalesce(nullif(r ->> 'unit', ''), 'piece'),
        'min_qty', coalesce(nullif(r ->> 'min_qty', ''), '1'), 'qty_step', coalesce(nullif(r ->> 'qty_step', ''), '1'),
        'initial_stock', coalesce(nullif(r ->> 'stock', ''), '0')))
    ));
    if not exists (select 1 from public.product_categories where product_id = pid) then
      raise exception 'Row with SKU %: category "%" not found', r ->> 'sku', r ->> 'category_slug' using errcode = '23503';
    end if;
    created := created + 1;
  end loop;
  return jsonb_build_object('created', created, 'updated', updated, 'skipped', skipped);
end $$;

-- ---------------------------------------------------------------- admin read models
-- Staff-only lists. security_invoker = the reader's RLS applies (visitors see nothing).
create or replace view public.admin_products with (security_invoker = true) as
select
  p.id, p.slug, p.name, p.status, p.is_featured, p.updated_at, p.published_at,
  v.price, v.mrp, v.unit, v.sku,
  (select count(*) from public.product_variants x where x.product_id = p.id)::int as variant_count,
  (select sum(i.on_hand - i.reserved) from public.product_variants x join public.inventory i on i.variant_id = x.id
     where x.product_id = p.id and x.track_inventory) as available,
  c.id as category_id, c.name as category_name,
  (select pi.storage_path from public.product_images pi where pi.product_id = p.id order by pi.sort_order limit 1) as image_path
from public.products p
left join public.product_variants v on v.product_id = p.id and v.is_default
left join public.product_categories pc on pc.product_id = p.id and pc.is_primary
left join public.categories c on c.id = pc.category_id;

create or replace view public.admin_stock with (security_invoker = true) as
select
  v.id as variant_id, v.sku, v.title, v.unit, v.track_inventory, v.is_active,
  p.id as product_id, p.name as product_name, p.status,
  i.on_hand, i.reserved, (i.on_hand - i.reserved) as available, i.low_stock_threshold,
  case when not v.track_inventory then 'untracked'
       when i.on_hand - i.reserved <= 0 then 'out'
       when i.on_hand - i.reserved <= i.low_stock_threshold then 'low'
       else 'ok' end as stock_state
from public.product_variants v
join public.products p on p.id = v.product_id
join public.inventory i on i.variant_id = v.id;

-- Only signed-in staff can use these; RLS on the underlying tables decides rows.
revoke all on public.admin_products, public.admin_stock from anon;
revoke execute on function public.save_product(jsonb) from public, anon;
revoke execute on function public.duplicate_product(uuid) from public, anon;
revoke execute on function public.delete_category(uuid, uuid) from public, anon;
revoke execute on function public.reorder_categories(uuid[]) from public, anon;
revoke execute on function public.bulk_update_products(uuid[], text, text) from public, anon;
revoke execute on function public.import_products(jsonb, boolean) from public, anon;
grant execute on function public.save_product(jsonb) to authenticated;
grant execute on function public.duplicate_product(uuid) to authenticated;
grant execute on function public.delete_category(uuid, uuid) to authenticated;
grant execute on function public.reorder_categories(uuid[]) to authenticated;
grant execute on function public.bulk_update_products(uuid[], text, text) to authenticated;
grant execute on function public.import_products(jsonb, boolean) to authenticated;
