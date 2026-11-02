import "server-only";
import Papa from "papaparse";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CSV_COLUMNS = ["sku", "name", "category", "price", "mrp", "unit", "min_qty", "qty_step", "stock", "status", "collections", "description"] as const;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Cells starting with = + - @ could run as formulas in Excel; prefix them so they stay text. */
export function safeCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
export function toCsv(rows: Record<string, unknown>[], columns: readonly string[]): string {
  return "﻿" + Papa.unparse({ fields: [...columns], data: rows.map((r) => columns.map((c) => safeCell(r[c]))) });
}

const money = /^\d{1,8}(\.\d{1,2})?$/;
const decimal = /^\d{1,6}(\.\d{1,3})?$/;

const Row = z.object({
  sku: z.string().trim().regex(/^[A-Za-z0-9._-]{1,40}$/, "SKU: letters, numbers, . _ - (max 40)"),
  name: z.string().trim().min(1, "Name is missing").max(160),
  category: z.string().trim().min(1, "Category is missing"),
  price: z.string().trim().regex(money, "Price must be a number like 450 or 450.50"),
  mrp: z.string().trim().refine((v) => v === "" || money.test(v), "MRP must be a number or empty"),
  unit: z.string().trim().toLowerCase().transform((v) => v || "piece")
    .pipe(z.enum(["piece", "metre", "yard", "set"], { error: "Unit must be piece, metre, yard or set" })),
  min_qty: z.string().trim().refine((v) => v === "" || decimal.test(v), "min_qty must be a number").transform((v) => v || "1"),
  qty_step: z.string().trim().refine((v) => v === "" || decimal.test(v), "qty_step must be a number"),
  stock: z.string().trim().refine((v) => v === "" || decimal.test(v), "Stock must be a number or empty"),
  status: z.string().trim().toLowerCase().transform((v) => v || "draft")
    .pipe(z.enum(["draft", "active", "archived"], { error: "Status must be draft, active or archived" })),
  collections: z.string().trim().default(""),
  description: z.string().trim().max(10000).default(""),
});

export type PreviewRow = {
  line: number; sku: string; name: string; price: string; category: string;
  action: "create" | "update" | "skip" | "error"; errors: string[];
  payload?: Record<string, unknown>;
};

/** Parse and check a CSV against the live catalogue. Nothing is written. */
export async function previewCsv(s: SupabaseClient, text: string, updateExisting: boolean) {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  const headers = parsed.meta.fields ?? [];
  const missing = ["sku", "name", "category", "price"].filter((h) => !headers.includes(h));
  if (missing.length) return { fatal: `Missing column(s): ${missing.join(", ")}. Download the template to see the expected columns.`, rows: [] as PreviewRow[] };
  if (parsed.data.length === 0) return { fatal: "The file has no product rows.", rows: [] as PreviewRow[] };
  if (parsed.data.length > MAX_IMPORT_ROWS) return { fatal: `Up to ${MAX_IMPORT_ROWS} rows per import. Split the file and import in parts.`, rows: [] as PreviewRow[] };

  const [{ data: cats }, { data: cols }] = await Promise.all([
    s.from("categories").select("slug, name"), s.from("collections").select("slug, title"),
  ]);
  const catBy = new Map<string, string>();
  for (const c of cats ?? []) { catBy.set(c.slug.toLowerCase(), c.slug); catBy.set(c.name.toLowerCase(), c.slug); }
  const colBy = new Map<string, string>();
  for (const c of cols ?? []) { colBy.set(c.slug.toLowerCase(), c.slug); colBy.set(c.title.toLowerCase(), c.slug); }

  const skus = parsed.data.map((r) => String(r.sku ?? "").trim()).filter(Boolean);
  const existing = new Set<string>();
  for (let i = 0; i < skus.length; i += 300) {
    const { data } = await s.from("product_variants").select("sku").in("sku", skus.slice(i, i + 300));
    for (const r of data ?? []) existing.add(String(r.sku).toLowerCase());
  }

  const seen = new Map<string, number>();
  const rows: PreviewRow[] = parsed.data.map((raw, i) => {
    const line = i + 2; // header is line 1
    const r = Row.safeParse(Object.fromEntries(CSV_COLUMNS.map((c) => [c, String(raw[c] ?? "")])));
    const base = { line, sku: String(raw.sku ?? ""), name: String(raw.name ?? ""), price: String(raw.price ?? ""), category: String(raw.category ?? "") };
    if (!r.success) return { ...base, action: "error", errors: [...new Set(r.error.issues.map((x) => x.message))] };
    const v = r.data;
    const errors: string[] = [];
    const key = v.sku.toLowerCase();
    if (seen.has(key)) errors.push(`Same SKU as line ${seen.get(key)}`); else seen.set(key, line);
    const catSlug = catBy.get(v.category.toLowerCase());
    if (!catSlug) errors.push(`Category “${v.category}” not found`);
    const colSlugs: string[] = [];
    for (const c of v.collections.split(/[;|]/).map((x) => x.trim()).filter(Boolean)) {
      const slug = colBy.get(c.toLowerCase());
      if (slug) colSlugs.push(slug); else errors.push(`Collection “${c}” not found`);
    }
    if (v.mrp && Number(v.mrp) < Number(v.price)) errors.push("MRP is lower than the price");
    const step = v.qty_step || (v.unit === "metre" || v.unit === "yard" ? "0.5" : "1");
    const whole = v.unit === "piece" || v.unit === "set";
    if (whole && (!Number.isInteger(Number(v.min_qty)) || !Number.isInteger(Number(step)))) errors.push("Pieces and sets need whole-number quantities");
    if (Number(v.min_qty) <= 0 || Number(step) <= 0) errors.push("min_qty and qty_step must be more than 0");
    if (errors.length) return { ...base, action: "error", errors };
    const isExisting = existing.has(key);
    return {
      ...base,
      action: isExisting ? (updateExisting ? "update" : "skip") : "create",
      errors: [],
      payload: {
        sku: v.sku, name: v.name, category_slug: catSlug, price: String(Math.round(Number(v.price) * 100)),
        mrp: v.mrp ? String(Math.round(Number(v.mrp) * 100)) : "", unit: v.unit, min_qty: v.min_qty, qty_step: step,
        stock: v.stock, status: v.status, description: v.description, collections: colSlugs,
      },
    };
  });
  return { fatal: null, rows };
}
