// Runs the real migrations in an in-memory Postgres (PGlite) with a minimal stand-in
// for Supabase's auth schema, then checks the security rules as different users.
// Usage: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = (f) => readFileSync(path.join(root, f), "utf8");

const db = new PGlite({ extensions: { pg_trgm } });

// --- Supabase stand-ins: auth.users, auth.uid(), anon/authenticated roles with Supabase's default grants
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema auth to anon, authenticated, service_role;
`);
// Like newer Supabase projects: NO automatic table permissions for the API roles.
// Replays the owner's real path: Phase 3 setup first, then updates/run-this-once.sql.
await db.exec(sql("migrations/0001_core_schema.sql"));
await db.exec(sql("migrations/0002_row_level_security.sql"));
await db.exec(sql("migrations/0004_staff_management.sql"));
await db.exec(sql("seed.sql"));
await db.exec(sql("updates/run-this-once.sql"));
await db.exec(sql("migrations/0007_shopping.sql"));
await db.exec(sql("migrations/0008_checkout.sql"));
await db.exec(sql("migrations/0009_growth.sql"));
await db.exec(sql("migrations/0010_content.sql"));
await db.exec(sql("optional-sample-products.sql"));

// --- users
const U = {
  owner: "00000000-0000-0000-0000-000000000001",
  productMgr: "00000000-0000-0000-0000-000000000002",
  orderMgr: "00000000-0000-0000-0000-000000000003",
  customer: "00000000-0000-0000-0000-000000000004",
  customer2: "00000000-0000-0000-0000-000000000005",
};
for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users values ($1, $2)`, [id, `${k}@test.local`]);
await db.exec(`
  insert into public.user_roles (user_id, role) values
    ('${U.owner}', 'super_admin'), ('${U.productMgr}', 'product_manager'), ('${U.orderMgr}', 'order_manager');
`);

let pass = 0, fail = 0;
const results = [];

/** Run fn inside a transaction as the given user (null = anonymous, "service" = the app server), then roll back. */
async function as(user, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${user === "service" ? "service_role" : user ? "authenticated" : "anon"}`);
    if (user === "service") user = null;
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? ""]);
    try { return await fn(tx); } finally { await tx.rollback(); }
  });
}
async function test(name, fn) {
  try {
    await fn();
    pass++; results.push(`  PASS  ${name}`);
  } catch (e) {
    fail++; results.push(`  FAIL  ${name}\n        ${e.message}`);
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
async function expectError(p, pattern) {
  try { await p; } catch (e) {
    if (pattern && !pattern.test(e.message)) throw new Error(`wrong error: ${e.message}`);
    return;
  }
  throw new Error("expected an error but the statement succeeded");
}
const rows = async (tx, q, params) => (await tx.query(q, params)).rows;
/** Expect an error inside a transaction without aborting it (like a separate request would). */
async function expectErrorTx(tx, q, params, pattern) {
  await tx.exec("savepoint sp");
  try { await expectError(tx.query(q, params), pattern); } finally { await tx.exec("rollback to savepoint sp"); }
}

// ===================================================================== seed
await test("seed: store settings hold the owner's real details", async () => {
  const [s] = await as(null, (tx) => rows(tx, "select name, whatsapp, instagram_handle from store_settings"));
  expect(s.name === "Sandhya Matching Collections" && s.whatsapp === "919885949698", JSON.stringify(s));
});
await test("seed: 7 top-level categories, 13 subcategories, 10 homepage sections", async () => {
  const [c] = await as(null, (tx) => rows(tx, "select count(*) filter (where parent_id is null)::int r, count(*) filter (where parent_id is not null)::int k from categories"));
  const [h] = await as(null, (tx) => rows(tx, "select count(*)::int n from homepage_sections"));
  expect(c.r === 7 && c.k === 13 && h.n === 10, JSON.stringify({ c, h }));
});

// ===================================================================== public visitors
await test("visitor: sees active categories but not hidden ones", async () => {
  await db.exec("update categories set is_active = false where slug = 'diamond-replicas'");
  const r = await as(null, (tx) => rows(tx, "select slug from categories where slug in ('diamond-replicas','bangles')"));
  await db.exec("update categories set is_active = true where slug = 'diamond-replicas'");
  expect(r.length === 1 && r[0].slug === "bangles", JSON.stringify(r));
});
await test("visitor: cannot create, edit or delete categories", async () => {
  await as(null, async (tx) => {
    await expectError(tx.query("insert into categories (name, slug) values ('X', 'x')"), /row-level security|permission denied/);
  });
  await as(null, (tx) => expectError(tx.query("update categories set name = 'Hacked' where slug = 'sarees'"), /permission denied/));
});
await test("visitor: draft products are invisible", async () => {
  await db.exec("insert into products (slug, name, status) values ('secret-draft', 'Draft', 'draft')");
  const r = await as(null, (tx) => rows(tx, "select 1 from products where slug = 'secret-draft'"));
  const c = await as(null, (tx) => rows(tx, "select 1 from product_cards where slug = 'secret-draft'"));
  await db.exec("delete from products where slug = 'secret-draft'");
  expect(r.length === 0 && c.length === 0, "draft leaked");
});
await test("visitor: product_cards shows price, unit and in-stock, never raw stock numbers", async () => {
  const [card] = await as(null, (tx) => rows(tx, "select * from product_cards where slug = 'sample-raw-silk-blouse'"));
  expect(card.price == 18000 && card.unit === "metre" && card.in_stock === true && !("on_hand" in card), JSON.stringify(card));
  await as(null, (tx) => expectError(tx.query("select * from inventory"), /permission denied/));
});
await test("visitor: cannot read staff roles, audit log or other people's profiles", async () => {
  for (const t of ["user_roles", "audit_logs", "profiles"]) {
    await as(null, (tx) => expectError(tx.query(`select * from ${t}`), /permission denied/));
  }
});
await test("signed-in customer: can read the shop and nothing private", async () => {
  const r = await as(U.customer, (tx) => rows(tx, "select (select count(*) from product_cards)::int c, (select count(*) from user_roles)::int r, (select count(*) from audit_logs)::int a"));
  expect(r[0].c > 0 && r[0].r === 0 && r[0].a === 0, JSON.stringify(r[0]));
});
await test("visitor: only live promotions are visible", async () => {
  await db.exec(`insert into promotions (title, is_active, starts_at, ends_at) values
    ('live', true, now() - interval '1 day', now() + interval '1 day'),
    ('expired', true, now() - interval '3 day', now() - interval '1 day'),
    ('paused', false, now() - interval '1 day', null)`);
  const r = await as(null, (tx) => rows(tx, "select title from promotions"));
  await db.exec("delete from promotions");
  expect(r.length === 1 && r[0].title === "live", JSON.stringify(r));
});

// ===================================================================== customers
await test("customer: sign-up creates a profile automatically", async () => {
  const r = await db.query("select 1 from profiles where id = $1", [U.customer]);
  expect(r.rows.length === 1, "no profile");
});
await test("customer: can read and edit only their own profile", async () => {
  const r = await as(U.customer, (tx) => rows(tx, "select id from profiles"));
  expect(r.length === 1 && r[0].id === U.customer, JSON.stringify(r));
  const n = await as(U.customer, async (tx) => (await tx.query("update profiles set full_name = 'X' where id = $1", [U.customer2])).affectedRows);
  expect(n === 0, "edited someone else's profile");
});
await test("customer: cannot make themselves an admin", async () => {
  await as(U.customer, (tx) => expectError(tx.query("insert into user_roles (user_id, role) values ($1, 'super_admin')", [U.customer]), /row-level security/));
});
await test("customer: cannot change prices", async () => {
  const n = await as(U.customer, async (tx) => (await tx.query("update product_variants set price = 1")).affectedRows);
  expect(n === 0, `changed ${n} prices`);
});

// ===================================================================== staff roles
await test("product manager: can create a category and nested subcategory", async () => {
  await as(U.productMgr, async (tx) => {
    const [p] = await rows(tx, "insert into categories (name, slug) values ('Designer Blouse Materials', 'designer-blouse-materials') returning id, depth");
    const [k] = await rows(tx, "insert into categories (name, slug, parent_id) values ('Printed Fabrics', 'printed-fabrics', $1) returning depth", [p.id]);
    expect(p.depth === 0 && k.depth === 1, JSON.stringify({ p, k }));
  });
});
await test("product manager: can see draft products", async () => {
  await db.exec("insert into products (slug, name, status) values ('pm-draft', 'Draft', 'draft')");
  const r = await as(U.productMgr, (tx) => rows(tx, "select 1 from products where slug = 'pm-draft'"));
  await db.exec("delete from products where slug = 'pm-draft'");
  expect(r.length === 1, "staff cannot see drafts");
});
await test("product manager: cannot change store settings or payment methods", async () => {
  const n = await as(U.productMgr, async (tx) => (await tx.query("update store_settings set tagline = 'x'")).affectedRows);
  expect(n === 0, "changed settings");
  await as(U.productMgr, (tx) => expectError(tx.query("select set_payment_methods(array['cod'])"), /Super Admin/));
});
await test("product manager: cannot grant roles", async () => {
  await as(U.productMgr, (tx) => expectError(tx.query("insert into user_roles (user_id, role) values ($1, 'super_admin')", [U.customer]), /row-level security/));
});
await test("order manager: cannot edit the catalogue", async () => {
  await as(U.orderMgr, (tx) => expectError(tx.query("insert into categories (name, slug) values ('X', 'x-cat')"), /row-level security/));
});
await test("store settings: even Super Admin cannot set payment methods by direct update", async () => {
  await as(U.owner, (tx) => expectError(tx.query("update store_settings set payment_methods = array['cod']"), /permission denied/));
});
await test("super admin: can set payment methods through the guarded function", async () => {
  const [r] = await as(U.owner, async (tx) => {
    await tx.query("select set_payment_methods(array['razorpay'])");
    return rows(tx, "select payment_methods from store_settings");
  });
  expect(r.payment_methods[0] === "razorpay", JSON.stringify(r));
});
await test("super admin: can grant a role, and the grant is audited", async () => {
  await as(U.owner, async (tx) => {
    await tx.query("insert into user_roles (user_id, role) values ($1, 'store_manager')", [U.customer2]);
    const [a] = await rows(tx, "select actor_id, action, entity from audit_logs where entity = 'user_roles' order by id desc limit 1");
    expect(a.actor_id === U.owner && a.action === "insert", JSON.stringify(a));
  });
});

// ===================================================================== data rules
await test("categories: slugs are unique", async () => {
  await expectError(db.query("insert into categories (name, slug) values ('Sarees 2', 'sarees')"), /duplicate key/);
});
await test("categories: nesting stops at 4 levels", async () => {
  await expectError(db.transaction(async (tx) => {
    let parent = null;
    for (let i = 0; i < 5; i++) {
      const [r] = (await tx.query("insert into categories (name, slug, parent_id) values ($1, $2, $3) returning id", [`L${i}`, `lvl-${i}`, parent])).rows;
      parent = r.id;
    }
  }), /4 levels/);
});
await test("categories: cannot be moved under their own subcategory", async () => {
  await expectError(db.query("update categories set parent_id = (select id from categories where slug = 'silk-sarees') where slug = 'sarees'"), /loop/);
});
await test("categories: deleting one that still has subcategories is blocked", async () => {
  await expectError(db.query("delete from categories where slug = 'sarees'"), /foreign key/);
});
await test("categories: deleting one that still has products is blocked", async () => {
  await expectError(db.query("delete from categories where slug = 'kurtas'"), /foreign key/);
});
await test("categories: listing includes products from subcategories", async () => {
  const r = await as(null, (tx) => rows(tx, "select count(*)::int n from category_product_ids('sarees')"));
  expect(r[0].n === 2, `got ${r[0].n}`); // Kanchi silk + mul cotton
});
await test("variants: fabric can be sold in 0.5 m steps; pieces cannot", async () => {
  const [v] = (await db.query("select min_qty, qty_step from product_variants where sku = 'SMP-RAW-SILK-BLOUSE'")).rows;
  expect(Number(v.qty_step) === 0.5, JSON.stringify(v));
  await expectError(db.query("update product_variants set qty_step = 0.5 where sku = 'SMP-KANCHI-SILK'"), /variant_piece_whole/);
});
await test("variants: price can't exceed MRP and SKUs are unique", async () => {
  await expectError(db.query("update product_variants set price = 999999 where sku = 'SMP-KANCHI-SILK'"), /check constraint/);
  await expectError(db.query("update product_variants set sku = 'SMP-KANCHI-SILK' where sku = 'SMP-GOLD-HARAM'"), /duplicate key/);
});
await test("stock: adjust_stock records history; stock can't go negative", async () => {
  await as(U.productMgr, async (tx) => {
    const [v] = await rows(tx, "select id from product_variants where sku = 'SMP-KANCHI-SILK'");
    const [r] = await rows(tx, "select adjust_stock($1, 2, 'adjustment', 'recount') as on_hand", [v.id]);
    expect(Number(r.on_hand) === 5, JSON.stringify(r));
    const h = await rows(tx, "select delta, actor_id from inventory_movements where variant_id = $1", [v.id]);
    expect(h.length === 1 && h[0].actor_id === U.productMgr, JSON.stringify(h));
    await expectError(tx.query("select adjust_stock($1, -100, 'adjustment')", [v.id]), /check constraint/);
  });
});
await test("stock: staff cannot overwrite stock directly, only through adjust_stock", async () => {
  await as(U.productMgr, (tx) => expectError(tx.query("update inventory set on_hand = 999"), /permission denied/));
});
await test("stock: customers cannot call adjust_stock", async () => {
  await as(U.customer, async (tx) => {
    const [v] = await rows(tx, "select variant_id from product_cards limit 1");
    await expectError(tx.query("select adjust_stock($1, 10, 'adjustment')", [v.variant_id]), /Not allowed/);
  });
});
await test("stock: out-of-stock products show as unavailable", async () => {
  await db.exec("update inventory set on_hand = 0 where variant_id = (select id from product_variants where sku = 'SMP-HAIR-BROOCH')");
  const [c] = await as(null, (tx) => rows(tx, "select in_stock from product_cards where slug = 'sample-hair-brooch'"));
  await db.exec("update inventory set on_hand = 25 where variant_id = (select id from product_variants where sku = 'SMP-HAIR-BROOCH')");
  expect(c.in_stock === false, JSON.stringify(c));
});
await test("search: name index finds partial matches", async () => {
  const r = await as(null, (tx) => rows(tx, "select slug from product_cards where name ilike '%bangle%'"));
  expect(r.length === 1, JSON.stringify(r));
});

// ===================================================================== staff management
await test("staff: Super Admin adds a staff member by email", async () => {
  await as(U.owner, async (tx) => {
    await tx.query("select grant_role('Customer@test.local', 'product_manager')");
    const staff = await rows(tx, "select email, roles from list_staff()");
    expect(staff.some((s) => s.email === "customer@test.local"), JSON.stringify(staff));
  });
});
await test("staff: unknown email gets a clear message", async () => {
  await as(U.owner, (tx) => expectError(tx.query("select grant_role('nobody@x.com', 'store_manager')"), /No account with that email/));
});
await test("staff: non-admins cannot list, add or remove staff", async () => {
  await as(U.productMgr, (tx) => expectError(tx.query("select * from list_staff()"), /Super Admin/));
  await as(U.customer, (tx) => expectError(tx.query("select grant_role('customer@test.local', 'super_admin')"), /Super Admin/));
  await as(null, (tx) => expectError(tx.query("select grant_role('customer@test.local', 'super_admin')"), /permission denied/));
});
await test("staff: the last Super Admin cannot be removed", async () => {
  await as(U.owner, (tx) => expectError(tx.query("select revoke_role($1, 'super_admin')", [U.owner]), /at least one Super Admin/));
});
await test("staff: my_permissions lists what the signed-in user can do", async () => {
  const r = await as(U.productMgr, (tx) => rows(tx, "select * from my_permissions() p order by 1"));
  expect(r.map((x) => x.p ?? x.my_permissions).join(",") === "catalog.write,inventory.write", JSON.stringify(r));
});

// ===================================================================== Phase 4: catalogue management
const catId = async (slug, ex = db) => (await ex.query("select id from categories where slug = $1", [slug])).rows[0].id;
const colId = async (slug, ex = db) => (await ex.query("select id from collections where slug = $1", [slug])).rows[0].id;

await test("save_product: creates a fabric with 2 variants, category, collection, filters and opening stock", async () => {
  const blouse = await catId("blouse-fabrics");
  const bridal = await colId("bridal");
  const fabricAttr = (await db.query("select id from category_attributes where key = 'fabric' and category_id = (select id from categories where slug='fabrics')")).rows[0].id;
  await as(U.productMgr, async (tx) => {
    const [{ save_product: id }] = await rows(tx, "select save_product($1)", [JSON.stringify({
      slug: "printed-cotton-blouse", name: "Printed Cotton Blouse Material", status: "active",
      categories: [{ id: blouse, primary: true }], collections: [bridal],
      attributes: [{ attribute_id: fabricAttr, values: ["Cotton"] }],
      variants: [
        { sku: "PCB-RED", title: "Red", options: { color: "Red" }, price: 15000, mrp: 18000, unit: "metre", min_qty: 1, qty_step: 0.5, initial_stock: 25.5 },
        { sku: "PCB-BLUE", title: "Blue", options: { color: "Blue" }, price: 15000, unit: "metre", min_qty: 1, qty_step: 0.5, initial_stock: 0 },
      ],
    })]);
    const [card] = await rows(tx, "select price, unit, in_stock, category_name from product_cards where id = $1", [id]);
    expect(card && card.price == 15000 && card.in_stock && card.category_name === "Blouse Fabrics", JSON.stringify(card));
    const st = await rows(tx, "select sku, available, stock_state from admin_stock where product_id = $1 order by sku", [id]);
    expect(Number(st[1].available) === 25.5 && st[0].stock_state === "out", JSON.stringify(st));
    const [m] = await rows(tx, "select reason, delta from inventory_movements where variant_id = (select id from product_variants where sku = 'PCB-RED')");
    expect(m.reason === "initial" && Number(m.delta) === 25.5, JSON.stringify(m));
    const col = await rows(tx, "select 1 from collection_products where product_id = $1", [id]);
    const attr = await rows(tx, "select value from product_attribute_values where product_id = $1", [id]);
    expect(col.length === 1 && attr[0].value === "Cotton", "collection/attribute missing");
  });
});
await test("save_product: editing removes a variant, keeps stock of the others, moves default", async () => {
  await as(U.productMgr, async (tx) => {
    const [p] = await rows(tx, "select id from products where slug = 'sample-raw-silk-blouse'");
    const [v] = await rows(tx, "select id, sku from product_variants where product_id = $1", [p.id]);
    const blouse = await catId("blouse-fabrics", tx);
    await tx.query("select save_product($1)", [JSON.stringify({
      id: p.id, slug: "sample-raw-silk-blouse", name: "Sample · Raw Silk Blouse Material", status: "active",
      categories: [{ id: blouse }], collections: [],
      variants: [
        { sku: "NEW-GOLD", title: "Gold", price: 20000, unit: "metre", min_qty: 1, qty_step: 0.5, initial_stock: 5 },
        { id: v.id, sku: v.sku, title: "Original", price: 18000, mrp: 22000, unit: "metre", min_qty: 1, qty_step: 0.5 },
      ],
    })]);
    const vs = await rows(tx, "select sku, is_default from product_variants where product_id = $1 order by sort_order", [p.id]);
    expect(vs.length === 2 && vs[0].sku === "NEW-GOLD" && vs[0].is_default, JSON.stringify(vs));
    const [inv] = await rows(tx, "select on_hand from inventory where variant_id = $1", [v.id]);
    expect(Number(inv.on_hand) === 40, `stock changed to ${inv.on_hand}`);
    await tx.query("select save_product($1)", [JSON.stringify({ id: p.id, slug: "sample-raw-silk-blouse", name: "X", status: "active",
      categories: [{ id: blouse }], variants: [{ id: v.id, sku: v.sku, price: 18000, unit: "metre", min_qty: 1, qty_step: 0.5 }] })]);
    const after = await rows(tx, "select sku from product_variants where product_id = $1", [p.id]);
    expect(after.length === 1 && after[0].sku === v.sku, JSON.stringify(after));
  });
});
await test("save_product: duplicate slug or SKU is refused, and nothing is half-saved", async () => {
  await as(U.productMgr, async (tx) => {
    await expectError(tx.query("select save_product($1)", [JSON.stringify({ slug: "sample-kanchi-silk", name: "Dup", variants: [{ sku: "UNIQUE-1", price: 100 }] })]), /duplicate key.*slug/);
  });
  await as(U.productMgr, async (tx) => {
    await expectErrorTx(tx, "select save_product($1)", [JSON.stringify({ slug: "brand-new", name: "Dup", variants: [{ sku: "SMP-KANCHI-SILK", price: 100 }] })], /duplicate key.*sku/);
    const r = await rows(tx, "select 1 from products where slug = 'brand-new'");
    expect(r.length === 0, "product saved without its variant");
  });
});
await test("save_product: a product needs at least one variant", async () => {
  await as(U.productMgr, (tx) => expectError(tx.query("select save_product($1)", [JSON.stringify({ slug: "no-variants", name: "X", variants: [] })]), /at least one variant/));
});
await test("save_product: customers and order managers are refused", async () => {
  const body = JSON.stringify({ slug: "hack", name: "X", variants: [{ sku: "H-1", price: 1 }] });
  await as(U.customer, (tx) => expectError(tx.query("select save_product($1)", [body]), /permission/));
  await as(U.orderMgr, (tx) => expectError(tx.query("select save_product($1)", [body]), /permission/));
  await as(null, (tx) => expectError(tx.query("select save_product($1)", [body]), /permission denied/));
});
await test("duplicate_product: copies as a draft with new slug and SKUs", async () => {
  await as(U.productMgr, async (tx) => {
    const [p] = await rows(tx, "select id from products where slug = 'sample-kanchi-silk'");
    const [{ duplicate_product: id }] = await rows(tx, "select duplicate_product($1)", [p.id]);
    const [c] = await rows(tx, "select slug, status, name from products where id = $1", [id]);
    const [v] = await rows(tx, "select sku from product_variants where product_id = $1", [id]);
    const cats = await rows(tx, "select 1 from product_categories where product_id = $1 and is_primary", [id]);
    expect(c.slug === "sample-kanchi-silk-copy" && c.status === "draft" && v.sku !== "SMP-KANCHI-SILK" && cats.length === 1, JSON.stringify({ c, v }));
    const [{ duplicate_product: id2 }] = await rows(tx, "select duplicate_product($1)", [p.id]);
    const [c2] = await rows(tx, "select slug from products where id = $1", [id2]);
    expect(c2.slug === "sample-kanchi-silk-copy-2", c2.slug);
  });
});
await test("delete_category: refuses while products/subcategories remain, with counts", async () => {
  await as(U.productMgr, async (tx) => {
    const id = await catId("sarees", tx);
    await expectErrorTx(tx, "select delete_category($1)", [id], /0 product\(s\) and 3 subcategory/);
  });
});
await test("delete_category: moving products keeps them visible and keeps their primary category", async () => {
  await as(U.productMgr, async (tx) => {
    const silk = await catId("silk-sarees", tx), designer = await catId("designer-sarees", tx);
    await tx.query("select delete_category($1, $2)", [silk, designer]);
    const [card] = await rows(tx, "select category_name from product_cards where slug = 'sample-kanchi-silk'");
    expect(card.category_name === "Designer Sarees", JSON.stringify(card));
    const gone = await rows(tx, "select 1 from categories where slug = 'silk-sarees'");
    expect(gone.length === 0, "not deleted");
  });
});
await test("delete_category: moving subcategories up works; moving into its own child is refused", async () => {
  await as(U.productMgr, async (tx) => {
    const sarees = await catId("sarees", tx), cotton = await catId("cotton-sarees", tx), fabrics = await catId("fabrics", tx);
    await expectErrorTx(tx, "select delete_category($1, $2)", [sarees, cotton], /outside the one being deleted/);
    await tx.query("select delete_category($1, $2)", [sarees, fabrics]);
    const kids = await rows(tx, "select slug from categories where parent_id = $1 order by slug", [fabrics]);
    expect(kids.some((k) => k.slug === "silk-sarees"), JSON.stringify(kids));
  });
});
await test("reorder_categories: sets sibling order", async () => {
  await as(U.productMgr, async (tx) => {
    const ids = (await rows(tx, "select id from categories where parent_id is null order by sort_order desc")).map((r) => r.id);
    await tx.query("select reorder_categories($1)", [ids]);
    const [first] = await rows(tx, "select slug from categories where parent_id is null order by sort_order limit 1");
    expect(first.slug === "accessories", first.slug);
  });
});
await test("bulk edit: status, category and price changes (rounded, discounts kept)", async () => {
  await as(U.productMgr, async (tx) => {
    const ids = (await rows(tx, "select id from products where slug in ('sample-kanchi-silk','sample-glass-bangles')")).map((r) => r.id);
    await tx.query("select bulk_update_products($1, 'price_percent', '10')", [ids]);
    const [v] = await rows(tx, "select price, mrp from product_variants where sku = 'SMP-GLASS-BANGLES'");
    expect(Number(v.price) === 10500 && Number(v.mrp) === 13200, JSON.stringify(v)); // ₹95→₹105 (rounded), ₹120→₹132
    await tx.query("select bulk_update_products($1, 'status', 'draft')", [ids]);
    const vis = await rows(tx, "select 1 from products where id = any($1) and status = 'draft'", [ids]);
    expect(vis.length === 2, "status not changed");
    const kurtas = await catId("kurtas", tx);
    await tx.query("select bulk_update_products($1, 'add_category', $2)", [ids, kurtas]);
    const pc = await rows(tx, "select 1 from product_categories where category_id = $1 and product_id = any($2)", [kurtas, ids]);
    expect(pc.length === 2, "category not added");
    await expectErrorTx(tx, "select bulk_update_products($1, 'price_percent', '-95')", [ids], /between -90/);
  });
});
await test("CSV import: creates new products, skips or updates existing SKUs, logs stock", async () => {
  await as(U.productMgr, async (tx) => {
    const rowsIn = [
      { sku: "IMP-001", name: "Imported Cotton Lining", category_slug: "lining-materials", price: "5500", unit: "metre", min_qty: "1", qty_step: "0.5", stock: "100", status: "active", collections: ["bestsellers"] },
      { sku: "SMP-KANCHI-SILK", name: "ignored", category_slug: "sarees", price: "700000", stock: "9" },
    ];
    const [{ import_products: r1 }] = await rows(tx, "select import_products($1, false)", [JSON.stringify(rowsIn)]);
    expect(r1.created === 1 && r1.skipped === 1, JSON.stringify(r1));
    const [card] = await rows(tx, "select slug, price, in_stock from product_cards where slug = 'imported-cotton-lining'");
    expect(card && card.in_stock, JSON.stringify(card));
    const [{ import_products: r2 }] = await rows(tx, "select import_products($1, true)", [JSON.stringify([rowsIn[1]])]);
    expect(r2.updated === 1, JSON.stringify(r2));
    const [s] = await rows(tx, "select on_hand, (select price from product_variants where sku='SMP-KANCHI-SILK') as price from admin_stock where sku = 'SMP-KANCHI-SILK'");
    expect(Number(s.on_hand) === 9 && Number(s.price) === 700000, JSON.stringify(s));
    const [m] = await rows(tx, "select reason from inventory_movements where variant_id = (select id from product_variants where sku='SMP-KANCHI-SILK') order by id desc limit 1");
    expect(m.reason === "import", JSON.stringify(m));
  });
});
await test("CSV import: one bad row cancels the whole import", async () => {
  await as(U.productMgr, async (tx) => {
    await expectErrorTx(tx, "select import_products($1, false)", [JSON.stringify([
      { sku: "OK-1", name: "Fine", category_slug: "bangles", price: "100" },
      { sku: "BAD-1", name: "Bad", category_slug: "no-such-category", price: "100" },
    ])], /category "no-such-category" not found/);
    const r = await rows(tx, "select 1 from product_variants where sku = 'OK-1'");
    expect(r.length === 0, "first row was saved");
  });
});
await test("admin lists: visitors see nothing, staff see drafts too", async () => {
  await db.exec("insert into products (slug, name, status) values ('admin-draft', 'Draft', 'draft')");
  await as(null, (tx) => expectError(tx.query("select * from admin_products"), /permission denied/));
  const r = await as(U.productMgr, (tx) => rows(tx, "select 1 from admin_products where slug = 'admin-draft'"));
  const c = await as(U.customer, (tx) => rows(tx, "select * from admin_stock"));
  await db.exec("delete from products where slug = 'admin-draft'");
  expect(r.length === 1 && c.length === 0, JSON.stringify({ staff: r.length, customer: c.length }));
});

// ===================================================================== Phase 5: shopping
const browse = (tx, args) => rows(tx, `select * from browse_products(p_category => $1, p_collection => $2, p_q => $3, p_min => $4, p_max => $5,
  p_in_stock => $6, p_attrs => $7, p_sort => $8, p_limit => $9, p_offset => $10)`,
  [args.category ?? null, args.collection ?? null, args.q ?? null, args.min ?? null, args.max ?? null, args.inStock ?? false,
   JSON.stringify(args.attrs ?? {}), args.sort ?? "featured", args.limit ?? 24, args.offset ?? 0]);

await test("browse: a category includes its subcategories, with a total for paging", async () => {
  const r = await as(null, (tx) => browse(tx, { category: "sarees", limit: 1 }));
  expect(r.length === 1 && Number(r[0].total) === 2, JSON.stringify(r.map((x) => [x.slug, x.total])));
});
await test("browse: price sorting and price range", async () => {
  const asc = await as(null, (tx) => browse(tx, { sort: "price_asc" }));
  const prices = asc.map((x) => Number(x.price));
  expect(prices.every((p, i) => i === 0 || p >= prices[i - 1]), prices.join(","));
  const range = await as(null, (tx) => browse(tx, { min: 10000, max: 19999 }));
  expect(range.length > 0 && range.every((x) => x.price >= 10000 && x.price <= 19999), JSON.stringify(range.map((x) => x.price)));
});
await test("browse: in-stock filter hides sold-out products (they are listed last otherwise)", async () => {
  await db.exec("update inventory set on_hand = 0 where variant_id = (select id from product_variants where sku = 'SMP-HAIR-BROOCH')");
  const all = await as(null, (tx) => browse(tx, { category: "accessories" }));
  const inStock = await as(null, (tx) => browse(tx, { category: "accessories", inStock: true }));
  await db.exec("update inventory set on_hand = 25 where variant_id = (select id from product_variants where sku = 'SMP-HAIR-BROOCH')");
  expect(all.length === 2 && all[all.length - 1].slug === "sample-hair-brooch" && inStock.length === 1, JSON.stringify({ all: all.map((x) => x.slug), inStock: inStock.map((x) => x.slug) }));
});
await test("filters: values come from the products; choices OR together, filters AND together", async () => {
  await db.exec(`
    insert into product_attribute_values (product_id, attribute_id, value)
    select p.id, a.id, v.val from (values ('sample-kanchi-silk','Silk'), ('sample-mul-cotton-saree','Cotton')) v(slug, val)
    join products p on p.slug = v.slug
    join category_attributes a on a.key = 'fabric' and a.category_id = (select id from categories where slug = 'sarees');`);
  const silk = await as(null, (tx) => browse(tx, { category: "sarees", attrs: { fabric: ["Silk"] } }));
  const both = await as(null, (tx) => browse(tx, { category: "sarees", attrs: { fabric: ["Silk", "Cotton"] } }));
  const none = await as(null, (tx) => browse(tx, { category: "sarees", attrs: { fabric: ["Silk"], color: ["Blue"] } }));
  expect(silk.length === 1 && silk[0].slug === "sample-kanchi-silk" && both.length === 2 && none.length === 0, JSON.stringify([silk.length, both.length, none.length]));
  const [{ listing_facets: f }] = await as(null, (tx) => rows(tx, "select listing_facets('sarees')"));
  const fabric = f.attributes.find((a) => a.key === "fabric");
  expect(f.count === 2 && fabric && fabric.values.length === 2 && !f.attributes.some((a) => a.key === "size"), JSON.stringify(f));
});
await test("search: words match name, category, SKU or filter values", async () => {
  const a = await as(null, (tx) => browse(tx, { q: "silk saree", sort: "relevance" }));
  const b = await as(null, (tx) => browse(tx, { q: "SMP-GLASS" }));
  const c = await as(null, (tx) => browse(tx, { q: "cotton" }));
  expect(a.length === 1 && a[0].slug === "sample-kanchi-silk", JSON.stringify(a.map((x) => x.slug)));
  expect(b.length === 1 && b[0].slug === "sample-glass-bangles", JSON.stringify(b.map((x) => x.slug)));
  expect(c.length >= 2, JSON.stringify(c.map((x) => x.slug)));
  const [{ search_suggestions: s }] = await as(null, (tx) => rows(tx, "select search_suggestions('ban')"));
  expect(s.products[0].slug === "sample-glass-bangles" && s.categories.some((x) => x.slug === "bangles"), JSON.stringify(s));
  const [{ search_suggestions: e }] = await as(null, (tx) => rows(tx, "select search_suggestions('b')"));
  expect(e.products.length === 0, "one letter should not search");
});
await test("collections list in the order the owner set", async () => {
  const r = await as(null, (tx) => browse(tx, { collection: "bridal", sort: "collection" }));
  const order = await db.query("select string_agg(p.slug, ',' order by cp.sort_order) s from collection_products cp join products p on p.id = cp.product_id join collections c on c.id = cp.collection_id where c.slug = 'bridal'");
  expect(r.map((x) => x.slug).join(",") === order.rows[0].s, JSON.stringify([r.map((x) => x.slug), order.rows[0].s]));
});
await test("product page data: variants, stock (capped), photos, breadcrumbs; drafts hidden", async () => {
  const [{ product_detail: d }] = await as(null, (tx) => rows(tx, "select product_detail('sample-kanchi-silk')"));
  expect(d && d.variants.length === 1 && Number(d.variants[0].available) === 3 && d.breadcrumbs.map((b) => b.slug).join("/") === "sarees/silk-sarees", JSON.stringify(d));
  await db.exec("update products set status = 'draft' where slug = 'sample-mul-cotton-saree'");
  const [{ product_detail: hidden }] = await as(null, (tx) => rows(tx, "select product_detail('sample-mul-cotton-saree')"));
  await db.exec("update products set status = 'active' where slug = 'sample-mul-cotton-saree'");
  expect(hidden === null, "draft leaked");
});
await test("related products share a category and exclude the product itself", async () => {
  const r = await as(null, (tx) => rows(tx, "select p.slug from related_products((select id from products where slug = 'sample-chanderi-kurta')) r join products p on p.id = r"));
  expect(r.length >= 1 && !r.some((x) => x.slug === "sample-chanderi-kurta") && r.some((x) => x.slug === "sample-printed-kurta"), JSON.stringify(r));
});
const vid = async (sku) => (await db.query("select id from product_variants where sku = $1", [sku])).rows[0].id;
await test("cart quote: fabric snaps to 0.5 m steps and prices come from the database", async () => {
  const silk = await vid("SMP-RAW-SILK-BLOUSE");
  const [{ quote_cart: q }] = await as(null, (tx) => rows(tx, "select quote_cart($1)", [JSON.stringify([{ variant_id: silk, qty: 1.7, price: 1 }])]));
  const l = q.lines[0];
  expect(Number(l.qty) === 1.5 && l.status === "adjusted" && Number(l.price) === 18000 && Number(q.subtotal) === 27000, JSON.stringify(q));
});
await test("cart quote: more than in stock is reduced, with a clear message", async () => {
  const k = await vid("SMP-KANCHI-SILK");
  const [{ quote_cart: q }] = await as(null, (tx) => rows(tx, "select quote_cart($1)", [JSON.stringify([{ variant_id: k, qty: 10 }])]));
  expect(Number(q.lines[0].qty) === 3 && /Only 3 available/.test(q.lines[0].message), JSON.stringify(q.lines[0]));
});
await test("cart quote: sold-out, drafted, price-on-request and unknown items are flagged", async () => {
  const b = await vid("SMP-HAIR-BROOCH"), g = await vid("SMP-GOLD-HARAM");
  await db.exec(`update inventory set on_hand = 0 where variant_id = '${b}'; update products set status = 'draft' where slug = 'sample-glass-bangles';
                 update products set quote_only = true where slug = 'sample-gold-haram';`);
  const bangles = await vid("SMP-GLASS-BANGLES");
  const [{ quote_cart: q }] = await as(null, (tx) => rows(tx, "select quote_cart($1)", [JSON.stringify([
    { variant_id: b, qty: 1 }, { variant_id: bangles, qty: 1 }, { variant_id: g, qty: 1 }, { variant_id: "00000000-0000-0000-0000-00000000dead", qty: 1 }, { variant_id: "not-a-uuid", qty: 1 }])]));
  await db.exec(`update inventory set on_hand = 25 where variant_id = '${b}'; update products set status = 'active' where slug = 'sample-glass-bangles';
                 update products set quote_only = false where slug = 'sample-gold-haram';`);
  const st = q.lines.map((l) => l.status).join(",");
  expect(st === "unavailable,removed,removed,removed" && Number(q.subtotal) === 0, st);
});
await test("saved cart: customers see only their own; visitors can't save", async () => {
  const k = await vid("SMP-KANCHI-SILK");
  await as(U.customer, async (tx) => {
    await tx.query("select save_my_cart($1)", [JSON.stringify([{ variant_id: k, qty: 2 }])]);
    const mine = await rows(tx, "select qty from cart_items");
    expect(mine.length === 1 && Number(mine[0].qty) === 2, JSON.stringify(mine));
    await tx.exec(`select set_config('request.jwt.claim.sub', '${U.customer2}', true)`);
    const theirs = await rows(tx, "select * from cart_items");
    expect(theirs.length === 0, "saw another customer's cart");
  });
  await as(null, (tx) => expectError(tx.query("select save_my_cart('[]')"), /permission denied/));
});


// ============================================================ Phase 6: checkout and orders
const ADDR = { full_name: "Lakshmi R", line1: "12 Temple Street", city: "Kadapa", state: "Andhra Pradesh", pincode: "516001" };
const orderInput = (lines, extra = {}) => JSON.stringify({ lines, method: "cod", name: "Lakshmi R", email: "Lakshmi@Example.com",
  phone: "+91 98765 43210", address: ADDR, ...extra });
const avail = async (sku, ex = db) => {
  const r = (await ex.query("select i.on_hand - i.reserved as a from inventory i join product_variants v on v.id = i.variant_id where v.sku = $1", [sku])).rows[0];
  return Number(r.a);
};
/** Place an order as a user and keep it (committed), like a real request. */
const placeAs = (user, input) => db.transaction(async (tx) => {
  await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
  await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? ""]);
  const [{ place_order: o }] = await rows(tx, "select place_order($1)", [input]);
  return o;
});

await test("checkout quote: ₹79 shipping below ₹999, free above; COD fee and limit", async () => {
  const lin = await vid("SMP-COTTON-LINING"), k = await vid("SMP-KANCHI-SILK");
  const [{ checkout_quote: small }] = await as(null, (tx) => rows(tx, "select checkout_quote($1, 'cod')", [JSON.stringify([{ variant_id: lin, qty: 2 }])]));
  expect(Number(small.shipping_fee) === 7900 && Number(small.total) === 12000 + 7900 && small.cod_allowed === true, JSON.stringify(small));
  const [{ checkout_quote: big }] = await as(null, (tx) => rows(tx, "select checkout_quote($1, 'online')", [JSON.stringify([{ variant_id: k, qty: 1 }])]));
  expect(Number(big.shipping_fee) === 0 && Number(big.total) === 680000 && big.cod_allowed === false, "₹6,800 is over the ₹5,000 COD limit: " + JSON.stringify(big));
  await db.exec("update store_settings set cod_fee = 4900");
  const [{ checkout_quote: c }] = await as(null, (tx) => rows(tx, "select checkout_quote($1, 'cod')", [JSON.stringify([{ variant_id: lin, qty: 2 }])]));
  await db.exec("update store_settings set cod_fee = 0");
  expect(Number(c.cod_fee) === 4900 && Number(c.total) === 12000 + 7900 + 4900, JSON.stringify(c));
});

await test("COD order by a visitor: server prices, stock held, details tidied", async () => {
  const b = await vid("SMP-GLASS-BANGLES");
  const before = await avail("SMP-GLASS-BANGLES");
  const o = await placeAs(null, orderInput([{ variant_id: b, qty: 3, price: 1 }]));
  const [ord] = (await db.query("select * from orders where id = $1", [o.id])).rows;
  const items = (await db.query("select * from order_items where order_id = $1", [o.id])).rows;
  expect(/^SMC\d{5}$/.test(o.order_number) && ord.status === "placed" && ord.payment_status === "cod", JSON.stringify(ord));
  expect(ord.email === "lakshmi@example.com" && ord.phone === "9876543210", "email/phone not normalised");
  expect(Number(ord.total) === 3 * 9500 + 7900 && Number(items[0].price) === 9500, "price came from the browser");
  expect(await avail("SMP-GLASS-BANGLES") === before - 3, "stock not held");
});

await test("place order: changed cart or total is refused (nothing saved)", async () => {
  const k = await vid("SMP-KANCHI-SILK");
  const n = Number((await db.query("select count(*) from orders")).rows[0].count);
  await as(null, (tx) => expectError(tx.query("select place_order($1)", [orderInput([{ variant_id: k, qty: 9 }], { method: "online" })]), /changed/));
  const lin = await vid("SMP-COTTON-LINING");
  await as(null, (tx) => expectError(tx.query("select place_order($1)", [orderInput([{ variant_id: lin, qty: 2 }], { expected_total: 100 })]), /Prices changed/));
  expect(Number((await db.query("select count(*) from orders")).rows[0].count) === n, "an order was saved");
});

await test("place order: bad phone, PIN, empty cart and COD over the limit are refused", async () => {
  const lin = await vid("SMP-COTTON-LINING"), k = await vid("SMP-KANCHI-SILK");
  await as(null, async (tx) => {
    await expectErrorTx(tx, "select place_order($1)", [orderInput([{ variant_id: lin, qty: 1 }], { phone: "12345" })], /mobile number/);
    await expectErrorTx(tx, "select place_order($1)", [orderInput([{ variant_id: lin, qty: 1 }], { address: { ...ADDR, pincode: "0123" } })], /PIN code/);
    await expectErrorTx(tx, "select place_order($1)", [orderInput([])], /empty/);
    await expectErrorTx(tx, "select place_order($1)", [orderInput([{ variant_id: k, qty: 1 }])], /Cash on Delivery/);
  });
});

await test("last piece: a second order for it is refused", async () => {
  const g = await vid("SMP-GOLD-HARAM");
  await db.exec(`update inventory set on_hand = 1 where variant_id = '${g}'`);
  const first = await placeAs(null, orderInput([{ variant_id: g, qty: 1 }], { method: "online" }));
  await as(null, (tx) => expectError(tx.query("select place_order($1)", [orderInput([{ variant_id: g, qty: 1 }], { method: "online", phone: "9000000001" })]), /changed|sold out/));
  await db.query("select release_order_stock($1)", [first.id]);
  await db.exec(`update orders set status = 'cancelled' where id = '${first.id}'; update inventory set on_hand = 5 where variant_id = '${g}'`);
});

await test("online payment: browsers can't mark paid; the server can, once", async () => {
  const h = await vid("SMP-HAIR-BROOCH");
  const o = await placeAs(null, orderInput([{ variant_id: h, qty: 2 }], { method: "online", phone: "9000000002" }));
  expect(o.status === "pending_payment", o.status);
  await db.query("select attach_razorpay_order($1, 'order_TEST1')", [o.id]);
  await as(null, (tx) => expectError(tx.query("select confirm_payment('order_TEST1', 'pay_X', 37900)"), /permission denied/));
  await as(U.customer, (tx) => expectError(tx.query("select confirm_payment('order_TEST1', 'pay_X', 37900)"), /permission denied/));
  await as(null, (tx) => expectError(tx.query("select attach_razorpay_order($1, 'order_EVIL')", [o.id]), /permission denied/));
  const r = await db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    const [{ confirm_payment: a }] = await rows(tx, "select confirm_payment('order_TEST1', 'pay_X', $1)", [o.total]);
    const [{ confirm_payment: b }] = await rows(tx, "select confirm_payment('order_TEST1', 'pay_X', $1)", [o.total]);
    return [a, b];
  });
  const [ord] = (await db.query("select status, payment_status, expires_at from orders where id = $1", [o.id])).rows;
  expect(r[0].status === "placed" && r[1].already === true && ord.payment_status === "paid" && ord.expires_at === null, JSON.stringify([r, ord]));
});

await test("online payment: wrong amount puts the order on hold", async () => {
  const h = await vid("SMP-HAIR-BROOCH");
  const o = await placeAs(null, orderInput([{ variant_id: h, qty: 1 }], { method: "online", phone: "9000000003" }));
  await db.query("select attach_razorpay_order($1, 'order_TEST2')", [o.id]);
  const [{ confirm_payment: r }] = await db.query("select confirm_payment('order_TEST2', 'pay_Y', 100)").then((x) => x.rows);
  expect(r.status === "on_hold", JSON.stringify(r));
});

await test("unpaid orders release stock after 30 minutes; a late payment takes it back if still there", async () => {
  const lin = await vid("SMP-COTTON-LINING");
  const before = await avail("SMP-COTTON-LINING");
  const o = await placeAs(null, orderInput([{ variant_id: lin, qty: 4 }], { method: "online", phone: "9000000004" }));
  expect(await avail("SMP-COTTON-LINING") === before - 4, "not held");
  await db.query("select attach_razorpay_order($1, 'order_TEST3')", [o.id]);
  await db.query("update orders set expires_at = now() - interval '1 minute' where id = $1", [o.id]);
  await db.query("select release_expired_orders()");
  const [x] = (await db.query("select status, stock_state from orders where id = $1", [o.id])).rows;
  expect(x.status === "cancelled" && x.stock_state === "released" && await avail("SMP-COTTON-LINING") === before, JSON.stringify(x));
  const [{ confirm_payment: r }] = (await db.query("select confirm_payment('order_TEST3', 'pay_Z', $1)", [o.total])).rows;
  expect(r.status === "placed" && await avail("SMP-COTTON-LINING") === before - 4, JSON.stringify(r));
});

await test("late payment when the item sold out meanwhile: on hold, nothing over-held", async () => {
  const p = await vid("SMP-PRINTED-KURTA");
  const o = await placeAs(null, orderInput([{ variant_id: p, qty: 2 }], { method: "online", phone: "9000000005" }));
  await db.query("select attach_razorpay_order($1, 'order_TEST4')", [o.id]);
  await db.query("update orders set expires_at = now() - interval '1 minute' where id = $1", [o.id]);
  await db.query("select release_expired_orders()");
  await db.query(`update inventory set on_hand = 1 where variant_id = $1`, [p]);
  const [{ confirm_payment: r }] = (await db.query("select confirm_payment('order_TEST4', 'pay_W', $1)", [o.total])).rows;
  const [inv] = (await db.query("select on_hand, reserved from inventory where variant_id = $1", [p])).rows;
  await db.query(`update inventory set on_hand = 12 where variant_id = $1`, [p]);
  expect(r.status === "on_hold" && Number(inv.reserved) === 0, JSON.stringify([r, inv]));
});

await test("order page: private link, owner and staff can open it; others can't; staff notes hidden", async () => {
  const lin = await vid("SMP-COTTON-LINING");
  const o = await placeAs(U.customer, orderInput([{ variant_id: lin, qty: 1 }], { phone: "9000000006" }));
  await db.query("update orders set staff_note = 'secret' where id = $1", [o.id]);
  const view = async (user, token) => (await as(user, (tx) => rows(tx, "select order_view($1, $2)", [o.order_number, token])))[0].order_view;
  expect((await view(null, o.access_token))?.order_number === o.order_number, "token link failed");
  expect(await view(null, null) === null && await view(U.customer2, null) === null, "leaked without the link");
  const mine = await view(U.customer, null);
  expect(mine && mine.items.length === 1 && !("staff_note" in mine), JSON.stringify(mine));
  expect((await view(U.orderMgr, null))?.order_number === o.order_number, "staff can't open it");
  const theirs = await as(U.customer2, (tx) => rows(tx, "select * from orders"));
  expect(theirs.length === 0, "another customer listed orders");
  const own = await as(U.customer, (tx) => rows(tx, "select order_number from my_orders()"));
  expect(own.some((r) => r.order_number === o.order_number), "my_orders missing it");
});

await test("customers can't write orders directly", async () => {
  await as(U.customer, async (tx) => {
    await expectErrorTx(tx, "insert into orders (payment_method, customer_name, email, phone, shipping_address, subtotal, total) values ('cod','x','x@x.in','9000000000','{}',0,0)", [], /permission denied/);
    await expectErrorTx(tx, "update orders set payment_status = 'paid'", [], /permission denied/);
  });
});

await test("signed-in COD order saves the address and empties the saved cart", async () => {
  const lin = await vid("SMP-COTTON-LINING");
  await as(U.customer2, async (tx) => {
    await tx.query("select save_my_cart($1)", [JSON.stringify([{ variant_id: lin, qty: 1 }])]);
    await tx.query("select place_order($1)", [orderInput([{ variant_id: lin, qty: 1 }], { phone: "9000000007", save_address: true })]);
    const addr = await rows(tx, "select * from addresses");
    const cart = await rows(tx, "select * from cart_items");
    expect(addr.length === 1 && addr[0].is_default && addr[0].pincode === "516001" && cart.length === 0, JSON.stringify([addr, cart]));
  });
});

await test("staff: shipping takes stock off the shelf and records it; wrong steps refused", async () => {
  const b = await vid("SMP-GLASS-BANGLES");
  const [inv0] = (await db.query("select on_hand, reserved from inventory where variant_id = $1", [b])).rows;
  const o = await placeAs(null, orderInput([{ variant_id: b, qty: 2 }], { phone: "9000000008" }));
  await as(U.customer, (tx) => expectError(tx.query("select set_order_status($1, 'shipped')", [o.id]), /permission/));
  await as(U.orderMgr, async (tx) => {
    await expectErrorTx(tx, "select set_order_status($1, 'delivered')", [o.id], /can't be changed/);
    await tx.query("select set_order_status($1, 'confirmed')", [o.id]);
    await tx.query("select set_order_status($1, 'shipped', 'DTDC 123')", [o.id]);
    await tx.query("select set_order_status($1, 'delivered')", [o.id]);
    const [inv] = await rows(tx, "select on_hand, reserved from inventory where variant_id = $1", [b]);
    const [ord] = await rows(tx, "select status, payment_status, stock_state from orders where id = $1", [o.id]);
    await tx.exec("reset role"); // stock history is staff-with-inventory only; read it as the test owner
    const mv = await rows(tx, "select delta, reason, reference from inventory_movements where variant_id = $1 and reason = 'order'", [b]);
    expect(Number(inv.on_hand) === Number(inv0.on_hand) - 2 && Number(inv.reserved) === Number(inv0.reserved), JSON.stringify([inv0, inv]));
    expect(ord.status === "delivered" && ord.payment_status === "paid" && ord.stock_state === "deducted", JSON.stringify(ord));
    expect(mv.length === 1 && Number(mv[0].delta) === -2 && mv[0].reference === o.order_number, JSON.stringify(mv));
    await tx.exec("set local role authenticated");
    await expectErrorTx(tx, "select set_order_status($1, 'cancelled')", [o.id], /can't be changed/);
  });
});

await test("staff: cancelling releases held stock; abandoning needs the private token", async () => {
  const lin = await vid("SMP-COTTON-LINING");
  const before = await avail("SMP-COTTON-LINING");
  const o = await placeAs(null, orderInput([{ variant_id: lin, qty: 3 }], { phone: "9000000009" }));
  await as(U.orderMgr, (tx) => tx.query("select set_order_status($1, 'cancelled', 'Customer called')", [o.id]));
  // as() rolls back; do it for real to check stock
  await db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [U.orderMgr]);
    await tx.query("select set_order_status($1, 'cancelled', 'Customer called')", [o.id]);
  });
  expect(await avail("SMP-COTTON-LINING") === before, "stock not released on cancel");
  const o2 = await placeAs(null, orderInput([{ variant_id: lin, qty: 2 }], { method: "online", phone: "9000000010" }));
  await as(null, (tx) => tx.query("select abandon_order($1, $2)", [o2.id, "00000000-0000-0000-0000-000000000000"]));
  expect((await db.query("select status from orders where id = $1", [o2.id])).rows[0].status === "pending_payment", "wrong token cancelled it");
  await db.transaction(async (tx) => { await tx.exec("set local role anon"); await tx.query("select abandon_order($1, $2)", [o2.id, o2.access_token]); });
  expect((await db.query("select status from orders where id = $1", [o2.id])).rows[0].status === "cancelled" && await avail("SMP-COTTON-LINING") === before, "abandon failed");
});

await test("spam guard: at most 6 orders per phone per hour", async () => {
  const lin = await vid("SMP-COTTON-LINING");
  await db.exec(`insert into orders (payment_method, customer_name, email, phone, shipping_address, subtotal, total, status)
    select 'cod', 'x', 'x@x.in', '9111111111', '{}', 0, 0, 'cancelled' from generate_series(1, 6)`);
  await as(null, (tx) => expectError(tx.query("select place_order($1)", [orderInput([{ variant_id: lin, qty: 1 }], { phone: "9111111111" })]), /Too many orders/));
});

await test("shipping settings: only allowed staff; sensible values enforced", async () => {
  const s = JSON.stringify({ shipping_fee: 5000, free_shipping_min: 150000, cod_enabled: false, cod_fee: 0, cod_max_total: null, delivery_min_days: 2, delivery_max_days: 6 });
  await as(U.productMgr, (tx) => expectError(tx.query("select update_checkout_settings($1)", [s]), /permission/));
  await as(U.owner, async (tx) => {
    await tx.query("select update_checkout_settings($1)", [s]);
    const [{ order_charges: c }] = await rows(tx, "select order_charges(100000, 'cod')");
    expect(Number(c.shipping_fee) === 5000 && c.cod_allowed === false, JSON.stringify(c));
    await expectErrorTx(tx, "select update_checkout_settings($1)", [JSON.stringify({ ...JSON.parse(s), delivery_min_days: 9 })], /fastest/);
  });
  await as(U.orderMgr, (tx) => expectError(tx.query("select set_online_payments(false)"), /Super Admin/));
});

// ============================================================ Phase 7: coupons, GST invoices, refunds, reports
const asCommit = (user, fn) => db.transaction(async (tx) => {
  await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
  await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? ""]);
  return fn(tx);
});
await db.exec(`insert into coupons (code, kind, value, max_discount, min_subtotal, description) values
  ('WELCOME10', 'percent', 10, 20000, 0, '10% off, up to ₹200'),
  ('FLAT100', 'flat', 10000, null, 50000, '₹100 off above ₹500'),
  ('FREESHIP', 'free_shipping', 0, null, 0, null)`);
await db.exec(`insert into coupons (code, kind, value, is_active) values ('OLDCODE', 'flat', 5000, false)`);
await db.exec(`insert into coupons (code, kind, value, ends_at, starts_at) values ('EXPIRED', 'flat', 5000, now() - interval '1 day', now() - interval '10 days')`);
await db.exec(`insert into coupons (code, kind, value, usage_limit, per_customer_limit) values ('ONLY2', 'flat', 1000, 2, null)`);
await db.exec(`insert into coupons (code, kind, value, first_order_only) values ('FIRST50', 'flat', 5000, true)`);
const cq = async (lines, method, code) => (await as(null, (tx) => rows(tx, "select checkout_quote($1, $2, $3) q", [JSON.stringify(lines), method, code])))[0].q;

await test("coupons: shoppers can't list codes or call the internal helpers", async () => {
  const seen = await as(U.customer, (tx) => rows(tx, "select * from coupons"));
  expect(seen.length === 0, "customer listed coupons");
  await as(null, (tx) => expectError(tx.query("select coupon_check('WELCOME10', 100000)"), /permission denied/));
  await as(null, (tx) => expectError(tx.query("select price_order('[]', 'cod')"), /permission denied/));
  const staff = await as(U.owner, (tx) => rows(tx, "select code from coupons"));
  expect(staff.length >= 5, "owner can't see coupons");
  await as(U.orderMgr, (tx) => expectError(tx.query("insert into coupons (code, kind, value) values ('HACK', 'flat', 100)"), /row-level security|permission/));
});

await test("coupons: 10% capped at ₹200; free shipping judged after the discount", async () => {
  const k = await vid("SMP-KANCHI-SILK"), lin = await vid("SMP-COTTON-LINING");
  const big = await cq([{ variant_id: k, qty: 1 }], "online", "welcome10");
  expect(Number(big.discount) === 20000 && Number(big.total) === 680000 - 20000 && big.coupon.ok, JSON.stringify(big.coupon));
  const small = await cq([{ variant_id: lin, qty: 17 }], "online", "WELCOME10"); // ₹1,020 → −₹102 = ₹918 < ₹999, so shipping applies
  expect(Number(small.discount) === 10200 && Number(small.shipping_fee) === 7900 && Number(small.total) === 102000 - 10200 + 7900, JSON.stringify(small));
});

await test("coupons: minimum amount, free shipping, and clear reasons when a code can't be used", async () => {
  const lin = await vid("SMP-COTTON-LINING");
  const low = await cq([{ variant_id: lin, qty: 2 }], "cod", "FLAT100");
  expect(!low.coupon.ok && /₹380 more/.test(low.coupon.message) && Number(low.discount) === 0, JSON.stringify(low.coupon));
  const fs = await cq([{ variant_id: lin, qty: 2 }], "cod", "FREESHIP");
  expect(fs.coupon.ok && Number(fs.shipping_fee) === 0 && Number(fs.total) === 12000, JSON.stringify(fs));
  for (const [code, re] of [["NOPE", /isn't valid/], ["OLDCODE", /isn't valid/], ["EXPIRED", /expired/]]) {
    const r = await cq([{ variant_id: lin, qty: 2 }], "cod", code);
    expect(!r.coupon.ok && re.test(r.coupon.message), code + " " + JSON.stringify(r.coupon));
  }
});

await test("coupons: order records the discount; one use per customer; cancelling frees it", async () => {
  const lin = await vid("SMP-COTTON-LINING");
  const o = await placeAs(null, orderInput([{ variant_id: lin, qty: 10 }], { phone: "9222200001", coupon: "welcome10" }));
  const [ord] = (await db.query("select discount, coupon_code, total, shipping_fee from orders where id = $1", [o.id])).rows;
  expect(Number(ord.discount) === 6000 && ord.coupon_code === "WELCOME10" && Number(ord.total) === 60000 - 6000 + 7900, JSON.stringify(ord));
  await as(null, (tx) => expectError(tx.query("select place_order($1)", [orderInput([{ variant_id: lin, qty: 1 }], { phone: "9222200001", coupon: "WELCOME10" })]), /already used/));
  await as(null, (tx) => expectError(tx.query("select place_order($1)", [orderInput([{ variant_id: lin, qty: 1 }], { phone: "9222200009", email: "LAKSHMI@example.com", coupon: "WELCOME10" })]), /already used/));
  await db.query("update orders set status = 'cancelled' where id = $1", [o.id]);
  await db.query("select release_order_stock($1)", [o.id]);
  const again = await placeAs(null, orderInput([{ variant_id: lin, qty: 1 }], { phone: "9222200001", coupon: "WELCOME10" }));
  expect(again.order_number, "couldn't reuse after cancelling");
});

await test("coupons: total use limit, first-order-only, and a bad code stops the order", async () => {
  const lin = await vid("SMP-COTTON-LINING");
  await placeAs(null, orderInput([{ variant_id: lin, qty: 1 }], { phone: "9222200002", email: "a2@x.in", coupon: "ONLY2" }));
  await placeAs(null, orderInput([{ variant_id: lin, qty: 1 }], { phone: "9222200003", email: "a3@x.in", coupon: "ONLY2" }));
  await as(null, (tx) => expectError(tx.query("select place_order($1)", [orderInput([{ variant_id: lin, qty: 1 }], { phone: "9222200004", email: "a4@x.in", coupon: "ONLY2" })]), /fully used/));
  await as(null, (tx) => expectError(tx.query("select place_order($1)", [orderInput([{ variant_id: lin, qty: 1 }], { phone: "9222200002", email: "a2@x.in", coupon: "FIRST50" })]), /first orders/));
  const n = Number((await db.query("select count(*) from orders where phone = '9222200005'")).rows[0].count);
  await as(null, (tx) => expectError(tx.query("select place_order($1)", [orderInput([{ variant_id: lin, qty: 1 }], { phone: "9222200005", coupon: "NOPE" })]), /isn't valid/));
  expect(Number((await db.query("select count(*) from orders where phone = '9222200005'")).rows[0].count) === n, "order saved despite bad coupon");
});

await test("GST: each order line keeps its rate and HSN; product rate overrides the store default", async () => {
  const b = await vid("SMP-GLASS-BANGLES"), lin = await vid("SMP-COTTON-LINING");
  await db.exec("update products set gst_rate = 18, hsn = '7018' where slug = 'sample-glass-bangles'");
  const o = await placeAs(null, orderInput([{ variant_id: b, qty: 1 }, { variant_id: lin, qty: 1 }], { phone: "9222200006" }));
  const items = (await db.query("select sku, gst_rate, hsn from order_items where order_id = $1 order by sku", [o.id])).rows;
  expect(Number(items.find((i) => i.sku === "SMP-GLASS-BANGLES").gst_rate) === 18 && items.find((i) => i.sku === "SMP-GLASS-BANGLES").hsn === "7018"
    && Number(items.find((i) => i.sku === "SMP-COTTON-LINING").gst_rate) === 5, JSON.stringify(items));
  await as(U.customer, (tx) => expectError(tx.query("select set_product_tax((select id from products limit 1), 12, '5208')"), /permission/));
});

await test("invoices: numbered when shipped (one series per financial year), private like the order", async () => {
  const lin = await vid("SMP-COTTON-LINING");
  const o1 = await placeAs(null, orderInput([{ variant_id: lin, qty: 1 }], { phone: "9222200007" }));
  const o2 = await placeAs(null, orderInput([{ variant_id: lin, qty: 1 }], { phone: "9222200008" }));
  const before = (await as(null, (tx) => rows(tx, "select invoice_view($1, $2) v", [o1.order_number, o1.access_token])))[0].v;
  expect(before === null, "invoice before shipping");
  const ship = (id) => asCommit(U.orderMgr, (tx) => tx.query("select set_order_status($1, 'shipped')", [id]));
  await ship(o1.id); await ship(o2.id);
  const nums = (await db.query("select invoice_number from orders where id = any($1) order by invoiced_at", [[o1.id, o2.id]])).rows.map((r) => r.invoice_number);
  const m = nums.map((n) => n.match(/^SMC\/(\d{4})-(\d{2})\/(\d{4})$/));
  expect(m.every(Boolean) && Number(m[1][3]) === Number(m[0][3]) + 1 && (Number(m[0][1]) + 1) % 100 === Number(m[0][2]), JSON.stringify(nums));
  const v = (await as(null, (tx) => rows(tx, "select invoice_view($1, $2) v", [o1.order_number, o1.access_token])))[0].v;
  expect(v && v.items.length === 1 && !("access_token" in v.order) && v.seller.name, JSON.stringify(v).slice(0, 200));
  const nope = (await as(null, (tx) => rows(tx, "select invoice_view($1, null) v", [o1.order_number])))[0].v;
  expect(nope === null, "invoice leaked without the link");
});

await test("refunds: only allowed staff; partial then full; never more than paid; COD can't be refunded online", async () => {
  const h = await vid("SMP-HAIR-BROOCH");
  const o = await placeAs(null, orderInput([{ variant_id: h, qty: 2 }], { method: "online", phone: "9222200010" }));
  await db.query("select attach_razorpay_order($1, 'order_RF1')", [o.id]);
  await db.query("select confirm_payment('order_RF1', 'pay_RF1', $1)", [o.total]);
  await as(U.orderMgr, (tx) => expectError(tx.query("select record_refund($1, 100, 'razorpay')", [o.id]), /permission/));
  await asCommit(U.owner, (tx) => tx.query("select record_refund($1, 10000, 'razorpay', 'rfnd_1', 'Damaged')", [o.id]));
  let [x] = (await db.query("select payment_status, refunded_amount from orders where id = $1", [o.id])).rows;
  expect(x.payment_status === "partially_refunded" && Number(x.refunded_amount) === 10000, JSON.stringify(x));
  await as(U.owner, (tx) => expectError(tx.query("select record_refund($1, $2, 'razorpay')", [o.id, Number(o.total)]), /between/));
  await asCommit(U.owner, (tx) => tx.query("select record_refund($1, $2, 'razorpay', 'rfnd_2')", [o.id, Number(o.total) - 10000]));
  [x] = (await db.query("select payment_status from orders where id = $1", [o.id])).rows;
  expect(x.payment_status === "refunded", x.payment_status);
  const ev = (await db.query("select count(*) from order_events where order_id = $1 and status = 'refunded'", [o.id])).rows[0].count;
  expect(Number(ev) === 2, "refunds not in history");
  const lin = await vid("SMP-COTTON-LINING");
  const c = await placeAs(null, orderInput([{ variant_id: lin, qty: 1 }], { phone: "9222200011" }));
  await as(U.owner, (tx) => expectError(tx.query("select record_refund($1, 100, 'manual')", [c.id]), /Only paid orders/));
});

await test("reports: totals, top products and coupons; staff only", async () => {
  const today = (await db.query("select (now() at time zone 'Asia/Kolkata')::date d")).rows[0].d;
  await as(U.customer, (tx) => expectError(tx.query("select sales_report($1, $1)", [today]), /permission/));
  await as(U.productMgr, (tx) => expectError(tx.query("select sales_report($1, $1)", [today]), /permission/));
  const [{ sales_report: r }] = await as(U.owner, (tx) => rows(tx, "select sales_report($1, $1)", [today]));
  const expected = (await db.query("select count(*) n, sum(total) s from orders where status not in ('cancelled','pending_payment')")).rows[0];
  expect(Number(r.orders) === Number(expected.n) && Number(r.sales) === Number(expected.s), JSON.stringify([r.orders, r.sales, expected]));
  expect(r.by_day.length === 1 && r.top_products.length > 0 && r.coupons.some((c) => c.code === "WELCOME10") && Number(r.refunds) > 0, JSON.stringify(r).slice(0, 300));
});

await test("bestsellers: ranked by quantity sold; cancelled orders don't count", async () => {
  const ids = await as(null, (tx) => rows(tx, "select b from bestseller_ids(5) b"));
  const top = (await db.query(`select i.product_id, sum(i.qty) q from order_items i join orders o on o.id = i.order_id
    where o.status not in ('cancelled','pending_payment') group by i.product_id order by q desc limit 1`)).rows[0];
  expect(ids.length > 0 && ids[0].b === top.product_id, JSON.stringify([ids, top]));
});

await test("tax settings: store staff only; checked values", async () => {
  const p = { gstin: "37ABCDE1234F1Z5", legal_name: "Sandhya Matching Collections", gst_state: "Andhra Pradesh", default_gst_rate: 5, shipping_gst_rate: 18, invoice_prefix: "smc" };
  await as(U.productMgr, (tx) => expectError(tx.query("select update_tax_settings($1)", [JSON.stringify(p)]), /permission/));
  await as(U.owner, async (tx) => {
    await tx.query("select update_tax_settings($1)", [JSON.stringify(p)]);
    const [s] = await rows(tx, "select gstin, invoice_prefix, gst_state from store_settings");
    expect(s.gstin === "37ABCDE1234F1Z5" && s.invoice_prefix === "SMC", JSON.stringify(s));
    await expectErrorTx(tx, "select update_tax_settings($1)", [JSON.stringify({ ...p, gstin: "BAD" })], /check/);
  });
});

// ============================================================ Phase 8: content, banners, reviews, customers, dashboard
await test("homepage: bridal showcase, owner story and banners slot into the order", async () => {
  const r = await as(null, (tx) => rows(tx, "select id from homepage_sections order by sort_order"));
  const ids = r.map((x) => x.id).join(",");
  expect(ids === "hero,banners,budget,bridal-showcase,bridal,kurtas,new,owner,favourites,promo", ids);
  await as(U.productMgr, (tx) => expectError(tx.query("select reorder_home_sections($1)", [["promo", "hero"]]), /permission/));
  await as(U.owner, async (tx) => {
    await tx.query("select reorder_home_sections($1)", [["owner", "hero"]]);
    const [{ id }] = await rows(tx, "select id from homepage_sections order by sort_order limit 1");
    expect(id === "owner", id);
  });
});

await test("banners: visitors see only live ones; only content staff can add", async () => {
  await db.exec(`insert into banners (title, image_url, is_active) values ('Live', 'https://x.test/a.webp', true), ('Off', 'https://x.test/b.webp', false);
    insert into banners (title, image_url, starts_at) values ('Later', 'https://x.test/c.webp', now() + interval '2 days')`);
  const seen = await as(null, (tx) => rows(tx, "select title from banners"));
  expect(seen.map((x) => x.title).join() === "Live", JSON.stringify(seen));
  await as(U.customer, (tx) => expectError(tx.query("insert into banners (image_url) values ('https://x.test/d.webp')"), /row-level security|permission/));
  await as(U.owner, async (tx) => {
    await tx.query("insert into banners (image_url, link) values ('https://x.test/e.webp', '/c/sarees')");
    await expectErrorTx(tx, "insert into banners (image_url, link) values ('https://x.test/f.webp', 'https://evil.test')", [], /check/);
  });
});

await test("pages: drafts stay hidden until published; customers can't edit", async () => {
  const before = await as(null, (tx) => rows(tx, "select slug from content_pages"));
  expect(before.length === 0, "drafts visible: " + JSON.stringify(before));
  await as(U.customer, async (tx) => {
    await tx.query("update content_pages set body = 'hacked'"); // RLS: silently matches nothing
  });
  expect(Number((await db.query("select count(*) from content_pages where body = 'hacked'")).rows[0].count) === 0, "customer edited a page");
  await db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [U.owner]);
    await tx.query("update content_pages set is_published = true, body = 'Our FAQ' where slug = 'faq'");
  });
  const after = await as(null, (tx) => rows(tx, "select slug, body from content_pages"));
  expect(after.length === 1 && after[0].slug === "faq" && after[0].body === "Our FAQ", JSON.stringify(after));
});

await test("store and SEO settings: right staff only; values tidied", async () => {
  const p = { name: "Sandhya Matching Collections", tagline: "One Stop Destination for Ladies Items", description: "d", announcement: " Free shipping above ₹999 ",
    shipping_note: "Shipping all over India", returns_note: "7-day exchange", whatsapp: "+91 98859 49698", instagram_url: "https://www.instagram.com/sandhya_matching_collections",
    instagram_handle: "sandhya_matching_collections", facebook_url: "", email: "Shop@Example.com", phone: "", address: "Kadapa", new_arrival_days: 21 };
  await as(U.productMgr, (tx) => expectError(tx.query("select update_store_settings($1)", [JSON.stringify(p)]), /permission/));
  await as(U.owner, async (tx) => {
    await tx.query("select update_store_settings($1)", [JSON.stringify(p)]);
    const [s] = await rows(tx, "select announcement, whatsapp, email, facebook_url, new_arrival_days from store_settings");
    expect(s.announcement === "Free shipping above ₹999" && s.whatsapp === "919885949698" && s.email === "shop@example.com" && s.facebook_url === null && s.new_arrival_days === 21, JSON.stringify(s));
    await tx.query("select update_seo_settings($1)", [JSON.stringify({ seo_title: "Sandhya Matching Collections | Sarees & more", seo_description: "x", og_image_url: "" })]);
  });
  await as(U.orderMgr, (tx) => expectError(tx.query("select update_seo_settings('{}')"), /permission/));
});

await test("reviews: only customers whose order was delivered; approved ones are public; reviewer stays private", async () => {
  const lin = await vid("SMP-COTTON-LINING");
  const pid = (await db.query("select product_id from product_variants where id = $1", [lin])).rows[0].product_id;
  await as(U.customer2, (tx) => expectError(tx.query("select submit_review($1, 5, 'Lovely', 'Soft', 'Asha')", [pid]), /once they're delivered/));
  const o = await placeAs(U.customer2, orderInput([{ variant_id: lin, qty: 1 }], { phone: "9555500001" }));
  await db.query("update orders set status = 'delivered' where id = $1", [o.id]);
  await asCommit(U.customer2, (tx) => tx.query("select submit_review($1, 5, 'Lovely', 'Soft and breathable', 'Asha')", [pid]));
  expect((await as(null, (tx) => rows(tx, "select id from product_reviews where product_id = $1", [pid]))).length === 0, "pending review public");
  await as(U.customer2, (tx) => expectError(tx.query("select set_review_status((select id from product_reviews limit 1), 'approved')"), /permission/));
  await asCommit(U.owner, (tx) => tx.query("select set_review_status((select id from product_reviews where product_id = $1), 'approved')", [pid]));
  const pub = await as(null, (tx) => rows(tx, "select author_name, rating, verified from product_reviews where product_id = $1", [pid]));
  expect(pub.length === 1 && pub[0].rating === 5 && pub[0].verified, JSON.stringify(pub));
  await as(null, (tx) => expectError(tx.query("select user_id from product_reviews"), /permission denied/));
  const [{ product_rating: r }] = await as(null, (tx) => rows(tx, "select product_rating($1)", [pid]));
  expect(Number(r.average) === 5 && Number(r.count) === 1, JSON.stringify(r));
  await asCommit(U.customer2, (tx) => tx.query("select submit_review($1, 3, 'Ok', 'Changed my mind', 'Asha')", [pid]));
  const st = (await db.query("select status, rating from product_reviews where product_id = $1", [pid])).rows[0];
  expect(st.status === "pending" && st.rating === 3, "edit should go back to pending: " + JSON.stringify(st));
  const [{ my_review: m }] = await as(U.customer2, (tx) => rows(tx, "select my_review($1)", [pid]));
  expect(m.can_review && m.review.status === "pending", JSON.stringify(m));
});

await test("customers: grouped by phone with orders and spend; staff with access only", async () => {
  await as(U.productMgr, (tx) => expectError(tx.query("select admin_customers()"), /permission/));
  const [{ admin_customers: c }] = await as(U.orderMgr, (tx) => rows(tx, "select admin_customers('9222200010')"));
  expect(c.total === 1 && c.rows[0].name === "Lakshmi R" && Number(c.rows[0].spent) === 0, JSON.stringify(c)); // fully refunded in Phase 7 test
  const [{ admin_customers: all }] = await as(U.owner, (tx) => rows(tx, "select admin_customers(null, 100, 0)"));
  const distinct = (await db.query("select count(distinct phone) n from orders where status <> 'pending_payment'")).rows[0].n;
  expect(all.total === Number(distinct), JSON.stringify([all.total, distinct]));
});

await test("dashboard: each role sees only its own blocks", async () => {
  const [{ admin_dashboard: pm }] = await as(U.productMgr, (tx) => rows(tx, "select admin_dashboard()"));
  expect(pm.catalog && pm.stock && !pm.orders && !pm.sales && !pm.customers, JSON.stringify(Object.keys(pm)));
  const [{ admin_dashboard: om }] = await as(U.orderMgr, (tx) => rows(tx, "select admin_dashboard()"));
  expect(om.orders && om.customers !== undefined && !om.sales && !om.catalog, JSON.stringify(Object.keys(om)));
  const [{ admin_dashboard: ow }] = await as(U.owner, (tx) => rows(tx, "select admin_dashboard()"));
  expect(ow.orders && ow.sales && ow.stock && ow.catalog && Array.isArray(ow.orders.recent), JSON.stringify(Object.keys(ow)));
  await as(U.customer, (tx) => expectError(tx.query("select admin_dashboard()"), /Staff only/));
});

await test("audit log records coupon and page changes", async () => {
  await asCommit(U.owner, (tx) => tx.query("update coupons set description = 'Edited' where code = 'WELCOME10'"));
  const n = (await db.query("select count(*) from audit_logs where entity = 'coupons' and actor_id = $1", [U.owner])).rows[0].count;
  const pg = (await db.query("select count(*) from audit_logs where entity = 'content_pages' and entity_id = 'faq'")).rows[0].count;
  expect(Number(n) >= 1 && Number(pg) >= 1, JSON.stringify([n, pg]));
});

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
