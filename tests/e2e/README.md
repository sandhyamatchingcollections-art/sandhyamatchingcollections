# Browser tests against a local Supabase stand-in

These tests drive the real app in a real browser against a **real Postgres + PostgREST** with your
migrations applied — the same engine Supabase uses — plus a small stand-in for Supabase Auth
(sign-in links are written to `.run/mailbox.log` instead of emailed) and Storage.

They are for developers. The shop owner never needs them.

## One-time setup (Linux or macOS)

```bash
cd tests/e2e
npm install                                  # embedded Postgres, pg, jsonwebtoken
pip install playwright pillow && python -m playwright install chromium
# PostgREST binary (https://github.com/PostgREST/postgrest/releases), e.g. Linux x64:
mkdir -p .run && curl -L https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz | tar xJ -C .run
```

`psql` must be on your PATH (used by the tests to check the database directly).

## Run

```bash
./tests/e2e/run-all.sh        # starts the app on :3200 and a fresh database before each suite
```

| Suite | What it proves |
| --- | --- |
| e2e-auth | sign-in links, profile, admin gate, staff roles, last Super Admin protection |
| e2e-categories | create/nest/hide/reorder/delete-with-move categories, filters, photo upload |
| e2e-products | the brief's scenario: new category → product with photos and fabric stock → visible on the store; duplicate, bulk edits, validation |
| e2e-stock-csv | stock changes and history, collections, CSV export, CSV import with preview and row errors |
| e2e-content | homepage editor (founder photo, bridal showcase, hide/reorder), image banners, store settings, SEO, pages, reviews, customers, dashboard, audit log, sitemap |
| e2e-growth | coupons and offers (admin and checkout), order emails, GST invoices, Razorpay refunds, reports, real bestsellers |
| e2e-checkout | COD and online checkout (pretend Razorpay), cancelled/forged payments, webhooks, saved addresses, admin order workflow and stock |
| e2e-new-product-photos | photos chosen on the New product form upload after create; bad files reported |
| e2e-shopping | filters, sort, search suggestions, colour options, fabric quantities, server-checked cart, saved cart across devices, WhatsApp order, phone layout |

Note: Postgres refuses to run as root. As root, put this folder somewhere the `postgres` user can read.


Checkout tests use a pretend Razorpay: the local gateway answers `/razorpay/v1/orders` and the browser's `checkout.razorpay.com` script is swapped for a test window that signs with the test secret. `run-all.sh` starts the app with test keys (`rzp_test_local`, `sb_secret_localtest`); nothing real is contacted.
