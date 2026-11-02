-- ============================================================================
-- OPTIONAL — sample products so the homepage isn't empty while you test.
-- Every name starts with "Sample ·" and every slug with "sample-".
-- Remove them all before launch with:  delete from public.products where slug like 'sample-%';
-- ============================================================================

with s(slug, name, cat, price, mrp, unit, min_qty, step, stock, days_ago, cols) as (values
  ('sample-raw-silk-blouse', 'Sample · Raw Silk Blouse Material', 'blouse-fabrics', 18000, 22000, 'metre', 1.0, 0.5, 40, 2, '{}'),
  ('sample-kanchi-silk', 'Sample · Kanchi Silk Saree', 'silk-sarees', 680000, 750000, 'piece', 1, 1, 3, 4, '{bridal,premium-picks}'),
  ('sample-cotton-lining', 'Sample · Cotton Lining — Ivory', 'lining-materials', 6000, null, 'metre', 1.0, 0.5, 200, 5, '{bestsellers}'),
  ('sample-designer-blouse', 'Sample · Embroidered Designer Blouse', 'designer-blouses', 145000, 180000, 'piece', 1, 1, 6, 6, '{bridal}'),
  ('sample-gold-haram', 'Sample · One Gram Gold Long Haram', 'one-gram-gold', 220000, null, 'piece', 1, 1, 5, 8, '{bridal,premium-picks}'),
  ('sample-chanderi-kurta', 'Sample · Chanderi Kurta Set', 'kurtas', 129000, 159000, 'set', 1, 1, 10, 9, '{kurtas,bestsellers}'),
  ('sample-glass-bangles', 'Sample · Glass Bangles (Set of 12)', 'bangles', 9500, 12000, 'set', 1, 1, 60, 10, '{bestsellers}'),
  ('sample-printed-kurta', 'Sample · Printed Cotton Kurta', 'kurtas', 69000, null, 'piece', 1, 1, 12, 12, '{kurtas}'),
  ('sample-hair-brooch', 'Sample · Kundan Hair Brooch', 'hair-accessories', 15000, null, 'piece', 1, 1, 25, 14, '{}'),
  ('sample-mul-cotton-saree', 'Sample · Mul Cotton Saree', 'cotton-sarees', 89000, null, 'piece', 1, 1, 8, 18, '{bestsellers}')
),
ins_p as (
  insert into public.products (slug, name, status, published_at)
  select slug, name, 'active', now() - make_interval(days => days_ago) from s
  on conflict (slug) do nothing
  returning id, slug
),
ins_pc as (
  insert into public.product_categories (product_id, category_id, is_primary)
  select p.id, c.id, true from ins_p p join s on s.slug = p.slug join public.categories c on c.slug = s.cat
),
ins_v as (
  insert into public.product_variants (product_id, sku, price, mrp, unit, min_qty, qty_step, is_default)
  select p.id, upper(replace(p.slug, 'sample-', 'SMP-')), s.price, s.mrp, s.unit::public.selling_unit, s.min_qty, s.step, true
  from ins_p p join s on s.slug = p.slug
  returning id, product_id
),
ins_c as (
  insert into public.collection_products (collection_id, product_id)
  select col.id, p.id from ins_p p join s on s.slug = p.slug
  cross join lateral unnest(s.cols::text[]) as cs(col_slug)
  join public.collections col on col.slug = cs.col_slug
)
select count(*) as sample_products_added from ins_v;

-- Stock (inventory rows are created automatically for each variant)
update public.inventory i set on_hand = s.stock
from public.product_variants v
join public.products p on p.id = v.product_id
join (values
  ('sample-raw-silk-blouse', 40), ('sample-kanchi-silk', 3), ('sample-cotton-lining', 200), ('sample-designer-blouse', 6),
  ('sample-gold-haram', 5), ('sample-chanderi-kurta', 10), ('sample-glass-bangles', 60), ('sample-printed-kurta', 12),
  ('sample-hair-brooch', 25), ('sample-mul-cotton-saree', 8)
) as s(slug, stock) on s.slug = p.slug
where i.variant_id = v.id;
