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
