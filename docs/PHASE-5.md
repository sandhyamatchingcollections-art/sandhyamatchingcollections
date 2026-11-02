# Phase 5 report: shopping experience

## What shoppers can now do

| Area | What it does |
| --- | --- |
| **Category, collection, budget and All Products pages** | Filters for price range, In stock only, and each category's own filters (Fabric, Colour, Size…), with counts. Sorting by Featured, Newest, Price low→high and high→low. Active-filter chips, pagination, and helpful empty states. On phones, filters open as a panel. Every filter is in the link, so filtered pages can be shared or bookmarked. |
| **Search** | Suggestions as you type: products, categories and recent searches. Works with the keyboard and screen readers. Results ranked by relevance, plus related categories. Matches names, SKUs, descriptions and filter values. |
| **Product page** | Photo gallery with thumbnails, zoom and full-screen view. Colour/size choices that show each option's price and stock; sold-out options are struck through. "Only 3 left" for low stock. Quantity control that only offers allowed amounts (fabric from the minimum, in steps, never above stock). Buy now. PIN-code check with an estimated delivery time. Returns note. WhatsApp enquiry. "You may also like" and "Recently viewed". Google-ready product data (price, stock, breadcrumbs). |
| **Product cards** | Products with several colours/sizes show **Choose options**; single items add straight to the cart at their minimum quantity. "Price on request" items link to the product page. |
| **Cart** | The server checks every price and quantity, every time. If stock drops, a limit changes or an item is taken off sale, the cart corrects itself and says why. For signed-in customers the cart is **saved to their account**: it follows them across devices and merges with what they added before signing in. Signing out clears the cart on that device. **Order on WhatsApp** sends an itemised list with SKUs and subtotal. |

The **Checkout** button stays disabled ("Online payment is coming soon") until Phase 6 adds addresses, shipping and Razorpay.

## Database changes (`supabase/migrations/0007_shopping.sql`)

- `browse_products`, `listing_facets`, `search_suggestions`: filtering, sorting, counts and suggestions, all done in the database.
- `product_detail` and `related_products`, both for the product page.
- `quote_cart`: the single source of truth for cart prices and quantities.
- `cart_items` table: each customer can see only their own saved cart. `save_my_cart` saves it.
- `store_settings` gets delivery days (default 4–8) and a returns note. These have no admin screen yet (that comes with the CMS phase). To change them now, run this in the SQL Editor:
  `update store_settings set delivery_min_days = 3, delivery_max_days = 7, returns_note = 'Easy 7-day exchange on unused items.';`

**Your database:** run `supabase/updates/phase-5-run-once.sql` once. New projects: `SETUP-run-in-sql-editor.sql` now includes it.

## Tested

- `npm run test:db`: **65 database checks** pass (12 new: filters, facets, search, product detail, cart quantity rules, saved-cart privacy).
- **Browser tests: 112 checks** across 5 suites, all passing. The new `e2e-shopping.py` covers:
  - size and price filters, sorting, and the budget page
  - search suggestions → results, and searches with no results
  - colour choice with a sold-out option, the stock cap on quantity, and 1.5 m of fabric
  - the cart total (₹4,266), auto-correction when stock drops or a product goes off sale, and the WhatsApp message
  - the saved cart showing on a second device, and clearing on sign-out
  - phone filters, and no sideways scrolling
- `npm run build` and lint pass.

### Bug the tests caught (fixed)
- On phones, the product page was slightly wider than the screen: the title and buttons were cut off.
