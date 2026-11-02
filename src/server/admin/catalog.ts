import "server-only";
import { supabaseForUser } from "@/lib/supabase/server";
import { storageUrl } from "@/lib/supabase/env";

// Admin reads run as the signed-in staff member; RLS lets staff see drafts and hidden items.

export type AdminCategory = {
  id: string; parent_id: string | null; name: string; slug: string; description: string | null;
  image_path: string | null; banner_path: string | null; sort_order: number; is_active: boolean; depth: number;
  seo_title: string | null; seo_description: string | null;
  children: AdminCategory[]; product_count: number;
};
export type CategoryAttribute = {
  id: string; category_id: string; key: string; label: string; type: "text" | "select" | "color";
  options: string[]; is_filterable: boolean; sort_order: number;
};

async function db() { return supabaseForUser(); }
function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`Could not load ${what}: ${r.error.message}`);
  return r.data as T;
}

/** All categories (including hidden) as a tree, with direct product counts. */
export async function adminCategoryTree(): Promise<{ tree: AdminCategory[]; flat: AdminCategory[] }> {
  const s = await db();
  const [cats, links] = await Promise.all([
    s.from("categories").select("*").order("sort_order").order("name"),
    s.from("product_categories").select("category_id"),
  ]);
  const counts = new Map<string, number>();
  for (const l of must(links, "categories") as { category_id: string }[]) counts.set(l.category_id, (counts.get(l.category_id) ?? 0) + 1);
  const flat = (must(cats, "categories") as AdminCategory[]).map((c) => ({ ...c, children: [], product_count: counts.get(c.id) ?? 0 }));
  const byId = new Map(flat.map((c) => [c.id, c]));
  const tree: AdminCategory[] = [];
  for (const c of flat) (c.parent_id ? byId.get(c.parent_id)?.children : tree)?.push(c);
  return { tree, flat };
}

/** Depth-first list with indentation level, for selects. */
export function flattenTree(tree: AdminCategory[], level = 0, out: { cat: AdminCategory; level: number }[] = []) {
  for (const c of tree) { out.push({ cat: c, level }); flattenTree(c.children, level + 1, out); }
  return out;
}

export function descendantIds(cat: AdminCategory): Set<string> {
  const ids = new Set<string>();
  const walk = (c: AdminCategory) => { for (const k of c.children) { ids.add(k.id); walk(k); } };
  walk(cat);
  return ids;
}

export async function adminCategory(id: string) {
  const s = await db();
  const [cat, attrs] = await Promise.all([
    s.from("categories").select("*").eq("id", id).maybeSingle(),
    s.from("category_attributes").select("*").eq("category_id", id).order("sort_order"),
  ]);
  return { category: must(cat, "category") as AdminCategory | null, attributes: must(attrs, "filters") as CategoryAttribute[] };
}

/** Attributes that apply to each category: its own plus every ancestor's (e.g. Fabric on Fabrics applies to Blouse Fabrics). */
export async function attributesByCategory(flat: AdminCategory[]): Promise<Record<string, CategoryAttribute[]>> {
  const s = await db();
  const all = must(await s.from("category_attributes").select("*").order("sort_order"), "filters") as CategoryAttribute[];
  const byCat = new Map<string, CategoryAttribute[]>();
  for (const a of all) byCat.set(a.category_id, [...(byCat.get(a.category_id) ?? []), a]);
  const parent = new Map(flat.map((c) => [c.id, c.parent_id]));
  const out: Record<string, CategoryAttribute[]> = {};
  for (const c of flat) {
    const list: CategoryAttribute[] = [];
    for (let cur: string | null | undefined = c.id; cur; cur = parent.get(cur)) list.push(...(byCat.get(cur) ?? []));
    out[c.id] = list;
  }
  return out;
}

// ---------------------------------------------------------------- products
export type AdminProductRow = {
  id: string; slug: string; name: string; status: "draft" | "active" | "archived"; price: number | null; mrp: number | null;
  unit: string | null; sku: string | null; variant_count: number; available: number | null; category_name: string | null;
  image_url: string | null; updated_at: string;
};

export async function adminProducts(opts: { q?: string; status?: string; category?: string; page: number; perPage?: number }) {
  const s = await db();
  const per = opts.perPage ?? 25;
  let q = s.from("admin_products").select("*", { count: "exact" });
  if (opts.q) {
    const term = opts.q.replace(/[%_,()."'\\]/g, "").slice(0, 60);
    if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%,slug.ilike.%${term}%`);
  }
  if (opts.status && ["draft", "active", "archived"].includes(opts.status)) q = q.eq("status", opts.status);
  if (opts.category) {
    const ids = must(await s.from("product_categories").select("product_id").eq("category_id", opts.category), "products") as { product_id: string }[];
    q = q.in("id", ids.length ? ids.map((x) => x.product_id) : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data, count, error } = await q.order("updated_at", { ascending: false }).range((opts.page - 1) * per, opts.page * per - 1);
  if (error) throw new Error(`Could not load products: ${error.message}`);
  const rows = (data ?? []).map((r) => ({ ...r, image_url: storageUrl("product-images", r.image_path) })) as AdminProductRow[];
  return { rows, total: count ?? 0, pages: Math.max(1, Math.ceil((count ?? 0) / per)) };
}

export type AdminVariant = {
  id: string; sku: string; title: string; options: Record<string, string>; price: number; mrp: number | null;
  unit: "piece" | "metre" | "yard" | "set"; min_qty: number; qty_step: number; max_qty: number | null;
  track_inventory: boolean; weight_grams: number | null; is_active: boolean; is_default: boolean; sort_order: number;
  on_hand: number; reserved: number;
};
export type AdminProduct = {
  id: string; slug: string; name: string; description: string | null; brand: string | null;
  status: "draft" | "active" | "archived"; is_featured: boolean; quote_only: boolean;
  seo_title: string | null; seo_description: string | null; published_at: string | null; updated_at: string;
  gst_rate: number | null; hsn: string | null;
  categories: { id: string; primary: boolean }[]; collections: string[];
  attributes: Record<string, string[]>; variants: AdminVariant[];
  images: { id: string; storage_path: string; url: string; alt: string; sort_order: number }[];
};

export async function adminProduct(id: string): Promise<AdminProduct | null> {
  const s = await db();
  const { data: p, error } = await s.from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) return null;
  const [cats, cols, attrs, vars, imgs] = await Promise.all([
    s.from("product_categories").select("category_id, is_primary").eq("product_id", id),
    s.from("collection_products").select("collection_id").eq("product_id", id),
    s.from("product_attribute_values").select("attribute_id, value").eq("product_id", id),
    s.from("product_variants").select("*, inventory(on_hand, reserved)").eq("product_id", id).order("sort_order"),
    s.from("product_images").select("id, storage_path, alt, sort_order").eq("product_id", id).order("sort_order"),
  ]);
  const attributes: Record<string, string[]> = {};
  for (const a of must(attrs, "filters") as { attribute_id: string; value: string }[]) (attributes[a.attribute_id] ??= []).push(a.value);
  type VarRow = AdminVariant & { inventory: { on_hand: number; reserved: number } | { on_hand: number; reserved: number }[] | null };
  return {
    ...p,
    categories: (must(cats, "categories") as { category_id: string; is_primary: boolean }[]).map((c) => ({ id: c.category_id, primary: c.is_primary })),
    collections: (must(cols, "collections") as { collection_id: string }[]).map((c) => c.collection_id),
    attributes,
    variants: (must(vars, "variants") as VarRow[]).map(({ inventory, ...v }) => {
      const inv = Array.isArray(inventory) ? inventory[0] : inventory;
      return { ...v, price: Number(v.price), mrp: v.mrp == null ? null : Number(v.mrp), min_qty: Number(v.min_qty), qty_step: Number(v.qty_step),
        max_qty: v.max_qty == null ? null : Number(v.max_qty), on_hand: Number(inv?.on_hand ?? 0), reserved: Number(inv?.reserved ?? 0) };
    }),
    images: (must(imgs, "images") as { id: string; storage_path: string; alt: string; sort_order: number }[])
      .map((i) => ({ ...i, url: storageUrl("product-images", i.storage_path)! })),
  };
}

export async function adminCollections() {
  const s = await db();
  const [cols, links] = await Promise.all([
    s.from("collections").select("*").order("sort_order"),
    s.from("collection_products").select("collection_id"),
  ]);
  const counts = new Map<string, number>();
  for (const l of must(links, "collections") as { collection_id: string }[]) counts.set(l.collection_id, (counts.get(l.collection_id) ?? 0) + 1);
  return (must(cols, "collections") as { id: string; slug: string; title: string; description: string | null; is_active: boolean; sort_order: number }[])
    .map((c) => ({ ...c, product_count: counts.get(c.id) ?? 0 }));
}

// ---------------------------------------------------------------- stock
export type StockRow = {
  variant_id: string; sku: string; title: string; unit: string; track_inventory: boolean; product_id: string; product_name: string;
  status: string; on_hand: number; reserved: number; available: number; low_stock_threshold: number; stock_state: string;
};
export async function adminStock(opts: { q?: string; state?: string; page: number }) {
  const s = await db();
  const per = 30;
  let q = s.from("admin_stock").select("*", { count: "exact" });
  if (opts.q) {
    const term = opts.q.replace(/[%_,()."'\\]/g, "").slice(0, 60);
    if (term) q = q.or(`product_name.ilike.%${term}%,sku.ilike.%${term}%`);
  }
  if (opts.state && ["low", "out", "ok", "untracked"].includes(opts.state)) q = q.eq("stock_state", opts.state);
  const { data, count, error } = await q.order("available").order("product_name").range((opts.page - 1) * per, opts.page * per - 1);
  if (error) throw new Error(`Could not load stock: ${error.message}`);
  return { rows: (data ?? []) as StockRow[], total: count ?? 0, pages: Math.max(1, Math.ceil((count ?? 0) / per)) };
}

export async function stockHistory(variantId: string) {
  const s = await db();
  const [v, m] = await Promise.all([
    s.from("admin_stock").select("*").eq("variant_id", variantId).maybeSingle(),
    s.from("inventory_movements").select("id, delta, reason, note, reference, created_at, actor_id").eq("variant_id", variantId).order("id", { ascending: false }).limit(200),
  ]);
  return { variant: must(v, "stock") as StockRow | null, moves: must(m, "stock history") as { id: number; delta: number; reason: string; note: string | null; reference: string | null; created_at: string }[] };
}
