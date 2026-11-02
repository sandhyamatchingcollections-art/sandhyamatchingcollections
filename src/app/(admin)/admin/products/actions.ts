"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { friendlyDbError } from "@/server/admin/errors";
import { processImage, removeImageIfUnused, uploadImage } from "@/server/admin/images";

export type ProductFormState = { error?: string; ok?: string; fieldErrors?: Record<string, string>; createdId?: string };

// The form sends numbers as text; each is checked exactly (an empty price is an error, never ₹0).
const money = /^\d{1,8}(\.\d{1,2})?$/;
const decimal = /^\d{1,6}(\.\d{1,3})?$/;
const price = z.string().trim().min(1, "Enter a price").regex(money, "Enter an amount like 450 or 450.50").transform(Number);
const optPrice = z.string().trim().refine((v) => v === "" || money.test(v), "Enter an amount like 450 or 450.50")
  .transform((v) => (v === "" ? null : Number(v)));
const qty = z.string().trim().min(1, "Required").regex(decimal, "Enter a number like 1 or 0.5").transform(Number)
  .refine((v) => v > 0, "Must be more than 0");
const optQty = z.string().trim().refine((v) => v === "" || decimal.test(v), "Enter a number like 10 or 2.5")
  .transform((v) => (v === "" ? null : Number(v))).refine((v) => v === null || v > 0, "Must be more than 0");
const optWhole = z.string().trim().refine((v) => v === "" || /^\d{1,6}$/.test(v), "Whole number of grams").transform((v) => (v === "" ? null : Number(v)));
const stock = z.string().trim().refine((v) => v === "" || decimal.test(v), "Enter a number like 25 or 12.5").transform((v) => (v === "" ? 0 : Number(v)));
const toPaise = (r: number) => Math.round(r * 100);

// Every key is listed: anything else in the payload is dropped (no mass assignment).
const Variant = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().trim().regex(/^[A-Za-z0-9._-]{1,40}$/, "SKU: letters, numbers, . _ - only (max 40)"),
  title: z.string().trim().max(60).default(""),
  color: z.string().trim().max(40).default(""),
  size: z.string().trim().max(20).default(""),
  price,
  mrp: optPrice,
  unit: z.enum(["piece", "metre", "yard", "set"]),
  min_qty: qty,
  qty_step: qty,
  max_qty: optQty,
  track_inventory: z.boolean(),
  weight_grams: optWhole,
  is_active: z.boolean(),
  initial_stock: stock,
}).superRefine((v, ctx) => {
  if (v.mrp !== null && v.mrp < v.price) ctx.addIssue({ code: "custom", path: ["mrp"], message: "MRP must be at least the selling price" });
  const whole = v.unit === "piece" || v.unit === "set";
  for (const k of ["min_qty", "qty_step"] as const) {
    if (whole && !Number.isInteger(v[k])) ctx.addIssue({ code: "custom", path: [k], message: "Whole numbers for pieces/sets" });
  }
  if (v.max_qty !== null && v.max_qty < v.min_qty) ctx.addIssue({ code: "custom", path: ["max_qty"], message: "Must be at least the minimum" });
});

const ProductInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Enter a product name").max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens"),
  status: z.enum(["draft", "active", "archived"]),
  brand: z.string().trim().max(80).default(""),
  description: z.string().trim().max(10_000).default(""),
  is_featured: z.boolean(),
  quote_only: z.boolean(),
  seo_title: z.string().trim().max(70).default(""),
  gst_rate: z.enum(["", "0", "3", "5", "12", "18", "28"]).default(""),
  hsn: z.string().trim().regex(/^(\d{4,8})?$/, "HSN code is 4–8 digits").default(""),
  seo_description: z.string().trim().max(170).default(""),
  categories: z.array(z.object({ id: z.string().uuid(), primary: z.boolean() })).max(20),
  collections: z.array(z.string().uuid()).max(20),
  attributes: z.array(z.object({ attribute_id: z.string().uuid(), values: z.array(z.string().trim().max(120)).max(20) })).max(40),
  variants: z.array(Variant).min(1, "Add at least one variant").max(50),
}).superRefine((p, ctx) => {
  const skus = p.variants.map((v) => v.sku.toLowerCase());
  skus.forEach((s, i) => { if (skus.indexOf(s) !== i) ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: "Duplicate SKU in this product" }); });
  if (p.status === "active" && p.categories.length === 0) ctx.addIssue({ code: "custom", path: ["categories"], message: "Choose at least one category before making it live" });
  if (!p.variants.some((v) => v.is_active)) ctx.addIssue({ code: "custom", path: ["variants"], message: "At least one variant must be on sale" });
});

export async function saveProduct(_: ProductFormState, form: FormData): Promise<ProductFormState> {
  try { await requirePermission("catalog.write"); } catch (e) { return { error: (e as Error).message }; }
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("payload") ?? "")); } catch { return { error: "The form couldn't be read. Please reload and try again." }; }
  const parsed = ProductInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const p = parsed.data;
  const payload = {
    id: p.id, name: p.name, slug: p.slug, status: p.status, brand: p.brand || null, description: p.description || null,
    is_featured: p.is_featured, quote_only: p.quote_only, seo_title: p.seo_title || null, seo_description: p.seo_description || null,
    categories: p.categories, collections: p.collections, attributes: p.attributes,
    variants: p.variants.map((v) => ({
      id: v.id, sku: v.sku, title: v.title || [v.color, v.size].filter(Boolean).join(" / ") || "Default",
      options: Object.fromEntries(Object.entries({ color: v.color, size: v.size }).filter(([, x]) => x)),
      price: toPaise(v.price), mrp: v.mrp === null ? null : toPaise(v.mrp), unit: v.unit,
      min_qty: v.min_qty, qty_step: v.qty_step, max_qty: v.max_qty, track_inventory: v.track_inventory,
      weight_grams: v.weight_grams, is_active: v.is_active, initial_stock: v.id ? 0 : v.initial_stock,
    })),
  };
  const s = await supabaseForUser();
  const { data, error } = await s.rpc("save_product", { p: payload });
  if (error) {
    if (/duplicate key.*sku/.test(error.message)) {
      // Name the SKU(s) that clash so the owner knows which row to fix.
      let q = s.from("product_variants").select("sku, products(name)").in("sku", payload.variants.map((v) => v.sku));
      if (p.id) q = q.neq("product_id", p.id);
      const { data: clash } = await q;
      const first = clash?.[0] as { sku: string; products: { name: string } | { name: string }[] | null } | undefined;
      const owner = Array.isArray(first?.products) ? first?.products[0] : first?.products;
      if (first) return { error: `SKU "${first.sku}" is already used by “${owner?.name ?? "another product"}”. Each SKU must be unique.` };
    }
    return { error: friendlyDbError(error) };
  }
  const { error: taxError } = await s.rpc("set_product_tax", { p_product: data, p_rate: p.gst_rate === "" ? null : Number(p.gst_rate), p_hsn: p.hsn || null });
  if (taxError) return { error: friendlyDbError(taxError) };
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${data}`);
  // New product with photos picked: hand the id back so the browser can upload them, then it opens the edit page.
  if (!p.id && form.get("then") === "photos") return { createdId: String(data) };
  // Reload the page so new variants come back with their database ids.
  redirect(p.id ? `/admin/products/${data}?saved=${Date.now()}` : `/admin/products/${data}?created=1`);
}

export async function duplicateProduct(form: FormData) {
  await requirePermission("catalog.write");
  const id = z.string().uuid().parse(form.get("id"));
  const s = await supabaseForUser();
  const { data, error } = await s.rpc("duplicate_product", { p_id: id });
  if (error) redirect(`/admin/products/${id}?error=${encodeURIComponent(friendlyDbError(error))}`);
  const { data: src } = await s.from("products").select("gst_rate, hsn").eq("id", id).single();
  if (src) await s.rpc("set_product_tax", { p_product: data, p_rate: src.gst_rate, p_hsn: src.hsn });
  revalidatePath("/admin/products");
  redirect(`/admin/products/${data}?duplicated=1`);
}

export async function uploadProductImage(_: ProductFormState, form: FormData): Promise<ProductFormState> {
  try {
    await requirePermission("catalog.write");
    const id = z.string().uuid().parse(form.get("id"));
    const data = await processImage(form.get("file") as File);
    const s = await supabaseForUser();
    const { data: prod } = await s.from("products").select("name").eq("id", id).single();
    const { data: last } = await s.from("product_images").select("sort_order").eq("product_id", id).order("sort_order", { ascending: false }).limit(1);
    const path = await uploadImage(s, "product-images", `products/${id}`, data);
    const { error } = await s.from("product_images").insert({ product_id: id, storage_path: path, alt: prod?.name ?? "", sort_order: (last?.[0]?.sort_order ?? -1) + 1 });
    if (error) return { error: friendlyDbError(error) };
    revalidatePath(`/admin/products/${id}`);
    return { ok: "Photo added." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function imageAction(form: FormData) {
  await requirePermission("catalog.write");
  const imageId = z.string().uuid().parse(form.get("image_id"));
  const op = z.enum(["left", "right", "delete", "alt"]).parse(form.get("op"));
  const s = await supabaseForUser();
  const { data: img } = await s.from("product_images").select("id, product_id, storage_path, sort_order").eq("id", imageId).single();
  if (!img) return;
  if (op === "delete") {
    await s.from("product_images").delete().eq("id", imageId);
    await removeImageIfUnused(s, "product-images", img.storage_path, "product_images");
  } else if (op === "alt") {
    const alt = z.string().trim().max(200).parse(form.get("alt") ?? "");
    await s.from("product_images").update({ alt }).eq("id", imageId);
  } else {
    const { data: all } = await s.from("product_images").select("id").eq("product_id", img.product_id).order("sort_order").order("created_at");
    const ids = (all ?? []).map((r) => r.id as string);
    const i = ids.indexOf(imageId), j = op === "left" ? i - 1 : i + 1;
    if (j >= 0 && j < ids.length) {
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await Promise.all(ids.map((id, n) => s.from("product_images").update({ sort_order: n }).eq("id", id)));
    }
  }
  revalidatePath(`/admin/products/${img.product_id}`);
}

const Bulk = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), value: z.enum(["draft", "active", "archived"]) }),
  z.object({ action: z.literal("add_category"), value: z.string().uuid() }),
  z.object({ action: z.literal("remove_category"), value: z.string().uuid() }),
  z.object({ action: z.literal("price_percent"), value: z.string().trim().regex(/^-?\d{1,3}(\.\d{1,2})?$/, "Enter a percentage like 10 or -15") }),
]);

export async function bulkProducts(form: FormData) {
  const back = String(form.get("back") ?? "/admin/products");
  const safeBack = back.startsWith("/admin/products") ? back : "/admin/products";
  const sep = safeBack.includes("?") ? "&" : "?";
  let msg: string;
  try {
    await requirePermission("catalog.write");
    const ids = z.array(z.string().uuid()).min(1, "Select at least one product").max(500).parse(form.getAll("ids"));
    const parsed = Bulk.safeParse({ action: form.get("action"), value: form.get("value") });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Choose what to change.");
    const s = await supabaseForUser();
    const { data, error } = await s.rpc("bulk_update_products", { p_ids: ids, p_action: parsed.data.action, p_value: String(parsed.data.value) });
    if (error) throw new Error(friendlyDbError(error));
    msg = `notice=${encodeURIComponent(`Updated ${data} product${data === 1 ? "" : "s"}.`)}`;
  } catch (e) {
    const m = e instanceof z.ZodError ? e.issues[0].message : (e as Error).message;
    msg = `error=${encodeURIComponent(m)}`;
  }
  revalidatePath("/admin/products");
  redirect(`${safeBack}${sep}${msg}`);
}
