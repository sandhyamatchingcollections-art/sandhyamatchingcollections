-- ============================================================================
-- 0007 Shopping (Phase 5): browsing with filters, search, product detail,
-- per-variant availability, related products and saved carts.
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------- storefront card view
-- A product counts as in stock when ANY of its variants can be bought.
-- (New columns are added at the end so existing readers keep working.)
create or replace view public.product_cards as
select
  p.id,
  p.slug,
  p.name,
  p.quote_only,
  p.published_at,
  p.is_featured,
  v.id as variant_id,
  v.price,
  v.mrp,
  v.unit,
  v.min_qty,
  v.qty_step,
  c.name as category_name,
  c.slug as category_slug,
  img.storage_path as image_path,
  coalesce(nullif(img.alt, ''), p.name) as image_alt,
  exists (
    select 1 from public.product_variants x left join public.inventory xi on xi.variant_id = x.id
    where x.product_id = p.id and x.is_active
      and (not x.track_inventory or coalesce(xi.on_hand - xi.reserved, 0) >= x.min_qty)
  ) as in_stock,
  (select count(*) from public.product_variants x where x.product_id = p.id and x.is_active)::int as variant_count,
  (not v.track_inventory or coalesce(i.on_hand - i.reserved, 0) >= v.min_qty) as default_in_stock
from public.products p
join public.product_variants v on v.product_id = p.id and v.is_default and v.is_active
left join public.product_categories pc on pc.product_id = p.id and pc.is_primary
left join public.categories c on c.id = pc.category_id
left join public.inventory i on i.variant_id = v.id
left join lateral (
  select pi.storage_path, pi.alt from public.product_images pi
  where pi.product_id = p.id order by pi.sort_order, pi.created_at limit 1
) img on true
where p.status = 'active' and p.published_at <= now();

grant select on public.product_cards to anon, authenticated;

-- ---------------------------------------------------------------- store settings for delivery
alter table public.store_settings
  add column if not exists delivery_min_days int not null default 4 check (delivery_min_days between 1 and 60),
  add column if not exists delivery_max_days int not null default 8 check (delivery_max_days between 1 and 90),
  add column if not exists returns_note text not null default '';
grant update (delivery_min_days, delivery_max_days, returns_note) on public.store_settings to authenticated;

-- ---------------------------------------------------------------- browse / search / filter
-- The set of products a listing starts from: a category (with subcategories),
-- a collection, a search phrase, or everything.
create or replace function public.listing_base(p_category text, p_collection text, p_q text)
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select pc.id from public.product_cards pc
  where (p_category is null or pc.id in (select public.category_product_ids(p_category)))
    and (p_collection is null or pc.id in (
          select cp.product_id from public.collection_products cp
          join public.collections col on col.id = cp.collection_id
          where col.slug = p_collection and col.is_active))
    and (coalesce(trim(p_q), '') = '' or not exists (
          -- every word must match the name, a category, a SKU or a filter value
          select 1 from regexp_split_to_table(lower(trim(p_q)), '\s+') w
          where w <> '' and not (
            pc.name ilike '%' || w || '%'
            or exists (select 1 from public.product_categories x join public.categories c on c.id = x.category_id
                       where x.product_id = pc.id and c.is_active and c.name ilike '%' || w || '%')
            or exists (select 1 from public.product_variants v where v.product_id = pc.id and v.is_active
                       and (v.sku ilike w || '%' or v.title ilike '%' || w || '%'))
            or exists (select 1 from public.product_attribute_values av where av.product_id = pc.id and av.value ilike '%' || w || '%')
          )));
$$;

create or replace function public.browse_products(
  p_category text default null,
  p_collection text default null,
  p_q text default null,
  p_min bigint default null,          -- paise, inclusive
  p_max bigint default null,          -- paise, inclusive
  p_in_stock boolean default false,
  p_attrs jsonb default '{}'::jsonb,  -- {"fabric": ["Silk","Cotton"], "color": ["Rose"]}
  p_sort text default 'featured',     -- featured | newest | price_asc | price_desc | relevance | collection
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id uuid, slug text, name text, quote_only boolean, published_at timestamptz, variant_id uuid,
  price bigint, mrp bigint, unit public.selling_unit, min_qty numeric, qty_step numeric,
  category_name text, category_slug text, image_path text, image_alt text, in_stock boolean,
  variant_count int, default_in_stock boolean, total bigint
)
language sql stable security definer set search_path = public, extensions as $$
  with base as (select public.listing_base(p_category, p_collection, p_q) as id),
  filtered as (
    select pc.* from public.product_cards pc join base b on b.id = pc.id
    where (p_min is null or pc.price >= p_min)
      and (p_max is null or pc.price <= p_max)
      and (not p_in_stock or pc.in_stock)
      and not exists (
        -- AND across filters, OR within one filter's choices
        select 1 from jsonb_each(coalesce(p_attrs, '{}'::jsonb)) f(k, vals)
        where jsonb_typeof(vals) = 'array' and jsonb_array_length(vals) > 0 and not exists (
          select 1 from public.product_attribute_values av
          join public.category_attributes ca on ca.id = av.attribute_id
          where av.product_id = pc.id and ca.key = f.k
            and av.value in (select jsonb_array_elements_text(vals))))
  )
  select f.id, f.slug, f.name, f.quote_only, f.published_at, f.variant_id, f.price, f.mrp, f.unit, f.min_qty, f.qty_step,
         f.category_name, f.category_slug, f.image_path, f.image_alt, f.in_stock, f.variant_count, f.default_in_stock,
         count(*) over () as total
  from filtered f
  order by
    f.in_stock desc,
    case when p_sort = 'price_asc' then f.price end asc,
    case when p_sort = 'price_desc' then f.price end desc,
    case when p_sort = 'relevance' and coalesce(p_q, '') <> '' then similarity(f.name, p_q) end desc,
    case when p_sort = 'collection' then (
      select cp.sort_order from public.collection_products cp join public.collections col on col.id = cp.collection_id
      where col.slug = p_collection and cp.product_id = f.id) end asc,
    case when p_sort = 'featured' then f.is_featured end desc,
    f.published_at desc, f.id
  limit least(greatest(p_limit, 1), 96) offset greatest(p_offset, 0);
$$;

-- Filters that make sense for a listing: only values that its products actually have.
create or replace function public.listing_facets(p_category text default null, p_collection text default null, p_q text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  with base as (select public.listing_base(p_category, p_collection, p_q) as id),
  cards as (select pc.* from public.product_cards pc join base b on b.id = pc.id),
  vals as (
    select ca.key, min(ca.label) as label, min(ca.type::text) as type, av.value, count(distinct av.product_id) as n
    from cards c
    join public.product_attribute_values av on av.product_id = c.id
    join public.category_attributes ca on ca.id = av.attribute_id and ca.is_filterable
    group by ca.key, av.value
  )
  select jsonb_build_object(
    'count', (select count(*) from cards),
    'price', (select jsonb_build_object('min', min(price), 'max', max(price)) from cards),
    'attributes', coalesce((
      select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'type', type, 'values', vs) order by label)
      from (select key, min(label) as label, min(type) as type,
                   jsonb_agg(jsonb_build_object('value', value, 'count', n) order by value) as vs
            from vals group by key) a), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('slug', category_slug, 'name', category_name, 'count', n) order by n desc, category_name)
      from (select category_slug, category_name, count(*) as n from cards where category_slug is not null
            group by category_slug, category_name) c), '[]'::jsonb)
  );
$$;

-- Header search suggestions: a few products and categories.
create or replace function public.search_suggestions(p_q text)
returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when length(trim(coalesce(p_q, ''))) < 2 then jsonb_build_object('products', '[]'::jsonb, 'categories', '[]'::jsonb)
  else jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'price', price, 'unit', unit, 'image_path', image_path, 'quote_only', quote_only))
      from (select pc.* from public.product_cards pc join public.listing_base(null, null, p_q) b(id) on b.id = pc.id
            order by similarity(pc.name, p_q) desc, pc.in_stock desc limit 6) s), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('slug', slug, 'name', name))
      from (select slug, name from public.categories where is_active and name ilike '%' || trim(p_q) || '%'
            order by depth, sort_order limit 4) c), '[]'::jsonb))
  end;
$$;

-- ---------------------------------------------------------------- product detail
-- Everything the product page needs, in one call. Stock is shown as a number
-- capped at 999 (enough for "only 3 left" and quantity limits, nothing more).
create or replace function public.product_detail(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (
    select * from public.products where slug = p_slug and status = 'active' and published_at <= now()
  ),
  primary_cat as (
    select pc.category_id from public.product_categories pc join p on p.id = pc.product_id where pc.is_primary limit 1
  ),
  crumbs as (
    with recursive up as (
      select c.id, c.parent_id, c.name, c.slug, 0 as lvl from public.categories c join primary_cat pc on pc.category_id = c.id
      union all
      select c.id, c.parent_id, c.name, c.slug, up.lvl + 1 from public.categories c join up on c.id = up.parent_id
    ) select jsonb_agg(jsonb_build_object('name', name, 'slug', slug) order by lvl desc) as j from up
  )
  select case when not exists (select 1 from p) then null else (
    select jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name, 'description', p.description, 'brand', p.brand,
      'quote_only', p.quote_only, 'seo_title', p.seo_title, 'seo_description', p.seo_description,
      'breadcrumbs', coalesce((select j from crumbs), '[]'::jsonb),
      'variants', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id, 'sku', v.sku, 'title', v.title, 'options', v.options, 'price', v.price, 'mrp', v.mrp,
          'unit', v.unit, 'min_qty', v.min_qty, 'qty_step', v.qty_step, 'max_qty', v.max_qty, 'is_default', v.is_default,
          'available', case when v.track_inventory then least(greatest(coalesce(i.on_hand - i.reserved, 0), 0), 999) else null end
        ) order by v.sort_order)
        from public.product_variants v left join public.inventory i on i.variant_id = v.id
        where v.product_id = p.id and v.is_active), '[]'::jsonb),
      'images', coalesce((
        select jsonb_agg(jsonb_build_object('path', storage_path, 'alt', coalesce(nullif(alt, ''), p.name)) order by sort_order, created_at)
        from public.product_images where product_id = p.id), '[]'::jsonb),
      'specs', coalesce((
        select jsonb_agg(jsonb_build_object('label', label, 'values', vals) order by label)
        from (select min(ca.label) as label, jsonb_agg(distinct av.value) as vals
              from public.product_attribute_values av join public.category_attributes ca on ca.id = av.attribute_id
              where av.product_id = p.id group by ca.key) s), '[]'::jsonb)
    ) from p)
  end;
$$;

-- Products sharing a category with this one (most specific first).
create or replace function public.related_products(p_product uuid, p_limit int default 8)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select pc.id from public.product_cards pc
  join public.product_categories x on x.product_id = pc.id
  join public.product_categories mine on mine.category_id = x.category_id and mine.product_id = p_product
  join public.categories c on c.id = x.category_id
  where pc.id <> p_product and pc.in_stock
  group by pc.id, pc.is_featured, pc.published_at
  order by max(c.depth) desc, pc.is_featured desc, pc.published_at desc
  limit least(greatest(p_limit, 1), 24);
$$;

-- ---------------------------------------------------------------- cart
-- Checks a cart against live prices, stock and quantity rules. Never trusts the
-- browser's prices. Returns each line as it can actually be bought.
create or replace function public.quote_cart(p_lines jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ln jsonb;
  v record;
  want numeric;
  qty numeric;
  avail numeric;
  cap numeric;
  status text;
  msg text;
  out_lines jsonb := '[]'::jsonb;
  subtotal bigint := 0;
  seen uuid[] := '{}';
  vid uuid;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 100 then
    raise exception 'Invalid cart' using errcode = '22023';
  end if;
  for ln in select * from jsonb_array_elements(p_lines) loop
    begin
      vid := (ln ->> 'variant_id')::uuid;
      want := (ln ->> 'qty')::numeric;
    exception when others then
      continue;  -- ignore malformed lines
    end;
    if vid = any (seen) then continue; end if;
    seen := seen || vid;

    select vr.id, vr.sku, vr.title, vr.options, vr.price, vr.mrp, vr.unit, vr.min_qty, vr.qty_step, vr.max_qty,
           vr.track_inventory, vr.is_active, p.id as product_id, p.slug, p.name, p.status, p.quote_only, p.published_at,
           greatest(coalesce(i.on_hand - i.reserved, 0), 0) as available,
           (select storage_path from public.product_images pi where pi.product_id = p.id
             order by (pi.variant_id = vr.id) desc nulls last, pi.sort_order limit 1) as image_path
      into v
      from public.product_variants vr
      join public.products p on p.id = vr.product_id
      left join public.inventory i on i.variant_id = vr.id
      where vr.id = vid;

    if not found or not v.is_active or v.status <> 'active' or v.published_at > now() then
      out_lines := out_lines || jsonb_build_object('variant_id', vid, 'status', 'removed', 'qty', 0,
        'message', 'This item is no longer available and was removed.');
      continue;
    end if;
    if v.quote_only then
      out_lines := out_lines || jsonb_build_object('variant_id', vid, 'status', 'removed', 'qty', 0, 'slug', v.slug, 'name', v.name,
        'message', 'This item is sold on request — please enquire on WhatsApp.');
      continue;
    end if;

    status := 'ok'; msg := null;
    -- Snap to the allowed steps: at least the minimum, then whole steps above it.
    if want is null or want < v.min_qty then
      qty := v.min_qty;
    else
      qty := v.min_qty + floor((want - v.min_qty) / v.qty_step) * v.qty_step;
    end if;
    cap := coalesce(v.max_qty, qty);
    if v.track_inventory then
      avail := v.available;
      cap := least(cap, avail);
    end if;
    if qty > cap then
      qty := case when cap < v.min_qty then 0 else v.min_qty + floor((cap - v.min_qty) / v.qty_step) * v.qty_step end;
    end if;

    if qty = 0 then
      status := 'unavailable';
      msg := 'Out of stock right now.';
    elsif want is distinct from qty then
      status := 'adjusted';
      msg := case
        when v.track_inventory and qty = cap and cap = avail then 'Only ' || rtrim(rtrim(avail::text, '0'), '.') || ' available — quantity updated.'
        when v.max_qty is not null and qty = v.max_qty then 'Limited to ' || rtrim(rtrim(v.max_qty::text, '0'), '.') || ' per order.'
        else 'Quantity updated to match how this item is sold.' end;
    end if;

    out_lines := out_lines || jsonb_build_object(
      'variant_id', v.id, 'product_id', v.product_id, 'slug', v.slug, 'name', v.name, 'title', v.title, 'options', v.options,
      'sku', v.sku, 'price', v.price, 'mrp', v.mrp, 'unit', v.unit, 'min_qty', v.min_qty, 'qty_step', v.qty_step,
      'max_qty', v.max_qty, 'available', case when v.track_inventory then least(v.available, 999) else null end,
      'image_path', v.image_path, 'qty', qty, 'line_total', round(v.price * qty)::bigint, 'status', status, 'message', msg);
    subtotal := subtotal + round(v.price * qty)::bigint;
  end loop;
  return jsonb_build_object('lines', out_lines, 'subtotal', subtotal);
end $$;

-- A signed-in customer's saved cart (so it follows them across devices).
create table if not exists public.cart_items (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  qty numeric(12,3) not null check (qty > 0 and qty <= 100000),
  added_at timestamptz not null default now(),
  primary key (user_id, variant_id)
);
alter table public.cart_items enable row level security;
drop policy if exists "cart: own rows" on public.cart_items;
create policy "cart: own rows" on public.cart_items for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Replace the signed-in customer's saved cart in one step.
create or replace function public.save_my_cart(p_lines jsonb)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 100 then
    raise exception 'Invalid cart' using errcode = '22023';
  end if;
  delete from public.cart_items where user_id = auth.uid();
  insert into public.cart_items (user_id, variant_id, qty)
    select auth.uid(), (l ->> 'variant_id')::uuid, (l ->> 'qty')::numeric
    from jsonb_array_elements(p_lines) l
    where (l ->> 'qty')::numeric > 0
      and exists (select 1 from public.product_variants v where v.id = (l ->> 'variant_id')::uuid)
    on conflict (user_id, variant_id) do update set qty = excluded.qty;
end $$;

-- ---------------------------------------------------------------- permissions
grant select, insert, update, delete on public.cart_items to authenticated;
revoke all on public.cart_items from anon;

grant execute on function public.listing_base(text, text, text), public.browse_products(text, text, text, bigint, bigint, boolean, jsonb, text, int, int),
  public.listing_facets(text, text, text), public.search_suggestions(text), public.product_detail(text),
  public.related_products(uuid, int), public.quote_cart(jsonb) to anon, authenticated;
grant execute on function public.save_my_cart(jsonb) to authenticated;
revoke execute on function public.save_my_cart(jsonb) from public, anon;
