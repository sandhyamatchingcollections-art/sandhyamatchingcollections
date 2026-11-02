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
