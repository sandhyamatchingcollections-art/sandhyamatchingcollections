# Phase 8 report: homepage, content, customers and reviews

## New on the homepage
| Section | What it is |
| --- | --- |
| **Bridal showcase** | An arched bridal photo framed in thin gold lines, with the eight things a bride needs around it: silk sarees, designer blouses, blouse fabrics, jewellery, bangles, hair accessories, makeup, and lining and finishing. Each one is numbered and links to its category. |
| **Meet the founder** | The owner's portrait, a quote, the store's story, her name in a signature style, and "Chat with us" / "Follow on Instagram" buttons. |
| **Image banners** | A swipeable slider under the main banner, with arrows, dots and auto-advance (it pauses when someone hovers and respects reduced-motion settings). Each banner can have a separate phone photo, optional text and a button, a link, and start/end dates. |

Until photos are uploaded, soft pastel placeholders show, so nothing ever looks broken.

**Homepage order:** main banner → image banners → shop by budget → bridal showcase → bridal picks → kurtas → new arrivals → meet the founder → favourites → offers.

## New in the admin
| Screen | What it does |
| --- | --- |
| **Dashboard** | A greeting with a to-do list (new orders to confirm, orders to ship, on hold, out of stock, running low, reviews to approve), sales for today, the last 7 and 30 days, customers, products live, and the latest orders. Each person sees only what their role allows. |
| **Homepage** | Edit any section's text, photos and buttons; show or hide it; move it up or down. Links can only point to pages on your own site. |
| **Promotional Banners** | Upload, order, schedule and switch banners on or off. |
| **Pages & Policies** | FAQ, contact, shipping, returns, privacy and terms. Starter drafts are ready, with a live preview. Simple formatting: headings, lists, bold, links. A page only appears after you publish it. |
| **SEO Settings** | Google title and description with a live Google-style preview, plus the image shown when your site is shared on WhatsApp or Facebook. There's also a sitemap for Google. |
| **Store Settings** | Name, tagline, the announcement bar, shipping and returns lines, WhatsApp, Instagram, Facebook, email, phone, address, and how many days count as "new arrivals". |
| **Customers** | Everyone who has ordered, grouped by phone number, with how many orders they placed, how much they spent, their city and their last order, plus quick links to their orders and to WhatsApp. |
| **Reviews & Ratings** | Approve or hide reviews. Only customers whose order was **delivered** can review ("Verified buyer"), and reviews show only after you approve them. |
| **Audit Log** | Who changed what and when: products, prices, settings, banners, coupons, refunds, pages and staff. |

## Other improvements
- **Product pages:** star rating under the title, a review summary and list, and a review form for verified buyers. The rating also appears in Google results.
- **Product thumbnails:** the bridal and kurta sections now show product photos (they showed placeholders before).

## Database (`supabase/migrations/0010_content.sql`)
- **New tables:** `banners`, `content_pages` (with starter drafts) and `product_reviews`.
  - Who wrote a review is never exposed publicly; only their display name is.
- **New homepage section types:** the bridal showcase, the founder section and image banners.
- **New functions:**
  - `update_store_settings`, `update_seo_settings` and `reorder_home_sections`
  - `submit_review`, `my_review`, `product_rating` and `set_review_status`
  - `admin_customers` and `admin_dashboard`
- **More of the audit log:** coupons, banners, refunds, review decisions and pages are now recorded.

## Tested
- `npm run test:db`: **100 database checks** (8 new), covering:
  - section order and permissions, banners only visible while live, pages hidden until published
  - settings permissions, reviews only after a delivered order, approval, reviewer privacy and ratings
  - customer totals, dashboard blocks per role, and the audit trail
- **Browser tests: 218 checks** across 9 suites, all passing. The new `e2e-content.py` uses the admin like the owner will:
  - uploads the founder and bridal photos, renames a bridal item, and is refused when linking to another site
  - hides and reorders sections, adds two banners and uses the slider
  - sets the announcement bar, the WhatsApp number and SEO (title and share image)
  - writes and publishes the FAQ, then a customer reviews after delivery and the owner approves
  - checks customers, the dashboard, the audit log, the sitemap and the phone layout
- `npm run build` and lint pass; no secret appears in browser code.

### Bugs the tests caught (fixed)
- On a brand-new database, the new homepage sections would have been added at the bottom of the page. The starter data now uses the same order as existing stores.
- The bridal and kurta feature sections showed placeholders instead of product photos.

## Speed update
- **Shared store data is now kept briefly** (settings, menu, homepage, banners, product lists and pages): for up to 60 seconds, or 30 seconds where stock is shown. Repeat page visits went from 17 Supabase calls (homepage), 5 (category) and 8 (product page) to **zero**.
  - **Any save in the admin clears this immediately**, so changes show on the store straight away.
  - **Carts, checkout and orders are always live.**
  - Change how long data is kept with `STORE_CACHE_SECONDS` in `.env.local`; 0 turns it off.
- **Sign-in is checked locally:** the sign-in token's signature is verified with Supabase's public keys (`getClaims`), without asking Supabase on every tap. Admin permissions are still checked in the database.
- **Taps get instant feedback:** a slim rose progress bar runs while the next page loads.
- **Tested:** `e2e-cache.py` checks that repeat visits need no Supabase calls, that admin changes (announcement, price, hiding a section) show immediately, and that the cart stays live. All 225 browser checks pass.
- **`npm run dev` is still slower than the live site.** It builds each page on first open and doesn't preload links. Run `npm run build` then `npm run start` to feel the real speed.

## Next: Phase 9 (launch)
- security review, speed and image checks, and a Next.js upgrade
- error monitoring
- deploying to Vercel (Mumbai) with your domain
- live Razorpay keys and webhook
- your own email sender for sign-in emails
- a final full test on the live site
