# Phase 4 report — Categories, products, photos and stock

## What the owner can now do in the admin (no code changes)

| Screen | What it does |
| --- | --- |
| **Categories** | Create, nest up to 4 levels, rename, reorder (↑ ↓), hide/show, photo + banner, filters (e.g. Fabric, Colour) that also apply to subcategories, SEO. Deleting a category that has products or subcategories asks where to move them first — nothing is lost. |
| **Products** | Create/edit with any number of variants (colour, size, SKU, price, MRP, unit). Fabrics sold per metre or yard with a minimum and step (e.g. from 1 m in 0.5 m steps). Opening stock, weight, "on sale" and "track stock" per variant. Several categories with one main one, collections, filters, SEO, Featured, "Price on request" (WhatsApp enquiry instead of Add to Cart). Draft / Live / Archived. Duplicate. |
| **Photos** | Upload several at once; phone photos are shrunk in the browser, then checked by their contents and re-saved as WebP with location data removed. Reorder, describe, delete. |
| **Product list** | Search by name or SKU, filter by status and category, select many and change status, add/remove a category, or change prices by a percentage (selling price and MRP together, rounded to whole rupees). |
| **Inventory** | Every variant's stock with Low / Out-of-stock tabs; add, remove or set stock with a note; full history of who changed what and why; a low-stock alert level per item. |
| **Featured collections** | Bridal, Kurtas, Premium Picks, Bestsellers (and new ones): add products, put them in order, show or hide. The homepage and collection pages follow this order. |
| **CSV import / export** | Download a template, fill it in Excel, upload. A preview marks every row New / Update / Skip / Error with the reason, and nothing is saved until the file is clean. Optionally update price, MRP and stock of existing SKUs. Export everything to CSV any time. |

On the store: product pages show the real photo, the correct minimum and steps for fabrics, and "Price on request" products show a WhatsApp enquiry button.

## Database changes

`supabase/migrations/0005_catalog_management.sql` adds `save_product`, `duplicate_product`, `delete_category` (with safe move),
`reorder_categories`, `bulk_update_products`, `import_products`, and staff-only views `admin_products` and `admin_stock`.
Each runs as one transaction with the signed-in person's rights, so the security rules from Phase 3 still apply.

- **Already set up Phase 3?** Run `supabase/updates/run-this-once.sql` once in the SQL Editor (adds Phase 4 and the permission grants newer Supabase projects need).
- **New project?** `supabase/SETUP-run-in-sql-editor.sql` now includes everything.

## Tested

- `npm run test:db` — **52 database checks** pass (38 from Phase 3 + 14 new: product save/edit/duplicate, safe delete, reorder, bulk edits, CSV import all-or-nothing, staff-only lists).
- **Browser tests: 85 checks** across 4 suites, run in Chromium against a real Postgres 17 + PostgREST with these exact migration files
  (see `tests/e2e/README.md`). They include the brief's scenario end to end: create "Designer Blouse Materials" → "Printed Fabrics" →
  product with two colours, fabric steps, opening stock and photos → visible in the category, Under ₹200, Bridal and New Arrivals.
- `npm run build` and lint pass.

### Bugs the browser tests caught and that are fixed
- Typed values vanished from forms after a validation error (React 19 resets forms) — account, staff, category and product forms now keep them.
- Removing the last Super Admin crashed the page instead of explaining why.
- The "New product" page crashed (server called a browser-only helper).
- Saving a product twice could have tried to re-create new variants (form now reloads after each save).
- The SKU suggestion mixed itself into what you typed — it is now a hint used only when the box is left empty.
- Removing more stock than available showed a misleading "reserved by orders" message.

## Limits and notes

- Auth and Storage were tested against a stand-in that imitates Supabase; your live project is still the final check (steps in `docs/SETUP-SUPABASE.md`).
- CSV import creates one product per row (one variant). Add more colours/sizes on the product page afterwards.
- Bestsellers stay hand-picked until online orders exist (Phase 7).
- `npm audit` reports 2 warnings in a library bundled inside Next.js that only processes the store's own stylesheet; fixed by the next major Next.js upgrade (planned for Phase 9).

## Next: Phase 5 — shopping

Category filters from the category's filters, sorting, search suggestions, a full product page (gallery with zoom, choose colour/size,
PIN-code check, related products), and the server-side cart.
