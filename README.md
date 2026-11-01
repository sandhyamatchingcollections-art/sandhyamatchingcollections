# Sandhya Matching Collections — online store

Next.js 15 (App Router) + TypeScript + Tailwind CSS v4. Supabase and Razorpay are wired in later phases.

## First time: connect the database
Follow `docs/SETUP-SUPABASE.md` (paste one SQL file, set the sign-in URL, make yourself Super Admin).

## Run locally
```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000  ·  admin preview at /admin
npm run build      # production build (must pass with zero errors)
npm run test:db    # 52 database checks (no internet needed)
./tests/e2e/run-all.sh   # 85 browser checks against a local Postgres (see tests/e2e/README.md)
```

## Your logo
Put your logo at `public/logo.png` (transparent PNG, ~400px tall works well) and restart the server.
It appears in the header and footer automatically; until then the wordmark shows on its own.

## Where things live
- `src/app/globals.css` — pastel design tokens (all colours, fonts)
- `src/server/catalog/` — every storefront data read. `dev-seed.ts` is development-only sample data.
- `src/components/home/sections.tsx` — homepage sections, rendered from admin-style config
- `src/components/store/` — header, mega menu, product card, footer, WhatsApp button, guest cart
- `src/app/(store)/` — storefront routes · `src/app/(admin)/admin/` — admin shell

Phase reports: `docs/PHASE-2.md`, `docs/PHASE-3.md`, `docs/PHASE-4.md`, `docs/PHASE-5.md`, `docs/PHASE-6.md`, `docs/PHASE-7.md`, `docs/PHASE-8.md`.
