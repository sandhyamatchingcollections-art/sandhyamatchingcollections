-- ============================================================================
-- PHASE 8: run this once (homepage editor sections, banners, pages, SEO, reviews, customers, dashboard).
-- Needed if your database was set up before Phase 8. Run the Phase 6 and 7 files first if you haven't.
-- Supabase → SQL Editor → New query → paste everything → Run. Safe to run again.
-- ============================================================================

-- >>>>>>>>>> migrations/0010_content.sql
-- ============================================================================
-- 0010 Store content, banners, reviews, customers, dashboard (Phase 8)
-- ============================================================================

-- ---------------------------------------------------------------- homepage: new section types
alter table public.homepage_sections drop constraint if exists homepage_sections_type_check;
alter table public.homepage_sections add constraint homepage_sections_type_check
  check (type in ('hero', 'budget', 'feature', 'productRail', 'promo', 'banners', 'bridalShowcase', 'owner'));

insert into public.homepage_sections (id, type, sort_order, config) values
('banners', 'banners', 15, '{"intervalSeconds": 6}'),
('bridal-showcase', 'bridalShowcase', 25, '{
  "eyebrow": "The Complete Bridal Edit",
  "heading": "Everything She Needs, Under One Roof.",
  "body": "From the first silk drape to the last bangle — every detail of the bridal look, matched with care by people who have dressed brides for years.",
  "imageUrl": null, "imageAlt": "Bride in a red silk saree with gold temple jewellery",
  "cta": {"label": "Explore the Bridal Collection", "href": "/collections/bridal"},
  "items": [
    {"label": "Bridal Silk Sarees", "note": "Kanchipuram, Banarasi & more", "href": "/c/silk-sarees"},
    {"label": "Designer Blouses", "note": "Embroidered, ready to wear", "href": "/c/designer-blouses"},
    {"label": "Blouse Fabrics", "note": "Raw silk, brocade, matching shades", "href": "/c/blouse-fabrics"},
    {"label": "Bridal Jewellery", "note": "One gram gold & temple sets", "href": "/c/jewellery"},
    {"label": "Bangles", "note": "Glass, silk thread & gold-finish", "href": "/c/bangles"},
    {"label": "Hair Accessories", "note": "Jada, brooches & pins", "href": "/c/hair-accessories"},
    {"label": "Makeup & Beauty", "note": "For the big day and after", "href": "/c/makeup-beauty"},
    {"label": "Lining & Finishing", "note": "The details that make the fit", "href": "/c/lining-materials"}
  ]
}'),
('owner', 'owner', 55, '{
  "eyebrow": "Meet the Founder",
  "heading": "A Matching Centre Built on Trust.",
  "name": "",
  "role": "Founder, Sandhya Matching Collections",
  "quote": "Every woman deserves to find the perfect match — the right shade, the right fabric, the right finishing touch.",
  "body": "What began as a small matching centre has grown into a one-stop destination for sarees, blouse materials, jewellery and everyday essentials. Every piece is chosen by hand, and every customer is welcomed like family — in the store and now online, shipping all over India.",
  "imageUrl": null, "imageAlt": "Founder of Sandhya Matching Collections"
}')
on conflict (id) do nothing;

-- Space out the order so new sections slot in between (only rows still on their original numbers).
update public.homepage_sections h set sort_order = v.n
from (values ('hero', 1, 10), ('budget', 2, 20), ('bridal', 3, 30), ('kurtas', 4, 40), ('new', 5, 50), ('favourites', 6, 60), ('promo', 7, 70)) as v(id, old_n, n)
where h.id = v.id and h.sort_order = v.old_n;

create or replace function public.reorder_home_sections(p_ids text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('content.write') then raise exception 'You don''t have permission to edit the homepage.' using errcode = '42501'; end if;
  update public.homepage_sections h set sort_order = x.ord * 10
  from unnest(p_ids) with ordinality as x(id, ord) where h.id = x.id;
end $$;

-- ---------------------------------------------------------------- banners
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text check (char_length(title) <= 80),
  subtitle text check (char_length(subtitle) <= 160),
  cta_label text check (char_length(cta_label) <= 30),
  link text check (link is null or link ~ '^/[A-Za-z0-9\-_/?=&.%]*$'),
  image_url text not null check (image_url ~ '^https?://'),
  mobile_image_url text check (mobile_image_url is null or mobile_image_url ~ '^https?://'),
  alt text not null default '' check (char_length(alt) <= 160),
  text_color text not null default 'dark' check (text_color in ('dark', 'light')),
  sort_order int not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banners_window check (ends_at is null or ends_at > starts_at)
);
drop trigger if exists banners_touch on public.banners;
create trigger banners_touch before update on public.banners for each row execute function public.touch_updated_at();
alter table public.banners enable row level security;
drop policy if exists "banners: read live" on public.banners;
create policy "banners: read live" on public.banners for select
  using ((is_active and starts_at <= now() and (ends_at is null or ends_at > now())) or public.has_permission('content.write'));
drop policy if exists "banners: write" on public.banners;
create policy "banners: write" on public.banners for all
  using (public.has_permission('content.write')) with check (public.has_permission('content.write'));

-- ---------------------------------------------------------------- pages (FAQ, policies…)
create table if not exists public.content_pages (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  title text not null check (char_length(title) between 2 and 80),
  body text not null default '' check (char_length(body) <= 50000),
  is_published boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
drop trigger if exists content_pages_touch on public.content_pages;
create trigger content_pages_touch before update on public.content_pages for each row execute function public.touch_updated_at();
alter table public.content_pages enable row level security;
drop policy if exists "pages: read published" on public.content_pages;
create policy "pages: read published" on public.content_pages for select using (is_published or public.has_permission('content.write'));
drop policy if exists "pages: write" on public.content_pages;
create policy "pages: write" on public.content_pages for update
  using (public.has_permission('content.write')) with check (public.has_permission('content.write'));

-- Starter drafts. They stay hidden until the owner reviews, edits and publishes them.
insert into public.content_pages (slug, title, sort_order, body) values
('contact', 'Contact Us', 1, 'We''d love to help you find the right saree, fabric or finishing touch.

## Visit us
Add your shop address and opening hours here.

## Message us
WhatsApp and Instagram details below are filled in automatically from your store settings.'),
('faq', 'Frequently Asked Questions', 2, '## Do you ship all over India?
Yes. We ship to every PIN code served by our courier partners. Check delivery time on any product page.

## How long does delivery take?
Usually 4–8 working days after your order is confirmed. You will get your tracking details by email when it ships.

## Can I pay Cash on Delivery?
Yes, for orders up to the limit shown at checkout.

## Can you match a blouse fabric to my saree?
Yes. Message us on WhatsApp with a photo of your saree and we will suggest matching shades.

## How do I track my order?
Open the order link from your confirmation email, or sign in and go to My Orders.'),
('shipping-policy', 'Shipping Policy', 3, '## Where we ship
We ship across India.

## Charges
Shipping charges are shown at checkout before you pay. Orders above the free-shipping amount ship free.

## Dispatch and delivery
Orders are usually dispatched within 1–2 working days and delivered within 4–8 working days. Remote locations may take longer.

## Tracking
We email your courier and tracking number when your order ships.'),
('return-refund-policy', 'Return and Refund Policy', 4, '## Exchanges and returns
Write your exchange/return window here (for example: unused items with tags within 7 days of delivery).

## Items that can''t be returned
List items such as cut fabric, customised or stitched pieces, innerwear and cosmetics.

## Refunds
Approved refunds go back to the original payment method within 5–7 working days. Cash on Delivery refunds are paid by UPI or bank transfer.

## How to request
Message us on WhatsApp with your order number and photos within the return window.'),
('privacy-policy', 'Privacy Policy', 5, '## What we collect
Your name, phone number, email and delivery address when you place an order or create an account.

## How we use it
Only to process and deliver your orders, send order updates and answer your questions. We do not sell your details.

## Payments
Online payments are processed securely by Razorpay. We never see or store your card details.

## Your choices
Contact us to see, correct or delete your details.'),
('terms', 'Terms and Conditions', 6, '## Orders
An order is confirmed once payment is received (online) or once we confirm it (Cash on Delivery).

## Prices
All prices are in Indian Rupees and include GST. Colours may vary slightly from photos because of screen settings and lighting.

## Contact
For any questions, message us on WhatsApp.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- store settings & SEO
alter table public.store_settings
  add column if not exists announcement text check (char_length(announcement) <= 140),
  add column if not exists seo_title text check (char_length(seo_title) <= 70),
  add column if not exists seo_description text check (char_length(seo_description) <= 170),
  add column if not exists og_image_url text check (og_image_url is null or og_image_url ~ '^https?://');

create or replace function public.update_store_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('settings.store') then raise exception 'You don''t have permission to change store settings.' using errcode = '42501'; end if;
  update public.store_settings set
    name = trim(p ->> 'name'),
    tagline = coalesce(trim(p ->> 'tagline'), ''),
    description = coalesce(trim(p ->> 'description'), ''),
    announcement = nullif(trim(coalesce(p ->> 'announcement', '')), ''),
    shipping_note = coalesce(trim(p ->> 'shipping_note'), ''),
    returns_note = coalesce(trim(p ->> 'returns_note'), ''),
    whatsapp = nullif(regexp_replace(coalesce(p ->> 'whatsapp', ''), '\D', '', 'g'), ''),
    instagram_url = nullif(trim(coalesce(p ->> 'instagram_url', '')), ''),
    instagram_handle = nullif(trim(coalesce(p ->> 'instagram_handle', '')), ''),
    facebook_url = nullif(trim(coalesce(p ->> 'facebook_url', '')), ''),
    email = nullif(lower(trim(coalesce(p ->> 'email', ''))), ''),
    phone = nullif(trim(coalesce(p ->> 'phone', '')), ''),
    address = nullif(trim(coalesce(p ->> 'address', '')), ''),
    new_arrival_days = coalesce((p ->> 'new_arrival_days')::int, new_arrival_days);
end $$;

create or replace function public.update_seo_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('content.write') then raise exception 'You don''t have permission to change SEO settings.' using errcode = '42501'; end if;
  update public.store_settings set
    seo_title = nullif(trim(coalesce(p ->> 'seo_title', '')), ''),
    seo_description = nullif(trim(coalesce(p ->> 'seo_description', '')), ''),
    og_image_url = nullif(trim(coalesce(p ->> 'og_image_url', '')), '');
end $$;

-- ---------------------------------------------------------------- reviews
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 2 and 60),
  rating smallint not null check (rating between 1 and 5),
  title text check (char_length(title) <= 100),
  body text check (char_length(body) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index if not exists product_reviews_product_idx on public.product_reviews (product_id, status, created_at desc);
drop trigger if exists product_reviews_touch on public.product_reviews;
create trigger product_reviews_touch before update on public.product_reviews for each row execute function public.touch_updated_at();
alter table public.product_reviews enable row level security;
drop policy if exists "reviews: read approved" on public.product_reviews;
create policy "reviews: read approved" on public.product_reviews for select
  using (status = 'approved' or public.has_permission('catalog.write'));
-- Writes only through submit_review / set_review_status.

-- Customers who received the product can review it (one review each; editing sends it back for approval).
create or replace function public.submit_review(p_product uuid, p_rating int, p_title text, p_body text, p_name text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in to write a review.' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.order_items i join public.orders o on o.id = i.order_id
    where i.product_id = p_product and o.user_id = auth.uid() and o.status = 'delivered') then
    raise exception 'You can review products you''ve bought once they''re delivered.' using errcode = '22023';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5 stars.' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter your name.' using errcode = '22023'; end if;
  insert into public.product_reviews (product_id, user_id, author_name, rating, title, body, verified)
  values (p_product, auth.uid(), left(trim(p_name), 60), p_rating, nullif(left(trim(coalesce(p_title, '')), 100), ''), nullif(left(trim(coalesce(p_body, '')), 2000), ''), true)
  on conflict (product_id, user_id) do update set author_name = excluded.author_name, rating = excluded.rating,
    title = excluded.title, body = excluded.body, status = 'pending';
  return 'pending';
end $$;

-- What the signed-in shopper may do on this product page.
create or replace function public.my_review(p_product uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'can_review', auth.uid() is not null and exists (
      select 1 from public.order_items i join public.orders o on o.id = i.order_id
      where i.product_id = p_product and o.user_id = auth.uid() and o.status = 'delivered'),
    'review', (select jsonb_build_object('rating', rating, 'title', title, 'body', body, 'author_name', author_name, 'status', status)
               from public.product_reviews where product_id = p_product and user_id = auth.uid()));
$$;

create or replace function public.product_rating(p_product uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('average', round(avg(rating)::numeric, 1), 'count', count(*),
    'stars', jsonb_build_object('5', count(*) filter (where rating = 5), '4', count(*) filter (where rating = 4),
      '3', count(*) filter (where rating = 3), '2', count(*) filter (where rating = 2), '1', count(*) filter (where rating = 1)))
  from public.product_reviews where product_id = p_product and status = 'approved';
$$;

create or replace function public.set_review_status(p_review uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('catalog.write') then raise exception 'You don''t have permission to moderate reviews.' using errcode = '42501'; end if;
  if p_status not in ('approved', 'hidden', 'pending') then raise exception 'Unknown status.' using errcode = '22023'; end if;
  update public.product_reviews set status = p_status where id = p_review;
end $$;

-- ---------------------------------------------------------------- customers
create or replace function public.admin_customers(p_q text default null, p_limit int default 25, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not public.has_permission('customers.read') then raise exception 'You don''t have permission to view customers.' using errcode = '42501'; end if;
  return (
    with c as (
      select phone,
        (array_agg(customer_name order by created_at desc))[1] as name,
        (array_agg(email order by created_at desc))[1] as email,
        count(*) filter (where status <> 'cancelled') as orders,
        coalesce(sum(total) filter (where status <> 'cancelled'), 0) - coalesce(sum(refunded_amount), 0) as spent,
        max(created_at) as last_order_at, min(created_at) as first_order_at,
        bool_or(user_id is not null) as has_account,
        (array_agg(shipping_address ->> 'city' order by created_at desc))[1] as city
      from public.orders where status <> 'pending_payment'
      group by phone
    ), f as (
      select * from c where q is null or phone like '%' || regexp_replace(q, '\D', '', 'g') || '%' and regexp_replace(q, '\D', '', 'g') <> ''
        or name ilike '%' || q || '%' or email ilike '%' || q || '%'
    )
    select jsonb_build_object(
      'total', (select count(*) from f),
      'rows', coalesce((select jsonb_agg(x) from (select * from f order by last_order_at desc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) x), '[]'))
  );
end $$;

-- ---------------------------------------------------------------- dashboard
-- One call for the admin home. Each block appears only if the viewer's role allows it.
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb := '{}'::jsonb; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_staff() then raise exception 'Staff only.' using errcode = '42501'; end if;
  if public.has_permission('orders.write') then
    r := r || jsonb_build_object('orders', jsonb_build_object(
      'to_confirm', (select count(*) from public.orders where status = 'placed'),
      'to_ship', (select count(*) from public.orders where status in ('confirmed', 'packed')),
      'on_hold', (select count(*) from public.orders where status = 'on_hold'),
      'awaiting_payment', (select count(*) from public.orders where status = 'pending_payment'),
      'recent', coalesce((select jsonb_agg(x) from (select order_number, customer_name, total, status, payment_method, created_at
                 from public.orders order by created_at desc limit 8) x), '[]')));
  end if;
  if public.has_permission('reports.view') then
    r := r || jsonb_build_object('sales', (
      select jsonb_build_object(
        'today', coalesce(sum(total) filter (where (created_at at time zone 'Asia/Kolkata')::date = today), 0),
        'today_orders', count(*) filter (where (created_at at time zone 'Asia/Kolkata')::date = today),
        'week', coalesce(sum(total) filter (where (created_at at time zone 'Asia/Kolkata')::date > today - 7), 0),
        'week_orders', count(*) filter (where (created_at at time zone 'Asia/Kolkata')::date > today - 7),
        'month', coalesce(sum(total) filter (where (created_at at time zone 'Asia/Kolkata')::date > today - 30), 0),
        'month_orders', count(*) filter (where (created_at at time zone 'Asia/Kolkata')::date > today - 30))
      from public.orders where status not in ('cancelled', 'pending_payment')));
  end if;
  if public.has_permission('inventory.write') then
    r := r || jsonb_build_object('stock', jsonb_build_object(
      'low', (select count(*) from public.inventory i join public.product_variants v on v.id = i.variant_id
              where v.track_inventory and v.is_active and i.on_hand - i.reserved > 0 and i.on_hand - i.reserved <= i.low_stock_threshold),
      'out', (select count(*) from public.inventory i join public.product_variants v on v.id = i.variant_id
              where v.track_inventory and v.is_active and i.on_hand - i.reserved <= 0)));
  end if;
  if public.has_permission('catalog.write') then
    r := r || jsonb_build_object('catalog', jsonb_build_object(
      'live', (select count(*) from public.products where status = 'active'),
      'draft', (select count(*) from public.products where status = 'draft'),
      'reviews_pending', (select count(*) from public.product_reviews where status = 'pending')));
  end if;
  if public.has_permission('customers.read') then
    r := r || jsonb_build_object('customers', (select count(distinct phone) from public.orders where status not in ('pending_payment', 'cancelled')));
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------- audit more of the store's settings
drop trigger if exists audit_coupons on public.coupons;
create trigger audit_coupons after insert or update or delete on public.coupons for each row execute function public.audit_row();
drop trigger if exists audit_banners on public.banners;
create trigger audit_banners after insert or update or delete on public.banners for each row execute function public.audit_row();
drop trigger if exists audit_refunds on public.refunds;
create trigger audit_refunds after insert on public.refunds for each row execute function public.audit_row();
drop trigger if exists audit_reviews on public.product_reviews;
create trigger audit_reviews after update of status on public.product_reviews for each row execute function public.audit_row();

-- content_pages has no id column: record the slug
create or replace function public.audit_page() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), lower(tg_op), 'content_pages', new.slug, to_jsonb(old), to_jsonb(new));
  return new;
end $$;
drop trigger if exists audit_content_pages on public.content_pages;
create trigger audit_content_pages after update on public.content_pages for each row execute function public.audit_page();

-- ---------------------------------------------------------------- grants
grant select on public.banners, public.content_pages to anon, authenticated;
grant insert, update, delete on public.banners to authenticated;
grant update (title, body, is_published) on public.content_pages to authenticated;
-- Reviews: everything except who wrote them (user_id stays private).
grant select (id, product_id, author_name, rating, title, body, status, verified, created_at) on public.product_reviews to anon, authenticated;
grant execute on function public.product_rating(uuid), public.my_review(uuid) to anon, authenticated;
grant execute on function public.submit_review(uuid, int, text, text, text), public.set_review_status(uuid, text),
  public.admin_customers(text, int, int), public.admin_dashboard(), public.update_store_settings(jsonb),
  public.update_seo_settings(jsonb), public.reorder_home_sections(text[]) to authenticated;
revoke execute on function public.audit_page() from public, anon, authenticated;
