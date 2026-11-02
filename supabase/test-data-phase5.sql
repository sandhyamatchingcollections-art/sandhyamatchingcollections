-- ============================================================================
-- TEST DATA: sample products for trying everything up to Phase 5.
-- Supabase → SQL Editor → New query → paste everything → Run. Safe to run again
-- (it deletes and re-creates only items whose slug starts with "sample-").
--
-- REMOVE BEFORE LAUNCH:
--   delete from public.products where slug like 'sample-%';
--   delete from public.promotions where title like 'Sample ·%';
-- ============================================================================

create or replace function pg_temp.smc_add(
  p_slug text, p_name text, p_cat text, p_desc text, p_brand text,
  p_days_ago int, p_cols text[], p_attrs jsonb, p_variants jsonb,
  p_featured boolean default false, p_quote boolean default false, p_status text default 'active'
) returns void language plpgsql as $$
declare
  pid uuid; cid uuid; v jsonb; vid uuid; k text; val text; aid uuid; i int := 0;
begin
  select id into cid from public.categories where slug = p_cat;
  if cid is null then raise exception 'Category % not found — run the main setup first', p_cat; end if;

  insert into public.products (slug, name, description, brand, status, is_featured, quote_only, published_at)
  values (p_slug, p_name, p_desc, p_brand, p_status::public.product_status, p_featured, p_quote,
          case when p_status = 'active' then now() - make_interval(days => p_days_ago) end)
  returning id into pid;

  insert into public.product_categories (product_id, category_id, is_primary) values (pid, cid, true);

  insert into public.collection_products (collection_id, product_id)
  select c.id, pid from public.collections c where c.slug = any (p_cols);

  -- Filter values (the filter can be defined on this category or any parent).
  for k, val in select e.key, x.value from jsonb_each(coalesce(p_attrs, '{}')) e, jsonb_array_elements_text(e.value) x loop
    with recursive up as (
      select id, parent_id, 0 as depth from public.categories where id = cid
      union all select c.id, c.parent_id, up.depth + 1 from public.categories c join up on c.id = up.parent_id
    )
    select ca.id into aid from public.category_attributes ca join up on up.id = ca.category_id
    where ca.key = k order by up.depth limit 1;
    if aid is not null then
      insert into public.product_attribute_values (product_id, attribute_id, value) values (pid, aid, val)
      on conflict do nothing;
    end if;
  end loop;

  for v in select * from jsonb_array_elements(p_variants) loop
    insert into public.product_variants (product_id, sku, title, options, price, mrp, unit, min_qty, qty_step, max_qty, is_default, sort_order)
    values (pid, v->>'sku', coalesce(v->>'title', 'Default'), coalesce(v->'options', '{}'),
            (v->>'price')::bigint, (v->>'mrp')::bigint, coalesce(v->>'unit', 'piece')::public.selling_unit,
            coalesce((v->>'min')::numeric, 1), coalesce((v->>'step')::numeric, 1), (v->>'max')::numeric,
            i = 0, i)
    returning id into vid;
    update public.inventory set on_hand = coalesce((v->>'stock')::numeric, 0) where variant_id = vid;
    i := i + 1;
  end loop;
end $$;

delete from public.products where slug like 'sample-%';

-- prices are in paise: 18000 = ₹180
select pg_temp.smc_add('sample-raw-silk-blouse', 'Sample · Raw Silk Blouse Material', 'blouse-fabrics',
  'Rich raw silk with a soft sheen. Perfect for matching blouses. Sold per metre — a blouse usually needs 1 m.', null, 2,
  '{bridal}', '{"fabric":["Raw Silk"],"color":["Maroon","Mustard","Teal"]}',
  '[{"sku":"SMP-RSB-MAROON","title":"Maroon","options":{"color":"Maroon"},"price":18000,"mrp":22000,"unit":"metre","min":1,"step":0.5,"stock":40},
    {"sku":"SMP-RSB-MUSTARD","title":"Mustard","options":{"color":"Mustard"},"price":18000,"mrp":22000,"unit":"metre","min":1,"step":0.5,"stock":2.5},
    {"sku":"SMP-RSB-TEAL","title":"Teal","options":{"color":"Teal"},"price":19500,"mrp":22000,"unit":"metre","min":1,"step":0.5,"stock":0}]', true);

select pg_temp.smc_add('sample-brocade-fabric', 'Sample · Banarasi Brocade Fabric', 'blouse-fabrics',
  'Zari-woven brocade for bridal blouses. Minimum 0.5 m, in 0.25 m steps.', null, 3,
  '{bridal,premium-picks}', '{"fabric":["Brocade"],"color":["Gold","Red"]}',
  '[{"sku":"SMP-BRO-GOLD","title":"Gold","options":{"color":"Gold"},"price":65000,"mrp":75000,"unit":"metre","min":0.5,"step":0.25,"stock":12},
    {"sku":"SMP-BRO-RED","title":"Red","options":{"color":"Red"},"price":65000,"mrp":75000,"unit":"metre","min":0.5,"step":0.25,"stock":8}]');

select pg_temp.smc_add('sample-cotton-lining', 'Sample · Cotton Lining — Ivory', 'lining-materials',
  'Breathable cotton lining for blouses and kurtas.', null, 5,
  '{bestsellers}', '{"fabric":["Cotton"],"color":["Ivory"]}',
  '[{"sku":"SMP-LIN-IVORY","price":6000,"unit":"metre","min":1,"step":0.5,"stock":200}]');

select pg_temp.smc_add('sample-cotton-yard', 'Sample · Printed Cotton (per yard)', 'cotton-fabrics',
  'Block-printed cotton sold by the yard.', null, 7,
  '{}', '{"fabric":["Cotton"],"color":["Indigo"]}',
  '[{"sku":"SMP-CTN-YARD","price":9000,"mrp":11000,"unit":"yard","min":2,"step":1,"stock":30}]');

select pg_temp.smc_add('sample-kanchi-silk', 'Sample · Kanchi Silk Saree', 'silk-sarees',
  'Pure Kanchipuram silk with contrast border and rich pallu. Comes with an unstitched blouse piece.', 'Sandhya Weaves', 4,
  '{bridal,premium-picks}', '{"fabric":["Silk"],"color":["Red","Green"]}',
  '[{"sku":"SMP-KAN-RED","title":"Red","options":{"color":"Red"},"price":680000,"mrp":750000,"stock":3},
    {"sku":"SMP-KAN-GREEN","title":"Green","options":{"color":"Green"},"price":720000,"mrp":750000,"stock":1}]', true);

select pg_temp.smc_add('sample-mul-cotton-saree', 'Sample · Mul Cotton Saree', 'cotton-sarees',
  'Soft, airy mul cotton for everyday comfort.', null, 18,
  '{bestsellers}', '{"fabric":["Cotton"],"color":["Peach"]}',
  '[{"sku":"SMP-MUL-PEACH","price":89000,"stock":8}]');

select pg_temp.smc_add('sample-georgette-saree', 'Sample · Designer Georgette Saree', 'designer-sarees',
  'Lightweight georgette with sequin work. Currently sold out — use it to test out-of-stock display.', null, 6,
  '{}', '{"fabric":["Georgette"],"color":["Lavender"]}',
  '[{"sku":"SMP-GEO-LAV","price":249000,"mrp":299000,"stock":0}]');

select pg_temp.smc_add('sample-designer-blouse', 'Sample · Embroidered Designer Blouse', 'designer-blouses',
  'Hand-embroidered readymade designer blouse with back hooks and margin for alterations.', null, 6,
  '{bridal}', '{}',
  '[{"sku":"SMP-DBL-34","title":"34","options":{"size":"34"},"price":145000,"mrp":180000,"stock":2},
    {"sku":"SMP-DBL-36","title":"36","options":{"size":"36"},"price":145000,"mrp":180000,"stock":4},
    {"sku":"SMP-DBL-38","title":"38","options":{"size":"38"},"price":155000,"mrp":180000,"stock":0}]');

select pg_temp.smc_add('sample-readymade-blouse', 'Sample · Cotton Readymade Blouse', 'readymade-blouses',
  'Everyday cotton blouse, elbow sleeves.', null, 11,
  '{}', '{}',
  '[{"sku":"SMP-RMB-FREE","price":39900,"stock":20}]');

select pg_temp.smc_add('sample-chanderi-kurta', 'Sample · Chanderi Kurta Set', 'kurtas',
  'Chanderi kurta with matching pants and dupatta. Pick your size.', null, 9,
  '{kurtas,bestsellers}', '{"size":["S","M","L","XL"]}',
  '[{"sku":"SMP-CHK-S","title":"S","options":{"size":"S"},"price":129000,"mrp":159000,"unit":"set","stock":3},
    {"sku":"SMP-CHK-M","title":"M","options":{"size":"M"},"price":129000,"mrp":159000,"unit":"set","stock":5},
    {"sku":"SMP-CHK-L","title":"L","options":{"size":"L"},"price":129000,"mrp":159000,"unit":"set","stock":4},
    {"sku":"SMP-CHK-XL","title":"XL","options":{"size":"XL"},"price":139000,"mrp":159000,"unit":"set","stock":0}]', true);

select pg_temp.smc_add('sample-printed-kurta', 'Sample · Printed Cotton Kurta', 'kurtas',
  'Straight-cut cotton kurta with floral print.', null, 12,
  '{kurtas}', '{"size":["M","L"]}',
  '[{"sku":"SMP-PRK-M","title":"M","options":{"size":"M"},"price":69000,"stock":6},
    {"sku":"SMP-PRK-L","title":"L","options":{"size":"L"},"price":69000,"stock":6}]');

select pg_temp.smc_add('sample-anarkali-kurta', 'Sample · Anarkali Kurta (colours)', 'kurtas',
  'Flowy georgette anarkali in two colours.', null, 1,
  '{kurtas}', '{"size":["M"]}',
  '[{"sku":"SMP-ANK-PINK","title":"Pink","options":{"color":"Pink"},"price":99900,"stock":4},
    {"sku":"SMP-ANK-MINT","title":"Mint","options":{"color":"Mint"},"price":109900,"stock":0}]');

select pg_temp.smc_add('sample-gold-haram', 'Sample · One Gram Gold Long Haram', 'one-gram-gold',
  'Temple-design long haram in one gram gold finish.', null, 8,
  '{bridal,premium-picks}', '{}',
  '[{"sku":"SMP-HARAM","price":220000,"stock":5}]');

select pg_temp.smc_add('sample-panchaloha-set', 'Sample · Panchaloha Necklace Set', 'panchaloha-jewellery',
  'Necklace with matching earrings.', null, 15,
  '{}', '{}',
  '[{"sku":"SMP-PANCH","price":185000,"mrp":210000,"stock":2}]');

select pg_temp.smc_add('sample-bridal-ad-set', 'Sample · Bridal AD Choker (made to order)', 'diamond-replicas',
  'Custom bridal choker set. Price depends on design — enquire on WhatsApp. (Tests "Price on request".)', null, 10,
  '{bridal}', '{}',
  '[{"sku":"SMP-ADSET","price":0,"stock":0}]', false, true);

select pg_temp.smc_add('sample-glass-bangles', 'Sample · Glass Bangles (Set of 12)', 'bangles',
  'Colourful glass bangles. Limit 5 sets per order.', null, 10,
  '{bestsellers}', '{}',
  '[{"sku":"SMP-BANG-24","title":"2.4","options":{"size":"2.4"},"price":9500,"mrp":12000,"unit":"set","max":5,"stock":60},
    {"sku":"SMP-BANG-26","title":"2.6","options":{"size":"2.6"},"price":9500,"mrp":12000,"unit":"set","max":5,"stock":40}]');

select pg_temp.smc_add('sample-hair-clips', 'Sample · Pearl Hair Clips (pack of 4)', 'hair-accessories',
  'Pearl clips for everyday and festive looks.', null, 13,
  '{}', '{}',
  '[{"sku":"SMP-CLIPS","price":4900,"mrp":7900,"stock":100}]');

select pg_temp.smc_add('sample-hair-brooch', 'Sample · Kundan Hair Brooch', 'hair-accessories',
  'Kundan brooch for buns and braids.', null, 14,
  '{}', '{}',
  '[{"sku":"SMP-BROOCH","price":15000,"stock":25}]');

select pg_temp.smc_add('sample-kajal', 'Sample · Herbal Kajal', 'makeup-beauty',
  'Smudge-proof herbal kajal.', 'Sandhya Beauty', 16,
  '{}', '{}',
  '[{"sku":"SMP-KAJAL","price":8900,"stock":50}]');

select pg_temp.smc_add('sample-bindi-box', 'Sample · Velvet Bindi Box', 'makeup-beauty',
  'Assorted velvet bindis, 10 sheets.', null, 20,
  '{}', '{}',
  '[{"sku":"SMP-BINDI","price":6500,"stock":0}]');

-- A draft: must NOT appear anywhere on the store.
select pg_temp.smc_add('sample-draft-item', 'Sample · Hidden Draft Item', 'kurtas',
  'This is a draft and should never be visible to shoppers.', null, 0,
  '{kurtas}', '{}',
  '[{"sku":"SMP-DRAFT","price":50000,"stock":10}]', false, false, 'draft');

-- An offer, so the promo banner shows on the homepage.
delete from public.promotions where title like 'Sample ·%';
insert into public.promotions (title, description, is_active)
values ('Sample · Flat 10% off on bridal sets', 'Test offer', true);

-- Delivery estimate and returns note on product pages.
update public.store_settings set delivery_min_days = 3, delivery_max_days = 7,
  returns_note = 'Easy exchange within 7 days on unused items with tags.';

select count(*) as sample_products from public.products where slug like 'sample-%';
