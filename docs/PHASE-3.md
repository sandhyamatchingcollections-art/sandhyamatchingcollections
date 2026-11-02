# Phase 3 report — Database and sign-in

## Implemented

**Database (supabase/migrations)**
- `0001_core_schema.sql` — 18 tables: profiles, user_roles, role_permissions, categories (nested up to 4 levels, loop-proof),
  category_attributes, products, product_categories, product_variants (paise prices, metre/yard steps), product_images,
  product_attribute_values, inventory, inventory_movements, collections, collection_products, promotions,
  store_settings, homepage_sections, audit_logs. Plus the `product_cards` storefront view, `adjust_stock()`,
  `category_product_ids()`, automatic profile creation, publish dates and audit triggers.
- `0002_row_level_security.sql` — RLS on every table; 4 roles mapped to 11 permissions in the database.
  Visitors never see drafts, hidden categories, stock numbers, staff or other customers. Stock changes only through
  `adjust_stock()` (which logs history). Payment methods change only through a Super Admin-only function.
- `0003_storage.sql` — image buckets (public read, staff-only upload; 5 MB, JPEG/PNG/WebP) and a private bucket for
  customers' custom-print references.
- `0004_staff_management.sql` — add/remove staff by email; the last Super Admin can't be removed.
- `seed.sql` — your real store details, 7 categories + 13 subcategories, filters, 4 collections, 7 homepage sections.
  **No products** — those are added from the admin (Phase 4).

**App**
- Storefront reads from Supabase whenever `.env.local` is set (falls back to sample data only in local development).
- Homepage section settings are validated; a broken section hides itself instead of breaking the page.
- Email sign-in links (`/login`), account page with editable name and mobile number, sign out.
- Admin requires sign-in and a staff role; the menu shows only the modules your role allows.
- Admin → Staff & Roles works end to end (list, add by email, remove).
- Security headers; sign-out is POST-only; sign-in redirects can't be pointed at other websites.

## Tested

- `npm run test:db` — **38 automated checks pass** against the real migration files in a local Postgres
  (visitor, customer, product manager, order manager and Super Admin scenarios; nesting, slugs, safe delete,
  fabric quantities, stock history, staff management). Deliberately breaking two security rules made 5 checks fail,
  confirming the tests catch regressions.
- `npm run build` passes (types + lint).
- Signed-out visits to /admin redirect to /login; an off-site `next=` link is ignored.

## Not tested here

This workspace can't reach supabase.co, so the app has **not** yet run against your live project.
The first real check is steps 1–5 of `docs/SETUP-SUPABASE.md`.

## Environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL` (all public; already in `.env.local`).

## Still to come

- Phase 4: admin screens for categories, products, variants, image upload, stock, CSV import.
- Bestsellers use the admin-picked "bestsellers" collection until real orders exist (Phase 7).
- Customer emails use Supabase's limited default sender until you add SMTP.
