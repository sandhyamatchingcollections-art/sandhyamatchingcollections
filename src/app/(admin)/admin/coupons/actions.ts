"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

export type CouponState = { error?: string; values?: Record<string, string> };

const money = (label: string) => z.string().trim().transform((v, ctx) => {
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) { ctx.addIssue({ code: "custom", message: `${label}: enter rupees` }); return null; }
  return Math.round(n * 100);
});
const int = (label: string) => z.string().trim().transform((v, ctx) => {
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) { ctx.addIssue({ code: "custom", message: `${label}: enter a whole number` }); return null; }
  return n;
});
const date = z.string().trim().transform((v) => (v ? new Date(`${v}T00:00:00+05:30`).toISOString() : null));

const Input = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "Code: 3–30 letters, numbers, - or _"),
  description: z.string().trim().max(200),
  kind: z.enum(["percent", "flat", "free_shipping"]),
  value: z.string().trim(),
  min_subtotal: money("Minimum order"),
  max_discount: money("Maximum discount"),
  starts: date, ends: date,
  usage_limit: int("Total uses"), per_customer_limit: int("Uses per customer"),
  first_order_only: z.boolean(), is_active: z.boolean(),
});

export async function saveCoupon(_: CouponState, form: FormData): Promise<CouponState> {
  try { await requirePermission("promotions.write"); } catch (e) { return { error: (e as Error).message }; }
  const values = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const parsed = Input.safeParse({ ...values, first_order_only: form.get("first_order_only") === "on", is_active: form.get("is_active") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const c = parsed.data;
  let value = 0;
  if (c.kind === "percent") {
    value = Number(c.value);
    if (!Number.isInteger(value) || value < 1 || value > 90) return { error: "Percent off must be a whole number from 1 to 90.", values };
  } else if (c.kind === "flat") {
    value = Math.round(Number(c.value) * 100);
    if (!Number.isFinite(value) || value <= 0) return { error: "Enter the rupees off.", values };
  }
  if (c.ends && c.starts && c.ends <= c.starts) return { error: "The end date must be after the start date.", values };
  const row = {
    code: c.code, description: c.description || null, kind: c.kind, value,
    min_subtotal: c.min_subtotal ?? 0, max_discount: c.kind === "percent" ? c.max_discount : null,
    starts_at: c.starts ?? new Date().toISOString(), ends_at: c.ends,
    usage_limit: c.usage_limit, per_customer_limit: c.per_customer_limit, first_order_only: c.first_order_only, is_active: c.is_active,
  };
  const s = await supabaseForUser();
  const { error } = c.id ? await s.from("coupons").update(row).eq("id", c.id) : await s.from("coupons").insert(row);
  if (error) return { error: /duplicate key/.test(error.message) ? `The code ${c.code} already exists.` : error.message, values };
  revalidatePath("/admin/coupons");
  redirect(`/admin/coupons?notice=${encodeURIComponent(`Coupon ${c.code} saved.`)}`);
}

export async function deleteCoupon(form: FormData): Promise<void> {
  await requirePermission("promotions.write");
  const id = z.string().uuid().parse(form.get("id"));
  const s = await supabaseForUser();
  const { count } = await s.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", id);
  // A used coupon is switched off instead, so past orders keep their record.
  const { error } = count ? await s.from("coupons").update({ is_active: false }).eq("id", id) : await s.from("coupons").delete().eq("id", id);
  revalidatePath("/admin/coupons");
  redirect(`/admin/coupons?notice=${encodeURIComponent(error ? error.message : count ? "That coupon has been used, so it was switched off instead of deleted." : "Coupon deleted.")}`);
}
