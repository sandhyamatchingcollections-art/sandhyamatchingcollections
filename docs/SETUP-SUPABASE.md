# Connecting your Supabase project (one-time, about 10 minutes)

Your project (Mumbai, ap-south-1): `https://vsbdaxpbfzmnmenkcyjt.supabase.co`, already filled in `.env.local`.

## 1. Create the database

> **New project?** Run only the setup file below. It already includes every phase so far (0001–0010).
>
> **Database set up in an earlier phase?** Instead run only the update files you haven't run yet, in order
> (SQL Editor → New query → paste → Run), then skip to step 4:
> 1. `supabase/updates/run-this-once.sql` (Phase 4)
> 2. `supabase/updates/phase-5-run-once.sql` (Phase 5)
> 3. `supabase/updates/phase-6-run-once.sql` (Phase 6)
> 4. `supabase/updates/phase-7-run-once.sql` (Phase 7)
> 5. `supabase/updates/phase-8-run-once.sql` (Phase 8)

1. Open your project at supabase.com → **SQL Editor** → **New query**.
2. Open `supabase/SETUP-run-in-sql-editor.sql` from this project, copy **everything**, paste it in, click **Run**.
3. You should see **"Success. No rows returned"**. Run it only once.

Check it worked — run this in a new query:

```sql
select (select count(*) from categories) as categories,       -- expect 20
       (select count(*) from homepage_sections) as sections,  -- expect 7
       (select name from store_settings) as store;            -- Sandhya Matching Collections
```

## 2. (Optional) Add sample products for testing

Paste and run `supabase/test-data-phase5.sql`. It adds 21 products whose names start with
"Sample ·" (colours, sizes, fabrics by the metre, sold-out items, price on request) and a sample offer.
Remove them before launch:

```sql
delete from products where slug like 'sample-%';
delete from promotions where title like 'Sample ·%';
```

## 3. Allow sign-in links to come back to your site

**Authentication → URL Configuration**

- **Site URL:** `http://localhost:3000` (change to your real domain at launch)
- **Redirect URLs → Add URL:** `http://localhost:3000/**`
  (at launch, also add `https://yourdomain.com/**`)

Email sign-in is on by default (**Authentication → Sign In / Providers → Email**). Nothing to change.

> Supabase's built-in email sender is limited to a few emails per hour — fine for testing.
> Before launch, add your own email sender under **Authentication → Emails → SMTP Settings**
> (for example Resend, Brevo or Zoho Mail).

## 4. Run the store and sign in

```bash
npm install
npm run dev
```

Open http://localhost:3000/login, enter **your** email, and click the link in the email
(open it in the same browser). You'll land on **My Account**.

## 5. Make yourself the Super Admin

Back in **SQL Editor**, run this once with the email you just used:

```sql
insert into user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'YOUR-EMAIL@example.com';
```

Now open http://localhost:3000/admin. From **Admin → Staff & Roles** you can add helpers later
(they sign in to the store once first, then you add their email with a role).

## 6. Turn on online payments (Phase 6, optional for testing)

Cash on Delivery works without this. For online payment, put these in `.env.local` yourself
(and later in Vercel → Settings → Environment Variables). **Never paste them in chat.**

1. **Supabase secret key:** Project Settings → API Keys → *Secret keys* → create/reveal a key (`sb_secret_…`)
   → `SUPABASE_SECRET_KEY=`
2. **Razorpay test keys:** sign up at razorpay.com → switch to **Test mode** → Account & Settings → API Keys →
   *Generate Test Key* → `RAZORPAY_KEY_ID=` (`rzp_test_…`) and `RAZORPAY_KEY_SECRET=`
3. Restart `npm run dev`. **Admin → Payments** shows a green tick for each key, and checkout offers *Pay online*.
4. Test card in test mode: `4111 1111 1111 1111`, any future expiry, any CVV; or UPI `success@razorpay`.
5. **After the site is live** (localhost can't receive webhooks): Razorpay → Webhooks → Add →
   URL `https://YOUR-DOMAIN/api/webhooks/razorpay`, events `payment.captured` and `order.paid`, choose a secret
   → put the same secret in `RAZORPAY_WEBHOOK_SECRET=`.

## 7. Order emails (Phase 7, optional)

1. Sign up at **resend.com** → **Domains** → add your shop's domain and add the DNS records it shows
   (until then Resend only delivers to your own Resend login email, which is fine for testing).
2. **API Keys** → *Create API key* → put it in `.env.local` as `RESEND_API_KEY=` (never paste it in chat).
3. `EMAIL_FROM=Sandhya Matching Collections <orders@yourdomain.com>` (a verified domain), or for testing `onboarding@resend.dev`.
4. Set your shop email in Supabase (`update store_settings set email = 'you@example.com';`) to get a "New order" email for every order.

Customers then get emails for: order confirmed, shipped (with your tracking note), delivered, cancelled and refunds.

## Keys — what goes where

| Key | Where | Safe in the browser? |
| --- | --- | --- |
| Project URL | `.env.local` | Yes |
| Publishable key (`sb_publishable_…`) | `.env.local` | Yes, security rules decide what it can do |
| Supabase secret key (`sb_secret_…`) | `.env.local` / Vercel only (server) | **No, never share it** |
| Razorpay key id (`rzp_…`) | `.env.local` / Vercel | Yes (it's shown in the payment window) |
| Razorpay key secret, webhook secret | `.env.local` / Vercel only (server) | **No, never share them** |
| Resend API key (`re_…`) | `.env.local` / Vercel only (server) | **No, never share it** |
| Database password | Keep in a password manager | **No** |
