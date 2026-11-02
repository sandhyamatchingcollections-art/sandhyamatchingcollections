import { NextResponse } from "next/server";
import { getPermissions } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { toCsv } from "@/server/admin/csv";

const COLUMNS = ["sku", "name", "variant", "category", "price", "mrp", "unit", "min_qty", "qty_step", "stock", "status", "collections", "slug", "description"] as const;
type One<T> = T | T[] | null;
const one = <T,>(x: One<T>): T | null => (Array.isArray(x) ? x[0] ?? null : x);

/** All products and variants as CSV (same columns as the import template, plus variant and slug). */
export async function GET() {
  if (!(await getPermissions()).has("catalog.write")) return new NextResponse("Not allowed", { status: 403 });
  const s = await supabaseForUser();
  type Row = {
    sku: string; title: string; price: number; mrp: number | null; unit: string; min_qty: number; qty_step: number;
    inventory: One<{ on_hand: number }>;
    products: One<{ name: string; slug: string; status: string; description: string | null;
      product_categories: { is_primary: boolean; categories: One<{ name: string }> }[];
      collection_products: { collections: One<{ title: string }> }[] }>;
  };
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await s.from("product_variants")
      .select("sku, title, price, mrp, unit, min_qty, qty_step, inventory(on_hand), products(name, slug, status, description, product_categories(is_primary, categories(name)), collection_products(collections(title)))")
      .order("product_id").order("sort_order").range(from, from + 999);
    if (error) return new NextResponse(`Export failed: ${error.message}`, { status: 500 });
    for (const v of data as unknown as Row[]) {
      const p = one(v.products);
      const primary = p?.product_categories.find((c) => c.is_primary) ?? p?.product_categories[0];
      rows.push({
        sku: v.sku, name: p?.name, variant: v.title === "Default" ? "" : v.title, category: one(primary?.categories ?? null)?.name ?? "",
        price: Number(v.price) / 100, mrp: v.mrp == null ? "" : Number(v.mrp) / 100, unit: v.unit, min_qty: Number(v.min_qty), qty_step: Number(v.qty_step),
        stock: Number(one(v.inventory)?.on_hand ?? 0), status: p?.status, slug: p?.slug, description: p?.description ?? "",
        collections: (p?.collection_products ?? []).map((c) => one(c.collections)?.title).filter(Boolean).join("; "),
      });
    }
    if ((data ?? []).length < 1000) break;
  }
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(rows, COLUMNS), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="products-${date}.csv"`, "cache-control": "no-store" },
  });
}
