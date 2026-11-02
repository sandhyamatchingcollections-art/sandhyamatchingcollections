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
