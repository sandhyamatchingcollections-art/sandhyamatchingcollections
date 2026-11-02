-- ============================================================================
-- Starting data for the live store. Safe to run once after the migrations.
-- Everything here can be edited later from the admin dashboard.
-- No products are created: the owner adds real products from the admin.
-- ============================================================================

-- Store settings (owner-provided details only; blanks stay hidden on the site)
insert into public.store_settings (id, name, tagline, description, shipping_note, whatsapp, instagram_url, instagram_handle)
values (
  true,
  'Sandhya Matching Collections',
  'One Stop Destination for Ladies Items',
  'Your destination for beautiful ethnic fashion, exquisite sarees, designer materials, jewellery, and everyday essentials — thoughtfully brought together for every occasion.',
  'Shipping all over India',
  '919885949698',
  'https://www.instagram.com/sandhya_matching_collections',
  'sandhya_matching_collections'
)
on conflict (id) do nothing;

-- Starting categories (rename, reorder, hide or add more from the admin)
with roots(name, slug, sort_order) as (values
  ('Fabrics', 'fabrics', 1), ('Sarees', 'sarees', 2), ('Blouses', 'blouses', 3), ('Kurtas', 'kurtas', 4),
  ('Jewellery', 'jewellery', 5), ('Makeup & Beauty', 'makeup-beauty', 6), ('Accessories', 'accessories', 7)
)
insert into public.categories (name, slug, sort_order)
select name, slug, sort_order from roots
on conflict (slug) do nothing;

with kids(parent_slug, name, slug, sort_order) as (values
  ('fabrics', 'Blouse Fabrics', 'blouse-fabrics', 1), ('fabrics', 'Lining Materials', 'lining-materials', 2),
  ('fabrics', 'Cotton Fabrics', 'cotton-fabrics', 3),
  ('sarees', 'Silk Sarees', 'silk-sarees', 1), ('sarees', 'Designer Sarees', 'designer-sarees', 2),
  ('sarees', 'Cotton Sarees', 'cotton-sarees', 3),
  ('blouses', 'Designer Blouses', 'designer-blouses', 1), ('blouses', 'Readymade Blouses', 'readymade-blouses', 2),
  ('jewellery', 'One Gram Gold', 'one-gram-gold', 1), ('jewellery', 'Panchaloha Jewellery', 'panchaloha-jewellery', 2),
  ('jewellery', 'Diamond Replicas', 'diamond-replicas', 3),
  ('accessories', 'Bangles', 'bangles', 1), ('accessories', 'Hair Accessories', 'hair-accessories', 2)
)
insert into public.categories (parent_id, name, slug, sort_order)
select p.id, k.name, k.slug, k.sort_order from kids k join public.categories p on p.slug = k.parent_slug
on conflict (slug) do nothing;

-- Useful filters for fabric and saree categories
insert into public.category_attributes (category_id, key, label, type, options, sort_order)
select c.id, a.key, a.label, a.type::public.attribute_type, a.options::jsonb, a.sort_order
from public.categories c
join (values
  ('fabrics', 'fabric', 'Fabric', 'select', '["Cotton","Silk","Raw Silk","Brocade","Chanderi","Georgette","Crepe"]', 1),
  ('fabrics', 'color', 'Colour', 'color', '[]', 2),
  ('sarees', 'fabric', 'Fabric', 'select', '["Silk","Cotton","Georgette","Chiffon","Organza"]', 1),
  ('sarees', 'color', 'Colour', 'color', '[]', 2),
  ('kurtas', 'size', 'Size', 'select', '["XS","S","M","L","XL","XXL"]', 1)
) as a(cat_slug, key, label, type, options, sort_order) on a.cat_slug = c.slug
on conflict (category_id, key) do nothing;

-- Collections used by the homepage (products are assigned from the admin)
insert into public.collections (slug, title, description, sort_order) values
  ('bridal', 'Bridal Collection', 'Bridal sarees, blouse materials, jewellery and details, chosen for her most beautiful beginning.', 1),
  ('kurtas', 'Kurta Collection', 'Everyday elegance, effortlessly yours.', 2),
  ('premium-picks', 'Premium Picks', 'Handpicked statement pieces.', 3),
  ('bestsellers', 'Bestsellers', 'Customer favourites. Until online orders begin, this list is chosen by the store.', 4)
on conflict (slug) do nothing;

-- Homepage sections (edit text, order and visibility from the admin). Spaced in tens so the
-- Phase 8 sections (banners 15, bridal showcase 25, founder 55) slot in between.
insert into public.homepage_sections (id, type, sort_order, config) values
('hero', 'hero', 10, '{
  "eyebrow": "Sandhya Matching Collections",
  "heading": "Every Woman''s Style, Beautifully Complete.",
  "body": "From exquisite sarees and designer blouse materials to elegant kurtas, statement jewellery, and everyday essentials — discover everything you love, all in one place.",
  "primary": {"label": "Explore Collections", "href": "/c"},
  "secondary": {"label": "Shop Bestsellers", "href": "/collections/bestsellers"},
  "imageUrl": null, "imageAlt": "Woman in an elegant pastel silk saree"
}'),
('budget', 'budget', 20, '{
  "heading": "Beautiful Finds, Every Budget.",
  "body": "Discover something special at a price you''ll love.",
  "ranges": [
    {"key": "under-100", "label": "Under ₹100", "maxPrice": 10000, "tone": "blush", "enabled": true},
    {"key": "under-200", "label": "Under ₹200", "maxPrice": 20000, "tone": "peach", "enabled": true},
    {"key": "under-500", "label": "Under ₹500", "maxPrice": 50000, "tone": "lavender", "enabled": true},
    {"key": "under-1000", "label": "Under ₹1,000", "maxPrice": 100000, "tone": "sage", "enabled": true},
    {"key": "premium-picks", "label": "Premium Picks", "maxPrice": null, "collectionSlug": "premium-picks", "tone": "champagne", "enabled": true}
  ]
}'),
('bridal', 'feature', 30, '{
  "variant": "bridal",
  "heading": "For Her Most Beautiful Beginning.",
  "body": "Celebrate your special moments with exquisite bridal styles, timeless sarees, statement jewellery, and thoughtfully chosen details that make every celebration unforgettable.",
  "cta": {"label": "Explore Bridal Collection", "href": "/collections/bridal"},
  "imageUrl": null, "imageAlt": "Bride in a silk saree with temple jewellery",
  "collectionSlug": "bridal", "imageSide": "left", "tone": "blush"
}'),
('kurtas', 'feature', 40, '{
  "variant": "kurta",
  "heading": "Everyday Elegance, Effortlessly Yours.",
  "body": "From relaxed everyday styles to beautifully detailed ethnic ensembles, find kurtas that bring comfort, confidence, and timeless elegance to every moment.",
  "cta": {"label": "Discover Kurtas", "href": "/c/kurtas"},
  "imageUrl": null, "imageAlt": "Woman in a soft lavender kurta set",
  "collectionSlug": "kurtas", "imageSide": "right", "tone": "lavender"
}'),
('new', 'productRail', 50, '{
  "source": "new-arrivals",
  "heading": "Freshly Arrived, Just for You.",
  "body": "Discover the latest additions to your favourite collections.",
  "cta": {"label": "View All New Arrivals", "href": "/collections/new-arrivals"}, "limit": 8
}'),
('favourites', 'productRail', 60, '{
  "source": "bestsellers",
  "heading": "Customer Favourites",
  "body": "The pieces our customers come back for.",
  "cta": {"label": "Shop Bestsellers", "href": "/collections/bestsellers"}, "limit": 4
}'),
('promo', 'promo', 70, '{
  "heading": "A Little Something Special.",
  "body": "Explore selected styles and discover offers made for your next favourite find.",
  "cta": {"label": "Shop Offers", "href": "/offers"}
}')
on conflict (id) do nothing;
