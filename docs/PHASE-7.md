# Phase 7 report: coupons, invoices, refunds, emails and reports

## What's new

| Area | What it does |
| --- | --- |
| **Coupons** (Admin → Coupons & Discounts) | Percent off (with an optional maximum), rupees off, or free shipping. Optional minimum order, start/end dates, total uses, uses per customer (matched by phone or email), first order only. Shows uses and the total discount given. A used coupon is switched off rather than deleted, so past orders keep their record. |
| **Coupon at checkout** | "Coupon code" box in the order summary with a clear reason if a code can't be used (expired, minimum not reached, already used…). Uses on cancelled orders don't count. Free shipping and the COD limit look at the amount after the discount. |
| **Offers** (Admin → Offers & Campaigns) | Announcements with start/end dates, shown in the homepage offer banner while live. |
| **GST invoices** | Created automatically when an order is **marked shipped**, numbered `SMC/2026-27/0001`, a new series each financial year. Printable / Save as PDF from the customer's order page and from the admin. Shows your GSTIN, HSN codes, taxable value, and CGST + SGST (same state) or IGST (other state). Coupons are shared across the lines; amount in words. |
| **Tax settings** (Admin → Tax) | GSTIN, legal name, registered state, business address, default GST rate, GST on shipping, invoice prefix. Each product can have its own rate and HSN code (product form → "Tax (GST)"). |
| **Refunds** | On a paid order: refund all or part back to the customer's card/UPI through Razorpay, or record a refund paid by hand. You can never refund more than was paid. Super Admin and Store Manager only. |
| **Order emails** | To the customer: confirmed, shipped (with your courier/tracking note), delivered, cancelled, refund. To you: "New order" for every order. Sent through Resend; skipped if not set up. |
| **WhatsApp updates** | "Send update on WhatsApp" on each order opens a ready-made message for the order's current step (with the tracking link). |
| **Reports** (Admin → Reports & Analytics) | Last 7/30/90 days, this or last month, or any dates. Shows sales, average order, items sold, refunds and coupon savings. Also a sales-per-day chart (with a table view), best-selling products, payment methods, order status and coupons used. |
| **Real bestsellers** | The homepage "Bestsellers" section now lists what actually sold in the last 90 days once at least 4 products have sold; until then it uses your hand-picked list. |

## Database (`supabase/migrations/0009_growth.sql`)
- **Coupons:** tables `coupons` and `coupon_redemptions`. Shoppers can't list codes; they can only try one.
- **Pricing:** a single function prices both the checkout page and the final order, so the two can't disagree.
- **Coupon limits:** per-customer limits are checked only when an order is placed, so trying a code can't reveal whether a phone number has ordered before.
- **GST and invoices:**
  - new GST columns on store settings, products and order lines; each order line remembers its rate and HSN
  - invoice numbers are given out automatically when an order ships
  - `invoice_view` is private in the same way as the order page
- **Refunds:** `refunds` table and `record_refund`, under a new permission `orders.refund`.
- **Reports and bestsellers:** `sales_report` (staff with report rights only) and `bestseller_ids`, which returns product IDs only.

## Tested
- `npm run test:db`: **92 database checks** (11 new), covering:
  - coupon rules and privacy, usage limits, and cancelled orders freeing a use
  - GST snapshots, invoice numbering and privacy
  - refund permissions and limits, report figures, bestsellers, and tax settings
- **Browser tests: 190 checks** across 8 suites, all passing. The new `e2e-growth.py` covers:
  - creating a coupon and an offer in the admin; tax settings; product GST
  - checkout with a bad code, then a good code (₹1,059 → ₹961), and reuse refused
  - confirmation, store, shipped and refund emails
  - the WhatsApp link, and the invoice: private, GSTIN, CGST/SGST, totals and amount in words
  - a Razorpay partial refund and an over-refund refused
  - reports matching the orders, and the homepage bestsellers following real sales
- `npm run build` and lint pass; no secret appears in browser code.

## Please check with your accountant
GST rates depend on the product and sometimes its price (for example clothing under/over ₹1,000, jewellery 3%, cosmetics 18%). The defaults are 5% for products and 18% on shipping. Set the right rate and HSN code on each product before launch.

## Next: Phase 8 (content and customers)
- **Store content:** edit the homepage, banners, store settings, FAQ and policy pages, plus SEO settings and a sitemap.
- **Customers:** a customer list, an admin dashboard and the audit log.
- **Reviews and ratings.**
