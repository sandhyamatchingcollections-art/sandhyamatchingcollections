-- ============================================================================
-- Sandhya Matching Collections — complete database setup (new projects)
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run.
-- Generated from migrations/0001–0010 + seed.sql. Run it once on a fresh project.
-- ============================================================================

-- >>>>>>>>>> migrations/0001_core_schema.sql
-- ============================================================================
-- Sandhya Matching Collections — 0001 core schema
-- Catalogue, content, staff roles, store settings, audit log.
-- Orders, payments, carts and coupons arrive in later migrations (Phases 5–7).
--
-- Money is integer paise (bigint). Quantities are numeric(12,3) so fabric can be
-- sold in 0.5 m steps without float rounding.
-- ============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- types
create type public.app_role as enum ('super_admin', 'store_manager', 'product_manager', 'order_manager');
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.selling_unit as enum ('piece', 'metre', 'yard', 'set');
create type public.attribute_type as enum ('text', 'select', 'color');
create type public.stock_reason as enum ('initial', 'adjustment', 'import', 'order', 'cancellation', 'refund');

-- ---------------------------------------------------------------- helpers
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- people & roles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  phone text check (phone ~ '^[0-9+ ]{7,16}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Which role may do what. Changed only by migrations, never from the app.
create table public.role_permissions (
  role public.app_role not null,
  permission text not null,
  primary key (role, permission)
);

insert into public.role_permissions (role, permission) values
  ('super_admin', 'catalog.write'), ('super_admin', 'inventory.write'), ('super_admin', 'orders.write'),
  ('super_admin', 'promotions.write'), ('super_admin', 'content.write'), ('super_admin', 'customers.read'),
  ('super_admin', 'settings.store'), ('super_admin', 'settings.payments'), ('super_admin', 'staff.manage'),
  ('super_admin', 'reports.view'), ('super_admin', 'audit.view'),
  ('store_manager', 'catalog.write'), ('store_manager', 'inventory.write'), ('store_manager', 'orders.write'),
  ('store_manager', 'promotions.write'), ('store_manager', 'content.write'), ('store_manager', 'customers.read'),
  ('store_manager', 'reports.view'), ('store_manager', 'audit.view'),
  ('product_manager', 'catalog.write'), ('product_manager', 'inventory.write'),
  ('order_manager', 'orders.write'), ('order_manager', 'customers.read');

-- Security-definer so RLS policies can call them without exposing user_roles.
create or replace function public.has_permission(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = auth.uid() and rp.permission = perm
  );
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid());
$$;

create or replace function public.my_permissions() returns setof text
language sql stable security definer set search_path = public as $$
  select distinct rp.permission from public.user_roles ur
  join public.role_permissions rp on rp.role = ur.role
  where ur.user_id = auth.uid();
$$;

-- New sign-ups get a profile row automatically.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (char_length(description) <= 2000),
  image_path text,
  banner_path text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  depth smallint not null default 0,
  seo_title text check (char_length(seo_title) <= 70),
  seo_description text check (char_length(seo_description) <= 170),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_parent_idx on public.categories (parent_id, sort_order);

-- Max 4 levels (depth 0–3) and no cycles.
create or replace function public.categories_set_depth() returns trigger
language plpgsql as $$
declare
  parent_depth smallint;
begin
  if new.parent_id is null then
    new.depth := 0;
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'A category cannot be its own parent' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and exists (
    with recursive up as (
      select id, parent_id from public.categories where id = new.parent_id
      union all
      select c.id, c.parent_id from public.categories c join up on c.id = up.parent_id
    ) select 1 from up where id = new.id
  ) then
    raise exception 'Moving this category under its own subcategory would create a loop' using errcode = '23514';
  end if;
  select depth into parent_depth from public.categories where id = new.parent_id;
  new.depth := parent_depth + 1;
  if new.depth > 3 then
    raise exception 'Categories can be nested at most 4 levels deep' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger categories_depth before insert or update of parent_id on public.categories
  for each row execute function public.categories_set_depth();
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

create table public.category_attributes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null,
  type public.attribute_type not null default 'select',
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  is_filterable boolean not null default true,
  sort_order int not null default 0,
  unique (category_id, key)
);

-- ---------------------------------------------------------------- products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 160),
  description text check (char_length(description) <= 10000),
  brand text,
  status public.product_status not null default 'draft',
  is_featured boolean not null default false,
  quote_only boolean not null default false, -- "Request a quote / WhatsApp" instead of Add to Cart
  published_at timestamptz,
  seo_title text check (char_length(seo_title) <= 70),
  seo_description text check (char_length(seo_description) <= 170),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_status_published_idx on public.products (status, published_at desc);
create index products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- A product goes live with a publish date if none was set.
create or replace function public.products_default_published() returns trigger
language plpgsql as $$
begin
  if new.status = 'active' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;
create trigger products_published before insert or update of status on public.products
  for each row execute function public.products_default_published();

create table public.product_categories (
  product_id uuid not null references public.products (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict, -- blocks deleting a category that still has products
  is_primary boolean not null default false,
  primary key (product_id, category_id)
);
create index product_categories_category_idx on public.product_categories (category_id);
create unique index product_categories_one_primary on public.product_categories (product_id) where is_primary;

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null unique check (sku ~ '^[A-Za-z0-9._-]{1,40}$'),
  title text not null default 'Default',
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  price bigint not null check (price >= 0),
  mrp bigint check (mrp is null or mrp >= price),
  unit public.selling_unit not null default 'piece',
  min_qty numeric(12,3) not null default 1 check (min_qty > 0),
  qty_step numeric(12,3) not null default 1 check (qty_step > 0),
  max_qty numeric(12,3) check (max_qty is null or max_qty >= min_qty),
  track_inventory boolean not null default true,
  weight_grams int check (weight_grams is null or weight_grams >= 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Whole-piece units must use whole-number quantities.
  constraint variant_piece_whole check (
    unit in ('metre', 'yard') or (min_qty = trunc(min_qty) and qty_step = trunc(qty_step))
  )
);
create index product_variants_product_idx on public.product_variants (product_id);
create index product_variants_price_idx on public.product_variants (price) where is_active;
create unique index product_variants_one_default on public.product_variants (product_id) where is_default;
create trigger product_variants_touch before update on public.product_variants
  for each row execute function public.touch_updated_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  storage_path text not null,
  alt text not null default '' check (char_length(alt) <= 200),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

create table public.product_attribute_values (
  product_id uuid not null references public.products (id) on delete cascade,
  attribute_id uuid not null references public.category_attributes (id) on delete cascade,
  value text not null check (char_length(value) <= 120),
  primary key (product_id, attribute_id, value)
);
create index product_attribute_values_attr_idx on public.product_attribute_values (attribute_id, value);

-- ---------------------------------------------------------------- inventory
create table public.inventory (
  variant_id uuid primary key references public.product_variants (id) on delete cascade,
  on_hand numeric(12,3) not null default 0 check (on_hand >= 0),
  reserved numeric(12,3) not null default 0 check (reserved >= 0),
  low_stock_threshold numeric(12,3) not null default 5 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now(),
  constraint inventory_reserved_le_on_hand check (reserved <= on_hand)
);
create trigger inventory_touch before update on public.inventory
  for each row execute function public.touch_updated_at();

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  delta numeric(12,3) not null check (delta <> 0),
  reason public.stock_reason not null,
  reference text,
  note text,
  actor_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index inventory_movements_variant_idx on public.inventory_movements (variant_id, created_at desc);

-- Every variant gets an inventory row.
create or replace function public.create_inventory_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory (variant_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger product_variants_inventory after insert on public.product_variants
  for each row execute function public.create_inventory_row();

-- The only way stock changes: one atomic call that writes the movement and the balance.
create or replace function public.adjust_stock(
  p_variant uuid, p_delta numeric, p_reason public.stock_reason, p_note text default null
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  new_on_hand numeric;
begin
  if not public.has_permission('inventory.write') then
    raise exception 'Not allowed to change stock' using errcode = '42501';
  end if;
  update public.inventory set on_hand = on_hand + p_delta
    where variant_id = p_variant
    returning on_hand into new_on_hand;
  if not found then
    raise exception 'Variant not found' using errcode = 'P0002';
  end if;
  insert into public.inventory_movements (variant_id, delta, reason, note)
    values (p_variant, p_delta, p_reason, p_note);
  return new_on_hand;
end $$;

-- ---------------------------------------------------------------- collections & promotions
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  description text,
  banner_path text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger collections_touch before update on public.collections
  for each row execute function public.touch_updated_at();

create table public.collection_products (
  collection_id uuid not null references public.collections (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sort_order int not null default 0,
  primary key (collection_id, product_id)
);
create index collection_products_product_idx on public.collection_products (product_id);

-- Phase 6 adds targets, coupon rules and the pricing engine; this is enough for the
-- homepage banner and /offers to show only live promotions.
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_window check (ends_at is null or ends_at > starts_at)
);
create trigger promotions_touch before update on public.promotions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- store settings & homepage
create table public.store_settings (
  id boolean primary key default true check (id), -- exactly one row
  name text not null,
  tagline text not null default '',
  description text not null default '',
  shipping_note text not null default '',
  whatsapp text check (whatsapp ~ '^[0-9]{10,15}$'),
  instagram_url text check (instagram_url ~ '^https://'),
  instagram_handle text,
  facebook_url text check (facebook_url ~ '^https://'),
  email text,
  phone text,
  address text,
  gstin text check (gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  currency text not null default 'INR' check (currency = 'INR'),
  timezone text not null default 'Asia/Kolkata',
  new_arrival_days int not null default 30 check (new_arrival_days between 1 and 365),
  payment_methods text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create trigger store_settings_touch before update on public.store_settings
  for each row execute function public.touch_updated_at();

create table public.homepage_sections (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  type text not null check (type in ('hero', 'budget', 'feature', 'productRail', 'promo')),
  sort_order int not null default 0,
  is_enabled boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  config jsonb not null check (jsonb_typeof(config) = 'object'), -- validated by Zod per type in the app
  updated_at timestamptz not null default now()
);
create trigger homepage_sections_touch before update on public.homepage_sections
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- audit log
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id, created_at desc);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec_id text;
begin
  rec_id := coalesce(
    to_jsonb(coalesce(new, old)) ->> 'id',
    to_jsonb(coalesce(new, old)) ->> 'user_id',
    to_jsonb(coalesce(new, old)) ->> 'variant_id'
  );
  insert into public.audit_logs (actor_id, action, entity, entity_id, before, after)
  values (
    auth.uid(), lower(tg_op), tg_table_name, rec_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_categories after insert or update or delete on public.categories for each row execute function public.audit_row();
create trigger audit_products after insert or update or delete on public.products for each row execute function public.audit_row();
create trigger audit_variants after insert or update or delete on public.product_variants for each row execute function public.audit_row();
create trigger audit_user_roles after insert or update or delete on public.user_roles for each row execute function public.audit_row();
create trigger audit_store_settings after update on public.store_settings for each row execute function public.audit_row();
create trigger audit_homepage after insert or update or delete on public.homepage_sections for each row execute function public.audit_row();
create trigger audit_promotions after insert or update or delete on public.promotions for each row execute function public.audit_row();
create trigger audit_collections after insert or update or delete on public.collections for each row execute function public.audit_row();

-- ---------------------------------------------------------------- storefront read model
-- One row per visible product, priced from its default variant. Runs with the owner's
-- rights so the storefront can show "in stock" without anyone reading raw stock numbers.
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
  (not v.track_inventory or coalesce(i.on_hand - i.reserved, 0) >= v.min_qty) as in_stock
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

-- Products in a category and all its subcategories (for category listing pages).
create or replace function public.category_product_ids(p_slug text) returns setof uuid
language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select id from public.categories where slug = p_slug and is_active
    union all
    select c.id from public.categories c join tree t on c.parent_id = t.id where c.is_active
  )
  select distinct pc.product_id from public.product_categories pc join tree t on t.id = pc.category_id;
$$;

-- >>>>>>>>>> migrations/0002_row_level_security.sql
-- ============================================================================
-- 0002 Row Level Security
-- Every table is locked by default; each policy below opens exactly one door.
-- The app also checks permissions in server actions — this is the second lock.
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.categories enable row level security;
alter table public.category_attributes enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.product_attribute_values enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.collections enable row level security;
alter table public.collection_products enable row level security;
alter table public.promotions enable row level security;
alter table public.store_settings enable row level security;
alter table public.homepage_sections enable row level security;
alter table public.audit_logs enable row level security;

-- Is this product visible to the public (or is the reader staff)?
create or replace function public.product_is_visible(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products
    where id = p_id and status = 'active' and published_at <= now()
  ) or public.is_staff();
$$;

-- ---------------------------------------------------------------- people
create policy "own profile: read" on public.profiles for select
  using (id = auth.uid() or public.has_permission('customers.read'));
create policy "own profile: update" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy "roles: read own or manage" on public.user_roles for select
  using (user_id = auth.uid() or public.has_permission('staff.manage'));
create policy "roles: grant" on public.user_roles for insert
  with check (public.has_permission('staff.manage'));
create policy "roles: revoke" on public.user_roles for delete
  using (public.has_permission('staff.manage'));

create policy "role permissions: staff read" on public.role_permissions for select
  using (public.is_staff());

-- ---------------------------------------------------------------- catalogue (public read, catalog.write to change)
create policy "categories: read" on public.categories for select
  using (is_active or public.is_staff());
create policy "categories: insert" on public.categories for insert
  with check (public.has_permission('catalog.write'));
create policy "categories: update" on public.categories for update
  using (public.has_permission('catalog.write')) with check (public.has_permission('catalog.write'));
create policy "categories: delete" on public.categories for delete
  using (public.has_permission('catalog.write'));

create policy "category attributes: read" on public.category_attributes for select using (true);
create policy "category attributes: write" on public.category_attributes for all
  using (public.has_permission('catalog.write')) with check (public.has_permission('catalog.write'));

create policy "products: read" on public.products for select
  using ((status = 'active' and published_at <= now()) or public.is_staff());
create policy "products: insert" on public.products for insert
  with check (public.has_permission('catalog.write'));
create policy "products: update" on public.products for update
  using (public.has_permission('catalog.write')) with check (public.has_permission('catalog.write'));
create policy "products: delete" on public.products for delete
  using (public.has_permission('catalog.write'));

create policy "product categories: read" on public.product_categories for select
  using (public.product_is_visible(product_id));
create policy "product categories: write" on public.product_categories for all
  using (public.has_permission('catalog.write')) with check (public.has_permission('catalog.write'));

create policy "variants: read" on public.product_variants for select
  using ((is_active and public.product_is_visible(product_id)) or public.is_staff());
create policy "variants: write" on public.product_variants for all
  using (public.has_permission('catalog.write')) with check (public.has_permission('catalog.write'));

create policy "images: read" on public.product_images for select
  using (public.product_is_visible(product_id));
create policy "images: write" on public.product_images for all
  using (public.has_permission('catalog.write')) with check (public.has_permission('catalog.write'));

create policy "attribute values: read" on public.product_attribute_values for select
  using (public.product_is_visible(product_id));
create policy "attribute values: write" on public.product_attribute_values for all
  using (public.has_permission('catalog.write')) with check (public.has_permission('catalog.write'));

-- ---------------------------------------------------------------- stock: staff only (customers see in/out via product_cards)
create policy "inventory: staff read" on public.inventory for select using (public.is_staff());
create policy "inventory: settings" on public.inventory for update
  using (public.has_permission('inventory.write')) with check (public.has_permission('inventory.write'));
-- on_hand/reserved change only through adjust_stock(), which writes the movement too.
-- (A column-level revoke is ignored while a table-level grant exists, so revoke the table, re-grant one column.)
revoke update on public.inventory from anon, authenticated;
grant update (low_stock_threshold) on public.inventory to authenticated;

create policy "stock history: staff read" on public.inventory_movements for select
  using (public.has_permission('inventory.write'));
-- no insert/update/delete policies: history is written only by adjust_stock() and is append-only.

-- ---------------------------------------------------------------- collections & promotions
create policy "collections: read" on public.collections for select using (is_active or public.is_staff());
create policy "collections: write" on public.collections for all
  using (public.has_permission('content.write') or public.has_permission('catalog.write'))
  with check (public.has_permission('content.write') or public.has_permission('catalog.write'));

create policy "collection products: read" on public.collection_products for select
  using (public.product_is_visible(product_id));
create policy "collection products: write" on public.collection_products for all
  using (public.has_permission('content.write') or public.has_permission('catalog.write'))
  with check (public.has_permission('content.write') or public.has_permission('catalog.write'));

create policy "promotions: read live" on public.promotions for select
  using ((is_active and starts_at <= now() and (ends_at is null or ends_at > now())) or public.is_staff());
create policy "promotions: write" on public.promotions for all
  using (public.has_permission('promotions.write')) with check (public.has_permission('promotions.write'));

-- ---------------------------------------------------------------- settings & homepage
create policy "settings: read" on public.store_settings for select using (true);
create policy "settings: update" on public.store_settings for update
  using (public.has_permission('settings.store')) with check (public.has_permission('settings.store'));
-- Payment methods are switched on only by a Super Admin, via set_payment_methods().
revoke update on public.store_settings from anon, authenticated;
grant update (name, tagline, description, shipping_note, whatsapp, instagram_url, instagram_handle,
  facebook_url, email, phone, address, gstin, new_arrival_days) on public.store_settings to authenticated;

create policy "homepage: read live" on public.homepage_sections for select
  using (
    (is_enabled and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
    or public.is_staff()
  );
create policy "homepage: write" on public.homepage_sections for all
  using (public.has_permission('content.write')) with check (public.has_permission('content.write'));

-- Super Admin-only path for payment methods (the column grant above blocks direct updates).
create or replace function public.set_payment_methods(p_methods text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('settings.payments') then
    raise exception 'Only a Super Admin can change payment settings' using errcode = '42501';
  end if;
  update public.store_settings set payment_methods = p_methods where id;
end $$;

-- ---------------------------------------------------------------- audit log: read-only for managers
create policy "audit: read" on public.audit_logs for select using (public.has_permission('audit.view'));
-- No write policies: rows are written only by the audit_row() trigger.

-- ---------------------------------------------------------------- function access
revoke execute on function public.adjust_stock(uuid, numeric, public.stock_reason, text) from public, anon;
grant execute on function public.adjust_stock(uuid, numeric, public.stock_reason, text) to authenticated;
revoke execute on function public.set_payment_methods(text[]) from public, anon;
grant execute on function public.set_payment_methods(text[]) to authenticated;

-- >>>>>>>>>> migrations/0003_storage.sql
-- ============================================================================
-- 0003 Storage buckets (Supabase only)
-- product-images / campaign-images: public to read, staff-only to write.
-- Size and type limits are enforced by the bucket and again by the upload API.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('campaign-images', 'campaign-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('custom-uploads', 'custom-uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "product images: public read" on storage.objects for select
  using (bucket_id in ('product-images', 'campaign-images'));

create policy "product images: catalog staff write" on storage.objects for insert
  with check (bucket_id = 'product-images' and public.has_permission('catalog.write'));
create policy "product images: catalog staff update" on storage.objects for update
  using (bucket_id = 'product-images' and public.has_permission('catalog.write'));
create policy "product images: catalog staff delete" on storage.objects for delete
  using (bucket_id = 'product-images' and public.has_permission('catalog.write'));

create policy "campaign images: content staff write" on storage.objects for insert
  with check (bucket_id = 'campaign-images' and public.has_permission('content.write'));
create policy "campaign images: content staff update" on storage.objects for update
  using (bucket_id = 'campaign-images' and public.has_permission('content.write'));
create policy "campaign images: content staff delete" on storage.objects for delete
  using (bucket_id = 'campaign-images' and public.has_permission('content.write'));

-- Customer reference designs for custom printing: each customer sees only their own folder (<user id>/...).
create policy "custom uploads: own folder write" on storage.objects for insert
  with check (bucket_id = 'custom-uploads' and auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text);
create policy "custom uploads: own or staff read" on storage.objects for select
  using (bucket_id = 'custom-uploads' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_permission('orders.write')));

-- >>>>>>>>>> migrations/0004_staff_management.sql
-- ============================================================================
-- 0004 Staff management
-- Lets a Super Admin add or remove staff by email from the admin dashboard,
-- without the app ever holding the service-role key.
-- ============================================================================

create or replace function public.list_staff()
returns table (user_id uuid, email text, roles public.app_role[], since timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('staff.manage') then
    raise exception 'Only a Super Admin can view staff' using errcode = '42501';
  end if;
  return query
    select ur.user_id, u.email::text, array_agg(ur.role order by ur.role), min(ur.created_at)
    from public.user_roles ur join auth.users u on u.id = ur.user_id
    group by ur.user_id, u.email
    order by min(ur.created_at);
end $$;

create or replace function public.grant_role(p_email text, p_role public.app_role) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if not public.has_permission('staff.manage') then
    raise exception 'Only a Super Admin can add staff' using errcode = '42501';
  end if;
  select id into target from auth.users where lower(email) = lower(trim(p_email));
  if target is null then
    raise exception 'No account with that email. Ask them to sign in to the store once, then try again.' using errcode = 'P0002';
  end if;
  insert into public.user_roles (user_id, role, granted_by) values (target, p_role, auth.uid())
    on conflict do nothing;
  return target;
end $$;

create or replace function public.revoke_role(p_user uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('staff.manage') then
    raise exception 'Only a Super Admin can remove staff' using errcode = '42501';
  end if;
  if p_role = 'super_admin'
     and (select count(*) from public.user_roles where role = 'super_admin') <= 1
     and exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin') then
    raise exception 'The store must keep at least one Super Admin' using errcode = '23514';
  end if;
  delete from public.user_roles where user_id = p_user and role = p_role;
end $$;

revoke execute on function public.list_staff() from public, anon;
grant execute on function public.list_staff() to authenticated;
revoke execute on function public.grant_role(text, public.app_role) from public, anon;
grant execute on function public.grant_role(text, public.app_role) to authenticated;
revoke execute on function public.revoke_role(uuid, public.app_role) from public, anon;
grant execute on function public.revoke_role(uuid, public.app_role) to authenticated;

-- >>>>>>>>>> migrations/0005_catalog_management.sql
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

-- >>>>>>>>>> migrations/0006_api_grants.sql
-- ============================================================================
-- 0006 Explicit API permissions
-- Newer Supabase projects no longer give the website's roles (anon = visitors,
-- authenticated = signed-in people) access to new tables automatically.
-- This grants exactly what the app uses. Row Level Security (0002) still decides
-- WHICH rows each person can see or change. Safe to run more than once.
-- ============================================================================

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------- read access (visitors and signed-in)
grant select on
  public.categories, public.category_attributes, public.products, public.product_categories,
  public.product_variants, public.product_images, public.product_attribute_values,
  public.collections, public.collection_products, public.promotions,
  public.store_settings, public.homepage_sections, public.product_cards
to anon, authenticated;

-- ---------------------------------------------------------------- signed-in only (RLS limits rows)
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.user_roles to authenticated;
grant select on public.role_permissions, public.inventory, public.inventory_movements, public.audit_logs to authenticated;
grant select on public.admin_products, public.admin_stock to authenticated;

-- Staff catalogue editing (RLS requires catalog/content/promotions permissions)
grant insert, update, delete on
  public.categories, public.category_attributes, public.products, public.product_categories,
  public.product_variants, public.product_images, public.product_attribute_values,
  public.collections, public.collection_products, public.promotions, public.homepage_sections
to authenticated;

-- Only the low-stock alert level is directly editable; stock itself changes via adjust_stock().
revoke update on public.inventory from anon, authenticated;
grant update (low_stock_threshold) on public.inventory to authenticated;

-- Store settings: everything except payment methods (Super Admin uses set_payment_methods()).
revoke update on public.store_settings from anon, authenticated;
grant update (name, tagline, description, shipping_note, whatsapp, instagram_url, instagram_handle,
  facebook_url, email, phone, address, gstin, new_arrival_days) on public.store_settings to authenticated;

-- Nothing for visitors beyond reading the shop.
revoke insert, update, delete on all tables in schema public from anon;
revoke select on public.admin_products, public.admin_stock, public.inventory, public.inventory_movements,
  public.audit_logs, public.user_roles, public.role_permissions, public.profiles from anon;

grant usage on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------- functions
-- Used inside security rules, so every visitor must be able to run them (they only answer yes/no).
grant execute on function public.has_permission(text), public.is_staff(), public.product_is_visible(uuid),
  public.category_product_ids(text), public.my_permissions() to anon, authenticated;

-- Admin actions: signed-in only; each also checks the person's role inside.
grant execute on function
  public.adjust_stock(uuid, numeric, public.stock_reason, text), public.set_payment_methods(text[]),
  public.list_staff(), public.grant_role(text, public.app_role), public.revoke_role(uuid, public.app_role),
  public.assert_permission(text), public.category_usage(uuid), public.delete_category(uuid, uuid),
  public.reorder_categories(uuid[]), public.save_product(jsonb), public.duplicate_product(uuid),
  public.bulk_update_products(uuid[], text, text), public.import_products(jsonb, boolean), public.slugify(text)
to authenticated;
revoke execute on function
  public.adjust_stock(uuid, numeric, public.stock_reason, text), public.set_payment_methods(text[]),
  public.list_staff(), public.grant_role(text, public.app_role), public.revoke_role(uuid, public.app_role),
  public.delete_category(uuid, uuid), public.reorder_categories(uuid[]), public.save_product(jsonb),
  public.duplicate_product(uuid), public.bulk_update_products(uuid[], text, text), public.import_products(jsonb, boolean)
from public, anon;

-- >>>>>>>>>> migrations/0007_shopping.sql
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

-- >>>>>>>>>> migrations/0008_checkout.sql
-- ============================================================================
-- 0008 Checkout, orders and payments (Phase 6)
--
-- Money flow, in one place:
--   checkout_quote   prices the cart + shipping + COD fee (anyone; read-only)
--   place_order      re-prices on the server, reserves stock, creates the order (anyone)
--   confirm_payment  marks an online order paid. ONLY the server (service_role)
--                    may call it, after checking Razorpay's signature.
--   set_order_status staff move an order along; shipping takes stock off the shelf,
--                    cancelling releases it.
-- Unpaid online orders hold stock for 30 minutes, then release it.
-- ============================================================================

-- ---------------------------------------------------------------- settings
alter table public.store_settings
  add column if not exists shipping_fee bigint not null default 7900 check (shipping_fee >= 0),
  add column if not exists free_shipping_min bigint default 99900 check (free_shipping_min is null or free_shipping_min >= 0),
  add column if not exists cod_enabled boolean not null default true,
  add column if not exists cod_fee bigint not null default 0 check (cod_fee >= 0),
  add column if not exists cod_max_total bigint default 500000 check (cod_max_total is null or cod_max_total > 0),
  add column if not exists online_payments_enabled boolean not null default true;

-- Starting values (column defaults, so they also apply when the settings row is created later):
-- ₹79 shipping, free from ₹999, COD up to ₹5,000. The owner changes them in Admin → Shipping.

-- ---------------------------------------------------------------- addresses
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  line1 text not null check (char_length(line1) between 3 and 160),
  line2 text check (char_length(line2) <= 160),
  landmark text check (char_length(landmark) <= 80),
  city text not null check (char_length(city) between 2 and 60),
  state text not null check (char_length(state) between 2 and 60),
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses (user_id, created_at desc);
alter table public.addresses enable row level security;
drop policy if exists "addresses: own rows" on public.addresses;
create policy "addresses: own rows" on public.addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- orders
create sequence if not exists public.order_number_seq start 10001;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('SMC' || nextval('public.order_number_seq')),
  access_token uuid not null default gen_random_uuid(),  -- lets a guest open their own order page
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending_payment' check (status in
    ('pending_payment', 'placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'on_hold')),
  payment_method text not null check (payment_method in ('online', 'cod')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'cod', 'refunded')),
  stock_state text not null default 'reserved' check (stock_state in ('reserved', 'released', 'deducted')),
  customer_name text not null,
  email text not null,
  phone text not null,
  shipping_address jsonb not null,
  subtotal bigint not null check (subtotal >= 0),
  shipping_fee bigint not null default 0 check (shipping_fee >= 0),
  cod_fee bigint not null default 0 check (cod_fee >= 0),
  discount bigint not null default 0 check (discount >= 0),
  total bigint not null check (total >= 0),
  customer_note text check (char_length(customer_note) <= 500),
  staff_note text check (char_length(staff_note) <= 2000),
  cancel_reason text,
  razorpay_order_id text unique,
  razorpay_payment_id text,
  expires_at timestamptz,           -- unpaid online orders release stock after this
  placed_at timestamptz,
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create index if not exists orders_phone_idx on public.orders (phone, created_at desc);
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  sku text not null,
  name text not null,
  title text not null default 'Default',
  unit public.selling_unit not null,
  qty numeric(12,3) not null check (qty > 0),
  price bigint not null check (price >= 0),
  mrp bigint,
  line_total bigint not null check (line_total >= 0),
  image_path text,
  track_inventory boolean not null default true
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- Status history, shown on the order page and in the admin.
create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  status text not null,
  note text,
  actor_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;

drop policy if exists "orders: own or staff" on public.orders;
create policy "orders: own or staff" on public.orders for select
  using (user_id = auth.uid() or public.has_permission('orders.write'));
drop policy if exists "order_items: own or staff" on public.order_items;
create policy "order_items: own or staff" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.has_permission('orders.write'))));
drop policy if exists "order_events: own or staff" on public.order_events;
create policy "order_events: own or staff" on public.order_events for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.has_permission('orders.write'))));
-- All writes go through the functions below.

-- ---------------------------------------------------------------- helpers
-- Shipping + COD fee for a subtotal. One definition used by the quote and the order.
create or replace function public.order_charges(p_subtotal bigint, p_method text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shipping_fee', case when p_subtotal = 0 then 0
                         when s.free_shipping_min is not null and p_subtotal >= s.free_shipping_min then 0
                         else s.shipping_fee end,
    'cod_fee', case when p_method = 'cod' then s.cod_fee else 0 end,
    'free_shipping_min', s.free_shipping_min,
    'cod_allowed', s.cod_enabled and (s.cod_max_total is null or p_subtotal <= s.cod_max_total),
    'cod_max_total', s.cod_max_total,
    'online_allowed', s.online_payments_enabled)
  from public.store_settings s limit 1
$$;

-- Price the cart for the checkout page.
create or replace function public.checkout_quote(p_lines jsonb, p_method text default 'online')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q jsonb; c jsonb; sub bigint;
begin
  q := public.quote_cart(p_lines);
  sub := (q ->> 'subtotal')::bigint;
  c := public.order_charges(sub, p_method);
  return q || c || jsonb_build_object('total', sub + (c ->> 'shipping_fee')::bigint + (c ->> 'cod_fee')::bigint);
end $$;

-- Give back the stock held by one order (idempotent).
create or replace function public.release_order_stock(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare it record;
begin
  if not exists (select 1 from public.orders where id = p_order and stock_state = 'reserved' for update) then return; end if;
  for it in select variant_id, qty from public.order_items where order_id = p_order and track_inventory and variant_id is not null loop
    update public.inventory set reserved = greatest(reserved - it.qty, 0) where variant_id = it.variant_id;
  end loop;
  update public.orders set stock_state = 'released' where id = p_order;
end $$;

-- Cancel unpaid online orders whose 30 minutes are up. Safe to call any time.
create or replace function public.release_expired_orders()
returns int language plpgsql security definer set search_path = public as $$
declare o record; n int := 0;
begin
  for o in select id from public.orders
           where status = 'pending_payment' and expires_at < now()
           for update skip locked loop
    perform public.release_order_stock(o.id);
    update public.orders set status = 'cancelled', payment_status = 'failed', cancelled_at = now(),
      cancel_reason = 'Payment not completed in time' where id = o.id;
    insert into public.order_events (order_id, status, note, actor_id) values (o.id, 'cancelled', 'Payment not completed in time', null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- place order
-- p: { lines:[{variant_id,qty}], method:'online'|'cod', name, email, phone,
--      address:{full_name,phone,line1,line2,landmark,city,state,pincode}, note, save_address:bool,
--      expected_total: paise (what the shopper saw) }
create or replace function public.place_order(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  q jsonb; c jsonb; ln jsonb; a jsonb;
  method text := p ->> 'method';
  sub bigint; ship bigint; cod bigint; tot bigint;
  oid uuid; onum text; tok uuid;
  em text := lower(trim(p ->> 'email'));
  ph text := regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g');
  ok int;
begin
  perform public.release_expired_orders();

  -- ---- who and where
  if method not in ('online', 'cod') then raise exception 'Choose a payment method.' using errcode = '22023'; end if;
  if length(ph) = 12 and ph like '91%' then ph := substr(ph, 3); end if;
  if ph !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number.' using errcode = '22023'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(em) > 254 then raise exception 'Enter a valid email address.' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p ->> 'name', ''))) < 2 then raise exception 'Enter your name.' using errcode = '22023'; end if;
  a := p -> 'address';
  if a is null or coalesce(a ->> 'pincode', '') !~ '^[1-9][0-9]{5}$' then raise exception 'Enter a valid 6-digit PIN code.' using errcode = '22023'; end if;
  if char_length(trim(coalesce(a ->> 'line1', ''))) < 3 or char_length(trim(coalesce(a ->> 'city', ''))) < 2
     or char_length(trim(coalesce(a ->> 'state', ''))) < 2 then
    raise exception 'Please complete the delivery address.' using errcode = '22023';
  end if;
  -- Light spam guard: a handful of orders per phone per hour.
  if (select count(*) from public.orders where phone = ph and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Too many orders from this number in the last hour. Please try again later or message us on WhatsApp.' using errcode = '22023';
  end if;

  -- ---- price it again on the server
  q := public.quote_cart(p -> 'lines');
  if jsonb_array_length(q -> 'lines') = 0 then raise exception 'Your cart is empty.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(q -> 'lines') l where l ->> 'status' <> 'ok') then
    raise exception 'Some items in your cart changed. Please review your cart.' using errcode = 'P0001', hint = 'cart_changed';
  end if;
  sub := (q ->> 'subtotal')::bigint;
  c := public.order_charges(sub, method);
  if method = 'cod' and not (c ->> 'cod_allowed')::boolean then raise exception 'Cash on Delivery isn''t available for this order.' using errcode = '22023'; end if;
  if method = 'online' and not (c ->> 'online_allowed')::boolean then raise exception 'Online payment isn''t available right now.' using errcode = '22023'; end if;
  ship := (c ->> 'shipping_fee')::bigint; cod := (c ->> 'cod_fee')::bigint; tot := sub + ship + cod;
  if p ? 'expected_total' and (p ->> 'expected_total')::bigint <> tot then
    raise exception 'Prices changed while you were checking out. Please review the new total.' using errcode = 'P0001', hint = 'cart_changed';
  end if;

  -- ---- create the order
  insert into public.orders (user_id, status, payment_method, payment_status, customer_name, email, phone,
    shipping_address, subtotal, shipping_fee, cod_fee, total, customer_note, expires_at, placed_at)
  values (auth.uid(), case when method = 'cod' then 'placed' else 'pending_payment' end, method,
    case when method = 'cod' then 'cod' else 'pending' end,
    trim(p ->> 'name'), em, ph,
    jsonb_build_object('full_name', trim(coalesce(a ->> 'full_name', p ->> 'name')), 'phone', ph,
      'line1', trim(a ->> 'line1'), 'line2', nullif(trim(coalesce(a ->> 'line2', '')), ''),
      'landmark', nullif(trim(coalesce(a ->> 'landmark', '')), ''), 'city', trim(a ->> 'city'),
      'state', trim(a ->> 'state'), 'pincode', a ->> 'pincode'),
    sub, ship, cod, tot, nullif(left(trim(coalesce(p ->> 'note', '')), 500), ''),
    case when method = 'online' then now() + interval '30 minutes' end,
    case when method = 'cod' then now() end)
  returning id, order_number, access_token into oid, onum, tok;

  -- ---- items + reserve stock (the conditional update locks the row, so two shoppers can't buy the last piece)
  for ln in select * from jsonb_array_elements(q -> 'lines') loop
    insert into public.order_items (order_id, variant_id, product_id, sku, name, title, unit, qty, price, mrp, line_total, image_path, track_inventory)
    select oid, v.id, v.product_id, v.sku, ln ->> 'name', v.title, v.unit, (ln ->> 'qty')::numeric, v.price, v.mrp,
           (ln ->> 'line_total')::bigint, ln ->> 'image_path', v.track_inventory
    from public.product_variants v where v.id = (ln ->> 'variant_id')::uuid;

    if (select track_inventory from public.product_variants where id = (ln ->> 'variant_id')::uuid) then
      update public.inventory set reserved = reserved + (ln ->> 'qty')::numeric
      where variant_id = (ln ->> 'variant_id')::uuid and on_hand - reserved >= (ln ->> 'qty')::numeric;
      get diagnostics ok = row_count;
      if ok = 0 then
        raise exception 'Sorry — % just sold out. Please review your cart.', ln ->> 'name' using errcode = 'P0001', hint = 'cart_changed';
      end if;
    end if;
  end loop;

  insert into public.order_events (order_id, status, note) values (oid, case when method = 'cod' then 'placed' else 'pending_payment' end,
    case when method = 'cod' then 'Order placed — Cash on Delivery' else 'Waiting for online payment' end);

  -- ---- signed-in extras: save the address, empty the saved cart (COD only; online empties after payment)
  if auth.uid() is not null then
    if coalesce((p ->> 'save_address')::boolean, false) and not exists (
      select 1 from public.addresses where user_id = auth.uid() and pincode = a ->> 'pincode' and lower(line1) = lower(trim(a ->> 'line1'))) then
      insert into public.addresses (user_id, full_name, phone, line1, line2, landmark, city, state, pincode, is_default)
      values (auth.uid(), trim(coalesce(a ->> 'full_name', p ->> 'name')), ph, trim(a ->> 'line1'), nullif(trim(coalesce(a ->> 'line2', '')), ''),
        nullif(trim(coalesce(a ->> 'landmark', '')), ''), trim(a ->> 'city'), trim(a ->> 'state'), a ->> 'pincode',
        not exists (select 1 from public.addresses where user_id = auth.uid()));
    end if;
    if method = 'cod' then delete from public.cart_items where user_id = auth.uid(); end if;
  end if;

  return jsonb_build_object('id', oid, 'order_number', onum, 'access_token', tok, 'total', tot,
    'status', case when method = 'cod' then 'placed' else 'pending_payment' end);
end $$;

-- ---------------------------------------------------------------- payments (server only)
-- The app's server calls this after verifying Razorpay's signature. Not callable from browsers.
create or replace function public.attach_razorpay_order(p_order uuid, p_rzp_order text)
returns void language sql security definer set search_path = public as $$
  update public.orders set razorpay_order_id = p_rzp_order where id = p_order and status = 'pending_payment';
$$;

create or replace function public.confirm_payment(p_rzp_order text, p_payment text, p_amount bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o record; it record; ok int; short boolean := false;
begin
  select * into o from public.orders where razorpay_order_id = p_rzp_order for update;
  if not found then raise exception 'Order not found for this payment.' using errcode = 'P0002'; end if;
  if o.payment_status = 'paid' then
    return jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'already', true);
  end if;
  if p_amount is not null and p_amount <> o.total then
    update public.orders set status = 'on_hold', payment_status = 'paid', paid_at = now(), razorpay_payment_id = p_payment,
      staff_note = concat_ws(E'\n', staff_note, 'Paid amount ' || p_amount || ' paise differs from order total — check before shipping.') where id = o.id;
    insert into public.order_events (order_id, status, note, actor_id) values (o.id, 'on_hold', 'Payment amount mismatch', null);
    return jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', 'on_hold');
  end if;

  -- Paid after the 30 minutes ran out: try to take the stock again.
  if o.stock_state = 'released' then
    -- All or nothing: if any item is short, every hold in this block is rolled back and staff decide.
    begin
      for it in select variant_id, qty from public.order_items where order_id = o.id and track_inventory and variant_id is not null loop
        update public.inventory set reserved = reserved + it.qty where variant_id = it.variant_id and on_hand - reserved >= it.qty;
        get diagnostics ok = row_count;
        if ok = 0 then raise exception 'short'; end if;
      end loop;
    exception when others then
      short := true;
    end;
  end if;

  update public.orders set
    status = case when short then 'on_hold' else 'placed' end,
    payment_status = 'paid', paid_at = now(), placed_at = coalesce(placed_at, now()), razorpay_payment_id = p_payment,
    expires_at = null, cancelled_at = null, cancel_reason = null,
    stock_state = case when short then 'released' else 'reserved' end,
    staff_note = case when short then concat_ws(E'\n', staff_note, 'Paid after the hold expired and some items are no longer in stock — restock or refund.') else staff_note end
  where id = o.id;
  insert into public.order_events (order_id, status, note, actor_id)
  values (o.id, case when short then 'on_hold' else 'placed' end,
          case when short then 'Paid, but some items sold out meanwhile' else 'Payment received online' end, null);
  if o.user_id is not null then delete from public.cart_items where user_id = o.user_id; end if;
  return jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', case when short then 'on_hold' else 'placed' end);
end $$;

-- Shopper closed the payment window or the server couldn't reach Razorpay: release now.
create or replace function public.abandon_order(p_order uuid, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.orders where id = p_order and access_token = p_token and status = 'pending_payment') then return; end if;
  perform public.release_order_stock(p_order);
  update public.orders set status = 'cancelled', payment_status = 'failed', cancelled_at = now(), cancel_reason = 'Payment not completed'
  where id = p_order;
  insert into public.order_events (order_id, status, note, actor_id) values (p_order, 'cancelled', 'Payment not completed', null);
end $$;

-- ---------------------------------------------------------------- reading an order
-- For the order page: the owner (signed in), staff, or anyone holding the private link token.
create or replace function public.order_view(p_number text, p_token uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where order_number = upper(p_number);
  if not found then return null; end if;
  -- Fail closed: every test is coalesced so an unknown (null) never grants access.
  if not (coalesce(o.access_token = p_token, false)
          or coalesce(o.user_id = auth.uid(), false)
          or coalesce(public.has_permission('orders.write'), false)) then
    return null;
  end if;
  return to_jsonb(o) - 'staff_note' || jsonb_build_object(
    'pay_open', o.status = 'pending_payment' and o.expires_at > now(),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.name) from public.order_items i where i.order_id = o.id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.created_at) order by e.created_at)
                        from public.order_events e where e.order_id = o.id), '[]'));
end $$;

create or replace function public.my_orders()
returns setof public.orders language sql stable security definer set search_path = public as $$
  select * from public.orders where user_id = auth.uid() and auth.uid() is not null order by created_at desc limit 100;
$$;

-- ---------------------------------------------------------------- staff
create or replace function public.set_order_status(p_order uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o record; it record; allowed text[];
begin
  if not public.has_permission('orders.write') then raise exception 'You don''t have permission to update orders.' using errcode = '42501'; end if;
  perform public.release_expired_orders();
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;

  allowed := case o.status
    when 'pending_payment' then array['cancelled']
    when 'placed' then array['confirmed', 'packed', 'shipped', 'cancelled', 'on_hold']
    when 'confirmed' then array['packed', 'shipped', 'cancelled', 'on_hold']
    when 'packed' then array['shipped', 'cancelled', 'on_hold']
    when 'shipped' then array['delivered']
    when 'on_hold' then array['placed', 'confirmed', 'cancelled']
    else array[]::text[] end;
  if not (p_status = any (allowed)) then
    raise exception 'An order that is % can''t be changed to %.', replace(o.status, '_', ' '), replace(p_status, '_', ' ') using errcode = '22023';
  end if;

  if p_status in ('placed', 'confirmed') and o.status = 'on_hold' and o.stock_state = 'released' then
    -- Taking an on-hold order back: hold the stock again (or explain).
    for it in select variant_id, qty, name from public.order_items where order_id = o.id and track_inventory and variant_id is not null loop
      update public.inventory set reserved = reserved + it.qty where variant_id = it.variant_id and on_hand - reserved >= it.qty;
      if not found then raise exception 'Not enough stock of % — add stock first.', it.name using errcode = '22023'; end if;
    end loop;
    update public.orders set stock_state = 'reserved' where id = o.id;
  end if;

  if p_status = 'shipped' then
    if o.stock_state <> 'reserved' then raise exception 'Stock for this order isn''t held — put it back to Confirmed first.' using errcode = '22023'; end if;
    -- Off the shelf for good: on hand and reserved both go down, recorded in stock history.
    for it in select variant_id, qty from public.order_items where order_id = o.id and track_inventory and variant_id is not null loop
      update public.inventory set on_hand = on_hand - it.qty, reserved = greatest(reserved - it.qty, 0) where variant_id = it.variant_id;
      insert into public.inventory_movements (variant_id, delta, reason, reference, note)
      values (it.variant_id, -it.qty, 'order', o.order_number, 'Shipped');
    end loop;
    update public.orders set stock_state = 'deducted', shipped_at = now() where id = o.id;
  elsif p_status = 'cancelled' then
    perform public.release_order_stock(o.id);
    update public.orders set cancelled_at = now(), cancel_reason = coalesce(nullif(trim(p_note), ''), 'Cancelled by the store'),
      payment_status = case when payment_status = 'pending' then 'failed' else payment_status end where id = o.id;
  elsif p_status = 'delivered' then
    update public.orders set delivered_at = now(), payment_status = case when payment_method = 'cod' then 'paid' else payment_status end,
      paid_at = coalesce(paid_at, case when payment_method = 'cod' then now() end) where id = o.id;
  end if;

  update public.orders set status = p_status where id = o.id;
  insert into public.order_events (order_id, status, note) values (o.id, p_status, nullif(trim(coalesce(p_note, '')), ''));
end $$;

create or replace function public.set_order_staff_note(p_order uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('orders.write') then raise exception 'You don''t have permission to update orders.' using errcode = '42501'; end if;
  update public.orders set staff_note = nullif(left(trim(coalesce(p_note, '')), 2000), '') where id = p_order;
end $$;

create or replace function public.update_checkout_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('settings.store') then raise exception 'You don''t have permission to change shipping settings.' using errcode = '42501'; end if;
  update public.store_settings set
    shipping_fee = (p ->> 'shipping_fee')::bigint,
    free_shipping_min = (p ->> 'free_shipping_min')::bigint,
    cod_enabled = (p ->> 'cod_enabled')::boolean,
    cod_fee = (p ->> 'cod_fee')::bigint,
    cod_max_total = (p ->> 'cod_max_total')::bigint,
    delivery_min_days = (p ->> 'delivery_min_days')::int,
    delivery_max_days = (p ->> 'delivery_max_days')::int;
  if (select delivery_min_days > delivery_max_days from public.store_settings) then
    raise exception 'The fastest delivery time can''t be longer than the slowest.' using errcode = '22023';
  end if;
end $$;

create or replace function public.set_online_payments(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('settings.payments') then raise exception 'Only a Super Admin can change payment settings.' using errcode = '42501'; end if;
  update public.store_settings set online_payments_enabled = p_on;
end $$;

-- ---------------------------------------------------------------- grants
grant select, insert, update, delete on public.addresses to authenticated;
grant select on public.orders, public.order_items, public.order_events to authenticated;
grant execute on function public.order_charges(bigint, text), public.checkout_quote(jsonb, text),
  public.place_order(jsonb), public.abandon_order(uuid, uuid), public.order_view(text, uuid) to anon, authenticated;
grant execute on function public.my_orders(), public.set_order_status(uuid, text, text),
  public.set_order_staff_note(uuid, text), public.update_checkout_settings(jsonb), public.set_online_payments(boolean),
  public.release_expired_orders() to authenticated;
-- Internal helpers and server-only payment functions: no browser access.
revoke execute on function public.release_order_stock(uuid), public.attach_razorpay_order(uuid, text),
  public.confirm_payment(text, text, bigint) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant execute on function public.attach_razorpay_order(uuid, text), public.confirm_payment(text, text, bigint),
      public.release_expired_orders(), public.abandon_order(uuid, uuid), public.order_view(text, uuid) to service_role';
  end if;
end $$;
-- Functions are executable by PUBLIC by default; tighten the internal ones above, keep the rest explicit.
revoke execute on function public.release_expired_orders() from public, anon;

-- Release unpaid orders every 5 minutes when pg_cron is available (Supabase: it is).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('release-unpaid-orders', '*/5 * * * *', 'select public.release_expired_orders()');
  end if;
exception when others then
  raise notice 'pg_cron not set up (%). Unpaid orders are still released when the next order is placed.', sqlerrm;
end $$;

-- >>>>>>>>>> migrations/0009_growth.sql
-- ============================================================================
-- 0009 Coupons, GST invoices, refunds, reports, bestsellers (Phase 7)
-- ============================================================================

-- ---------------------------------------------------------------- permissions
insert into public.role_permissions (role, permission) values
  ('super_admin', 'orders.refund'), ('store_manager', 'orders.refund')
on conflict do nothing;

-- ---------------------------------------------------------------- coupons
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  description text check (char_length(description) <= 200),
  kind text not null check (kind in ('percent', 'flat', 'free_shipping')),
  value bigint not null default 0 check (value >= 0),          -- percent: 1–90; flat: paise; free_shipping: 0
  min_subtotal bigint not null default 0 check (min_subtotal >= 0),
  max_discount bigint check (max_discount is null or max_discount > 0),  -- cap for percent coupons
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  usage_limit int check (usage_limit is null or usage_limit > 0),         -- total uses
  per_customer_limit int default 1 check (per_customer_limit is null or per_customer_limit > 0),
  first_order_only boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_percent check (kind <> 'percent' or value between 1 and 90),
  constraint coupons_flat check (kind <> 'flat' or value > 0),
  constraint coupons_window check (ends_at is null or ends_at > starts_at)
);
drop trigger if exists coupons_touch on public.coupons;
create trigger coupons_touch before update on public.coupons for each row execute function public.touch_updated_at();

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  phone text not null,
  email text not null,
  discount bigint not null check (discount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);

alter table public.orders add column if not exists coupon_code text;

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
-- Codes are private: shoppers can only *try* a code (through coupon_check), never list them.
drop policy if exists "coupons: staff" on public.coupons;
create policy "coupons: staff" on public.coupons for all
  using (public.has_permission('promotions.write')) with check (public.has_permission('promotions.write'));
drop policy if exists "coupon_redemptions: staff read" on public.coupon_redemptions;
create policy "coupon_redemptions: staff read" on public.coupon_redemptions for select
  using (public.has_permission('promotions.write') or public.has_permission('reports.view'));

-- Is this code valid for this order? Uses only count while their order isn't cancelled.
create or replace function public.coupon_check(p_code text, p_subtotal bigint, p_phone text default null,
  p_email text default null, p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.coupons; used int; disc bigint := 0; v_code text := upper(trim(coalesce(p_code, '')));
begin
  if v_code = '' then return jsonb_build_object('ok', false, 'message', 'Enter a coupon code.'); end if;
  select * into c from public.coupons where coupons.code = v_code;
  if not found or not c.is_active then return jsonb_build_object('ok', false, 'code', v_code, 'message', 'This coupon code isn''t valid.'); end if;
  if c.starts_at > now() then return jsonb_build_object('ok', false, 'code', v_code, 'message', 'This coupon isn''t active yet.'); end if;
  if c.ends_at is not null and c.ends_at <= now() then return jsonb_build_object('ok', false, 'code', v_code, 'message', 'This coupon has expired.'); end if;
  if p_subtotal < c.min_subtotal then
    return jsonb_build_object('ok', false, 'code', v_code, 'message',
      'Add items worth ₹' || to_char((c.min_subtotal - p_subtotal) / 100.0, 'FM999999990.##') || ' more to use this coupon.');
  end if;
  if c.usage_limit is not null then
    select count(*) into used from public.coupon_redemptions r join public.orders o on o.id = r.order_id
    where r.coupon_id = c.id and o.status <> 'cancelled';
    if used >= c.usage_limit then return jsonb_build_object('ok', false, 'code', v_code, 'message', 'This coupon has been fully used.'); end if;
  end if;
  if c.per_customer_limit is not null and (p_phone is not null or p_email is not null or p_user is not null) then
    select count(*) into used from public.coupon_redemptions r join public.orders o on o.id = r.order_id
    where r.coupon_id = c.id and o.status <> 'cancelled'
      and (r.phone = p_phone or r.email = lower(p_email) or (p_user is not null and r.user_id = p_user));
    if used >= c.per_customer_limit then return jsonb_build_object('ok', false, 'code', v_code, 'message', 'You''ve already used this coupon.'); end if;
  end if;
  if c.first_order_only and (p_phone is not null or p_email is not null or p_user is not null) and exists (
    select 1 from public.orders o where o.status not in ('cancelled', 'pending_payment')
      and (o.phone = p_phone or o.email = lower(p_email) or (p_user is not null and o.user_id = p_user))) then
    return jsonb_build_object('ok', false, 'code', v_code, 'message', 'This coupon is for first orders only.');
  end if;
  disc := case c.kind
    when 'percent' then least(floor(p_subtotal * c.value / 100.0)::bigint, coalesce(c.max_discount, p_subtotal))
    when 'flat' then c.value
    else 0 end;
  disc := least(disc, p_subtotal);
  return jsonb_build_object('ok', true, 'code', v_code, 'coupon_id', c.id, 'kind', c.kind, 'discount', disc,
    'free_shipping', c.kind = 'free_shipping', 'description', c.description,
    'message', case c.kind when 'percent' then c.value || '% off applied'
                           when 'flat' then '₹' || to_char(c.value / 100.0, 'FM999999990.##') || ' off applied'
                           else 'Free shipping applied' end);
end $$;

-- One pricing rule for the checkout page and the final order: items − coupon + shipping + COD fee.
-- Free shipping and the COD limit look at the amount after the coupon.
create or replace function public.price_order(p_lines jsonb, p_method text, p_coupon text default null,
  p_phone text default null, p_email text default null, p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q jsonb; c jsonb; cp jsonb := null; sub bigint; disc bigint := 0; ship bigint; cod bigint;
begin
  q := public.quote_cart(p_lines);
  sub := (q ->> 'subtotal')::bigint;
  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    cp := public.coupon_check(p_coupon, sub, p_phone, p_email, p_user);
    if (cp ->> 'ok')::boolean then disc := (cp ->> 'discount')::bigint; end if;
  end if;
  c := public.order_charges(sub - disc, p_method);
  ship := case when coalesce((cp ->> 'free_shipping')::boolean, false) and (cp ->> 'ok')::boolean then 0 else (c ->> 'shipping_fee')::bigint end;
  cod := (c ->> 'cod_fee')::bigint;
  return q || c || jsonb_build_object('discount', disc, 'shipping_fee', ship, 'coupon', cp, 'total', sub - disc + ship + cod);
end $$;

-- Checkout page totals. Per-customer coupon limits are checked when the order is placed, so this
-- can't be used to find out whether a phone number has ordered before.
drop function if exists public.checkout_quote(jsonb, text);
create or replace function public.checkout_quote(p_lines jsonb, p_method text default 'online', p_coupon text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.price_order(p_lines, p_method, p_coupon, null, null, auth.uid());
$$;

-- ---------------------------------------------------------------- place order (now with coupons)
create or replace function public.place_order(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  pr jsonb; ln jsonb; a jsonb; cp jsonb;
  method text := p ->> 'method';
  coupon text := nullif(upper(trim(coalesce(p ->> 'coupon', ''))), '');
  sub bigint; disc bigint; ship bigint; cod bigint; tot bigint;
  oid uuid; onum text; tok uuid;
  em text := lower(trim(p ->> 'email'));
  ph text := regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g');
  ok int;
begin
  perform public.release_expired_orders();

  -- ---- who and where
  if method not in ('online', 'cod') then raise exception 'Choose a payment method.' using errcode = '22023'; end if;
  if length(ph) = 12 and ph like '91%' then ph := substr(ph, 3); end if;
  if ph !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number.' using errcode = '22023'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(em) > 254 then raise exception 'Enter a valid email address.' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p ->> 'name', ''))) < 2 then raise exception 'Enter your name.' using errcode = '22023'; end if;
  a := p -> 'address';
  if a is null or coalesce(a ->> 'pincode', '') !~ '^[1-9][0-9]{5}$' then raise exception 'Enter a valid 6-digit PIN code.' using errcode = '22023'; end if;
  if char_length(trim(coalesce(a ->> 'line1', ''))) < 3 or char_length(trim(coalesce(a ->> 'city', ''))) < 2
     or char_length(trim(coalesce(a ->> 'state', ''))) < 2 then
    raise exception 'Please complete the delivery address.' using errcode = '22023';
  end if;
  if (select count(*) from public.orders where phone = ph and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Too many orders from this number in the last hour. Please try again later or message us on WhatsApp.' using errcode = '22023';
  end if;

  -- ---- price it again on the server (coupon row locked so its use limit can't be beaten by two orders at once)
  if coupon is not null then perform 1 from public.coupons where code = coupon for update; end if;
  pr := public.price_order(p -> 'lines', method, coupon, ph, em, auth.uid());
  if jsonb_array_length(pr -> 'lines') = 0 then raise exception 'Your cart is empty.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(pr -> 'lines') l where l ->> 'status' <> 'ok') then
    raise exception 'Some items in your cart changed. Please review your cart.' using errcode = 'P0001', hint = 'cart_changed';
  end if;
  cp := pr -> 'coupon';
  if coupon is not null and not coalesce((cp ->> 'ok')::boolean, false) then
    raise exception '%', coalesce(cp ->> 'message', 'This coupon code isn''t valid.') using errcode = 'P0001', hint = 'coupon';
  end if;
  sub := (pr ->> 'subtotal')::bigint; disc := (pr ->> 'discount')::bigint;
  ship := (pr ->> 'shipping_fee')::bigint; cod := (pr ->> 'cod_fee')::bigint; tot := (pr ->> 'total')::bigint;
  if method = 'cod' and not (pr ->> 'cod_allowed')::boolean then raise exception 'Cash on Delivery isn''t available for this order.' using errcode = '22023'; end if;
  if method = 'online' and not (pr ->> 'online_allowed')::boolean then raise exception 'Online payment isn''t available right now.' using errcode = '22023'; end if;
  if p ? 'expected_total' and (p ->> 'expected_total')::bigint <> tot then
    raise exception 'Prices changed while you were checking out. Please review the new total.' using errcode = 'P0001', hint = 'cart_changed';
  end if;

  -- ---- create the order
  insert into public.orders (user_id, status, payment_method, payment_status, customer_name, email, phone,
    shipping_address, subtotal, shipping_fee, cod_fee, discount, coupon_code, total, customer_note, expires_at, placed_at)
  values (auth.uid(), case when method = 'cod' then 'placed' else 'pending_payment' end, method,
    case when method = 'cod' then 'cod' else 'pending' end,
    trim(p ->> 'name'), em, ph,
    jsonb_build_object('full_name', trim(coalesce(a ->> 'full_name', p ->> 'name')), 'phone', ph,
      'line1', trim(a ->> 'line1'), 'line2', nullif(trim(coalesce(a ->> 'line2', '')), ''),
      'landmark', nullif(trim(coalesce(a ->> 'landmark', '')), ''), 'city', trim(a ->> 'city'),
      'state', trim(a ->> 'state'), 'pincode', a ->> 'pincode'),
    sub, ship, cod, disc, case when disc > 0 or coalesce((cp ->> 'free_shipping')::boolean, false) then cp ->> 'code' end,
    tot, nullif(left(trim(coalesce(p ->> 'note', '')), 500), ''),
    case when method = 'online' then now() + interval '30 minutes' end,
    case when method = 'cod' then now() end)
  returning id, order_number, access_token into oid, onum, tok;

  if coupon is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, phone, email, discount)
    values ((cp ->> 'coupon_id')::uuid, oid, auth.uid(), ph, em, disc);
  end if;

  -- ---- items + reserve stock
  for ln in select * from jsonb_array_elements(pr -> 'lines') loop
    insert into public.order_items (order_id, variant_id, product_id, sku, name, title, unit, qty, price, mrp, line_total, image_path, track_inventory)
    select oid, v.id, v.product_id, v.sku, ln ->> 'name', v.title, v.unit, (ln ->> 'qty')::numeric, v.price, v.mrp,
           (ln ->> 'line_total')::bigint, ln ->> 'image_path', v.track_inventory
    from public.product_variants v where v.id = (ln ->> 'variant_id')::uuid;

    if (select track_inventory from public.product_variants where id = (ln ->> 'variant_id')::uuid) then
      update public.inventory set reserved = reserved + (ln ->> 'qty')::numeric
      where variant_id = (ln ->> 'variant_id')::uuid and on_hand - reserved >= (ln ->> 'qty')::numeric;
      get diagnostics ok = row_count;
      if ok = 0 then
        raise exception 'Sorry — % just sold out. Please review your cart.', ln ->> 'name' using errcode = 'P0001', hint = 'cart_changed';
      end if;
    end if;
  end loop;

  insert into public.order_events (order_id, status, note) values (oid, case when method = 'cod' then 'placed' else 'pending_payment' end,
    case when method = 'cod' then 'Order placed — Cash on Delivery' else 'Waiting for online payment' end);

  if auth.uid() is not null then
    if coalesce((p ->> 'save_address')::boolean, false) and not exists (
      select 1 from public.addresses where user_id = auth.uid() and pincode = a ->> 'pincode' and lower(line1) = lower(trim(a ->> 'line1'))) then
      insert into public.addresses (user_id, full_name, phone, line1, line2, landmark, city, state, pincode, is_default)
      values (auth.uid(), trim(coalesce(a ->> 'full_name', p ->> 'name')), ph, trim(a ->> 'line1'), nullif(trim(coalesce(a ->> 'line2', '')), ''),
        nullif(trim(coalesce(a ->> 'landmark', '')), ''), trim(a ->> 'city'), trim(a ->> 'state'), a ->> 'pincode',
        not exists (select 1 from public.addresses where user_id = auth.uid()));
    end if;
    if method = 'cod' then delete from public.cart_items where user_id = auth.uid(); end if;
  end if;

  return jsonb_build_object('id', oid, 'order_number', onum, 'access_token', tok, 'total', tot,
    'status', case when method = 'cod' then 'placed' else 'pending_payment' end);
end $$;

-- ---------------------------------------------------------------- GST & invoices
alter table public.store_settings
  add column if not exists legal_name text check (char_length(legal_name) <= 120),
  add column if not exists gst_state text check (char_length(gst_state) <= 60),
  add column if not exists default_gst_rate numeric(4,2) not null default 5 check (default_gst_rate between 0 and 28),
  add column if not exists shipping_gst_rate numeric(4,2) not null default 18 check (shipping_gst_rate between 0 and 28),
  add column if not exists invoice_prefix text not null default 'SMC' check (invoice_prefix ~ '^[A-Z0-9-]{1,10}$');

alter table public.products
  add column if not exists gst_rate numeric(4,2) check (gst_rate is null or gst_rate between 0 and 28),  -- null = store default
  add column if not exists hsn text check (hsn is null or hsn ~ '^[0-9]{4,8}$');

alter table public.order_items
  add column if not exists gst_rate numeric(4,2),
  add column if not exists hsn text;

alter table public.orders
  add column if not exists invoice_number text unique,
  add column if not exists invoiced_at timestamptz,
  add column if not exists refunded_amount bigint not null default 0 check (refunded_amount >= 0);

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('pending', 'paid', 'failed', 'cod', 'refunded', 'partially_refunded'));

-- Each order line remembers the GST rate and HSN at the moment it was ordered.
create or replace function public.order_items_tax() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select coalesce(p.gst_rate, s.default_gst_rate), p.hsn into new.gst_rate, new.hsn
  from public.store_settings s left join public.products p on p.id = new.product_id limit 1;
  return new;
end $$;
drop trigger if exists order_items_tax on public.order_items;
create trigger order_items_tax before insert on public.order_items for each row execute function public.order_items_tax();

create table if not exists public.invoice_counters (fy text primary key, last int not null default 0);
alter table public.invoice_counters enable row level security;  -- only the trigger below touches it

-- The invoice is issued when goods are dispatched: SMC/2026-27/0001, one series per financial year.
create or replace function public.orders_invoice_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Kolkata')::date; v_fy text; n int; prefix text;
begin
  if new.status = 'shipped' and old.status is distinct from 'shipped' and new.invoice_number is null then
    v_fy := case when extract(month from d) >= 4
               then extract(year from d)::int || '-' || lpad(((extract(year from d)::int + 1) % 100)::text, 2, '0')
               else (extract(year from d)::int - 1) || '-' || lpad((extract(year from d)::int % 100)::text, 2, '0') end;
    insert into public.invoice_counters (fy, last) values (v_fy, 1)
    on conflict (fy) do update set last = invoice_counters.last + 1 returning last into n;
    select invoice_prefix into prefix from public.store_settings limit 1;
    new.invoice_number := coalesce(prefix, 'SMC') || '/' || v_fy || '/' || lpad(n::text, 4, '0');
    new.invoiced_at := now();
  end if;
  return new;
end $$;
drop trigger if exists orders_invoice_number on public.orders;
create trigger orders_invoice_number before update of status on public.orders for each row execute function public.orders_invoice_number();

create or replace function public.update_tax_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('settings.store') then raise exception 'You don''t have permission to change tax settings.' using errcode = '42501'; end if;
  update public.store_settings set
    gstin = nullif(upper(trim(coalesce(p ->> 'gstin', ''))), ''),
    legal_name = nullif(trim(coalesce(p ->> 'legal_name', '')), ''),
    gst_state = nullif(trim(coalesce(p ->> 'gst_state', '')), ''),
    address = coalesce(nullif(trim(coalesce(p ->> 'address', '')), ''), address),
    default_gst_rate = (p ->> 'default_gst_rate')::numeric,
    shipping_gst_rate = (p ->> 'shipping_gst_rate')::numeric,
    invoice_prefix = upper(trim(p ->> 'invoice_prefix'));
end $$;

create or replace function public.set_product_tax(p_product uuid, p_rate numeric, p_hsn text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('catalog.write') then raise exception 'You don''t have permission to edit products.' using errcode = '42501'; end if;
  update public.products set gst_rate = p_rate, hsn = nullif(trim(coalesce(p_hsn, '')), '') where id = p_product;
end $$;

-- Invoice data for the printable page: only once shipped, for the owner, staff or the private link.
create or replace function public.invoice_view(p_number text, p_token uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; s public.store_settings;
begin
  select * into o from public.orders where order_number = upper(p_number);
  if not found or o.invoice_number is null then return null; end if;
  if not (coalesce(o.access_token = p_token, false) or coalesce(o.user_id = auth.uid(), false)
          or coalesce(public.has_permission('orders.write'), false)) then return null; end if;
  select * into s from public.store_settings limit 1;
  return jsonb_build_object(
    'order', to_jsonb(o) - 'staff_note' - 'access_token',
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'image_path' order by i.name) from public.order_items i where i.order_id = o.id), '[]'),
    'seller', jsonb_build_object('name', coalesce(s.legal_name, s.name), 'trade_name', s.name, 'gstin', s.gstin,
      'state', s.gst_state, 'address', s.address, 'email', s.email, 'phone', coalesce(s.phone, s.whatsapp),
      'shipping_gst_rate', s.shipping_gst_rate));
end $$;

-- ---------------------------------------------------------------- refunds
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  amount bigint not null check (amount > 0),
  method text not null check (method in ('razorpay', 'manual')),
  razorpay_refund_id text unique,
  note text check (char_length(note) <= 300),
  actor_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists refunds_order_idx on public.refunds (order_id);
alter table public.refunds enable row level security;
drop policy if exists "refunds: staff read" on public.refunds;
create policy "refunds: staff read" on public.refunds for select
  using (public.has_permission('orders.write') or public.has_permission('reports.view'));

-- Record a refund (the app server has already sent it to Razorpay, or it was paid back by hand).
create or replace function public.record_refund(p_order uuid, p_amount bigint, p_method text,
  p_rzp_refund text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o record; paid bigint;
begin
  if not public.has_permission('orders.refund') then raise exception 'You don''t have permission to refund orders.' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  if o.payment_status not in ('paid', 'partially_refunded') then raise exception 'Only paid orders can be refunded.' using errcode = '22023'; end if;
  if p_method not in ('razorpay', 'manual') then raise exception 'Unknown refund method.' using errcode = '22023'; end if;
  if p_method = 'razorpay' and (o.payment_method <> 'online' or o.razorpay_payment_id is null) then
    raise exception 'This order wasn''t paid through Razorpay.' using errcode = '22023';
  end if;
  paid := o.total - o.refunded_amount;
  if p_amount is null or p_amount <= 0 or p_amount > paid then
    raise exception 'Refund must be between ₹0.01 and ₹%.', to_char(paid / 100.0, 'FM999999990.00') using errcode = '22023';
  end if;
  insert into public.refunds (order_id, amount, method, razorpay_refund_id, note) values (o.id, p_amount, p_method, p_rzp_refund, nullif(trim(coalesce(p_note, '')), ''));
  update public.orders set refunded_amount = refunded_amount + p_amount,
    payment_status = case when refunded_amount + p_amount >= total then 'refunded' else 'partially_refunded' end
  where id = o.id;
  insert into public.order_events (order_id, status, note) values (o.id, 'refunded',
    '₹' || to_char(p_amount / 100.0, 'FM999999990.00') || ' refunded' || case when p_method = 'razorpay' then ' to the original payment method' else '' end
    || coalesce(' · ' || nullif(trim(coalesce(p_note, '')), ''), ''));
  return jsonb_build_object('refunded', o.refunded_amount + p_amount, 'remaining', paid - p_amount);
end $$;

-- ---------------------------------------------------------------- reports
create or replace function public.sales_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.has_permission('reports.view') then raise exception 'You don''t have permission to view reports.' using errcode = '42501'; end if;
  with o as (
    select * from public.orders
    where status not in ('cancelled', 'pending_payment')
      and (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
  ), days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  )
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'sales', (select coalesce(sum(total), 0) from o),
    'discounts', (select coalesce(sum(discount), 0) from o),
    'shipping', (select coalesce(sum(shipping_fee + cod_fee), 0) from o),
    'refunds', (select coalesce(sum(amount), 0) from public.refunds where (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'items_sold', (select coalesce(sum(i.qty), 0) from public.order_items i join o on o.id = i.order_id),
    'customers', (select count(distinct phone) from o),
    'cancelled', (select count(*) from public.orders where status = 'cancelled' and (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'by_day', (select jsonb_agg(jsonb_build_object('day', days.day,
        'orders', (select count(*) from o where (o.created_at at time zone 'Asia/Kolkata')::date = days.day),
        'sales', (select coalesce(sum(total), 0) from o where (o.created_at at time zone 'Asia/Kolkata')::date = days.day)) order by days.day) from days),
    'by_method', (select coalesce(jsonb_agg(x), '[]') from (select payment_method as method, count(*) as orders, sum(total) as sales from o group by payment_method) x),
    'by_status', (select coalesce(jsonb_agg(x), '[]') from (select status, count(*) as orders from o group by status) x),
    'top_products', (select coalesce(jsonb_agg(x), '[]') from (
        select i.name, sum(i.qty) as qty, sum(i.line_total) as sales from public.order_items i join o on o.id = i.order_id
        group by i.name order by sum(i.line_total) desc limit 10) x),
    'coupons', (select coalesce(jsonb_agg(x), '[]') from (
        select coupon_code as code, count(*) as uses, sum(discount) as discount from o where coupon_code is not null
        group by coupon_code order by count(*) desc limit 10) x)
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------- bestsellers
-- Products ranked by what actually sold recently (ids only; no order data leaves this function).
create or replace function public.bestseller_ids(p_limit int default 8, p_days int default 90)
returns setof uuid language sql stable security definer set search_path = public as $$
  select i.product_id from public.order_items i
  join public.orders o on o.id = i.order_id
  join public.products p on p.id = i.product_id
  where o.status not in ('cancelled', 'pending_payment') and o.created_at > now() - make_interval(days => least(greatest(p_days, 1), 365))
    and p.status = 'active'
  group by i.product_id order by sum(i.qty) desc, max(o.created_at) desc
  limit least(greatest(p_limit, 1), 24);
$$;

-- ---------------------------------------------------------------- grants
grant select, insert, update, delete on public.coupons to authenticated;
grant select on public.coupon_redemptions, public.refunds to authenticated;
-- Internal helpers: reachable only through checkout_quote / place_order.
revoke execute on function public.coupon_check(text, bigint, text, text, uuid), public.price_order(jsonb, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.checkout_quote(jsonb, text, text), public.place_order(jsonb),
  public.invoice_view(text, uuid), public.bestseller_ids(int, int) to anon, authenticated;
grant execute on function public.update_tax_settings(jsonb), public.set_product_tax(uuid, numeric, text),
  public.record_refund(uuid, bigint, text, text, text), public.sales_report(date, date) to authenticated;
revoke execute on function public.order_items_tax(), public.orders_invoice_number() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.orders to service_role';
    execute 'grant execute on function public.invoice_view(text, uuid) to service_role';
  end if;
end $$;

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

-- >>>>>>>>>> seed.sql
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
