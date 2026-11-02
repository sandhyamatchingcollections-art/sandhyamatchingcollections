# Phase 2 report — UI and design system

## Implemented
- Pastel design system (tokens in globals.css), Cormorant Garamond + Inter, self-hosted fonts, focus states, reduced-motion support.
- Header: announcement bar, logo (auto-detects public/logo.png), search, account/wishlist/cart with live counts, desktop mega menu, mobile drawer — all built from the category tree, not hardcoded.
- Homepage rendered from an ordered section list: Hero, Shop by Budget, Bridal feature, Kurta feature, New Arrivals, Customer Favourites, Promo. Sections with no content hide themselves; the promo banner hides when no offer is active.
- Real destinations for every CTA: /c, /c/[slug], /collections/[slug], /budget/[range], /p/[slug], /search, /cart, /wishlist, /offers, /account, /pages/[slug].
- Budget pages filter on current selling price (strictly below the cap), with the overlap explained and an empty state.
- Fabric quantities in 0.5 m steps on the product page.
- Guest cart and wishlist in localStorage (display only; server pricing comes later).
- Footer with the store's real Instagram, WhatsApp, tagline and shipping note; missing details (email, address, Facebook, payment logos) are hidden rather than invented.
- Floating WhatsApp button, robots.txt excluding private routes.
- Admin shell: sidebar of all 20 modules, dashboard tiles with no fake numbers, per-module placeholders. /admin returns 404 in production unless ADMIN_PREVIEW=1.

## Checked
- `npm run build` passes (types + lint).
- All storefront and admin routes return 200 in dev.
- No horizontal overflow at 390px and 1440px.

## Not done yet (by design)
- Database: products, categories and homepage config come from `src/server/catalog/dev-seed.ts`. Sample products are prefixed "Sample ·" and must not go live. Phase 3 replaces each catalog function with a Supabase query of the same signature.
- Images: abstract pastel placeholders stand in for photos; the owner uploads real photos from the admin (Phase 4/8).
- Auth, checkout, payments, coupons, orders, real filters/sorting, product gallery/variants, newsletter, sitemap: Phases 3–8.
- No automated test suite yet (starts in Phase 3 with RLS and pricing tests).
