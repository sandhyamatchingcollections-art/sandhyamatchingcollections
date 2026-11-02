# Phase 6 report: checkout, orders and payments

## What's new for customers

| Area | What it does |
| --- | --- |
| **Checkout** (`/checkout`) | One page: contact, delivery address (all states, 6-digit PIN), note for the store, payment method, live order summary. Guests can check out without an account. Signed-in customers can pick a saved address and save new ones. |
| **Shipping** | Flat charge (default ₹79), free from a set subtotal (default ₹999), with a "Add ₹X more for free shipping" nudge. |
| **Cash on Delivery** | On by default for orders up to ₹5,000 (change in Admin → Shipping), with an optional COD charge. |
| **Pay online** | Razorpay (UPI, cards, net banking, wallets). Shown only when the keys are set up. |
| **Order page** | Thank-you page with order number (SMC10001…), items, address, totals and a progress timeline. A private link lets guests come back; signed-in customers see all orders in **My orders**. |
| **Safety** | Prices, shipping and stock are re-checked on the server when the order is placed. If anything changed, nothing is charged and the shopper goes back to the cart with the reason. Two people can't buy the last piece. |

## What's new for the store

| Screen | What it does |
| --- | --- |
| **Admin → Orders** | Tabs: New, To ship, Shipped, Delivered, On hold, Awaiting payment, Cancelled. Search by order number, phone or name. |
| **Order detail** | Confirm → Packed → Shipped (with courier/tracking note) → Delivered. Cancel with a reason. Call or WhatsApp the customer in one tap. Private staff note. Full history of who changed what. |
| **Admin → Shipping** | Shipping charge, free-shipping amount, COD on/off, COD charge, COD limit, delivery days. |
| **Admin → Payments** | Shows which Razorpay keys are set (and test or live mode), the webhook address, and an on/off switch for online payment. |

**How stock works now:**
- When an order is placed, its items are **held**: they no longer show as available to others.
- When it's **shipped**, they come off the shelf for good, and the stock history records the order number.
- **Cancelling** before shipping puts them back.
- An unpaid online order is cancelled automatically after **30 minutes**, and its stock is released.

## Payment security
- Prices never come from the browser.
- An order is marked paid only by the server, after it checks Razorpay's signature. A forged "payment successful" message from a browser is rejected; the tests check this.
- Razorpay webhooks are a backup in case the shopper closes the tab right after paying. They are signed, and receiving the same one twice is harmless.
- If a payment arrives after the 30 minutes and the item has sold out meanwhile, the order goes **On hold** for you to restock or refund. It's never silently oversold.
- Secrets (`SUPABASE_SECRET_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) live only in `.env.local` and Vercel. The build was checked: none of them appear in code sent to browsers.

## Also in this update
- **Photos on the New product form:** pick photos (reorder, remove) before the first save. They upload as soon as the product is created.
- **Faster `npm run dev`:** it now uses Turbopack, so first page loads take about 1 s instead of 3–7 s.
- **Supabase moved to Mumbai** (`.env.local` updated) to cut the delay on every page.

## Database (`supabase/migrations/0008_checkout.sql`)
- **New tables:** `addresses`, `orders`, `order_items` and `order_events`. Customers see only their own; staff with order rights see all.
- **New functions:** `checkout_quote`, `place_order`, `confirm_payment` (server only), `set_order_status`, `order_view` and `release_expired_orders`. The last one runs every 5 minutes through pg_cron where available.
- **Store settings:** new columns for shipping and COD.

## Tested
- `npm run test:db`: **81 database checks** (16 new), covering:
  - shipping and COD rules, server-side prices, and the last-piece race
  - browsers being unable to mark an order paid, and a payment never being counted twice
  - wrong-amount payments going on hold, the 30-minute expiry, and late payments
  - order privacy, the staff workflow with stock, and the spam limit
- **Browser tests: 158 checks** across 7 suites, all passing. The new `e2e-checkout.py` runs against a pretend Razorpay and covers:
  - COD and online orders, the shopper closing the payment window, forged payments and webhooks
  - Razorpay being down, and stock dropping while the shopper is on the checkout page
  - saved addresses, My orders, and the admin flow: confirm, ship (stock deducted), deliver (COD paid), cancel (stock back)
  - staff notes staying private, shipping settings applying at checkout, and phone layout
- `npm run build` and lint pass.

### Bugs the tests caught (fixed before delivery)
- **Security:** an order page could have opened without the private link, because an unknown value slipped past the check. It now fails closed.
- On a brand-new database, the default free-shipping amount and COD limit were not saved. They are now built into the table.

## Not in this phase (Phase 7)
Order emails/WhatsApp notifications, invoices, coupons and offers, refunds from the admin, and sales reports.
