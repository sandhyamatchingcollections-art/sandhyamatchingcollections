"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

export type ShippingState = { ok?: string; error?: string };

const rupees = (opt: boolean) => z.string().trim().transform((v, ctx) => {
  if (v === "") { if (!opt) ctx.addIssue({ code: "custom", message: "Enter an amount" }); return null; }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) { ctx.addIssue({ code: "custom", message: "Enter a valid amount in rupees" }); return null; }
  return Math.round(n * 100);
});
const Input = z.object({
  shipping_fee: rupees(false), free_shipping_min: rupees(true), cod_fee: rupees(false), cod_max_total: rupees(true),
  cod_enabled: z.boolean(),
  delivery_min_days: z.coerce.number().int().min(1, "At least 1 day").max(60),
  delivery_max_days: z.coerce.number().int().min(1).max(90, "At most 90 days"),
});

export async function saveShipping(_: ShippingState, form: FormData): Promise<ShippingState> {
  try { await requirePermission("settings.store"); } catch (e) { return { error: (e as Error).message }; }
  const parsed = Input.safeParse({
    shipping_fee: String(form.get("shipping_fee") ?? ""), free_shipping_min: String(form.get("free_shipping_min") ?? ""),
    cod_fee: String(form.get("cod_fee") ?? ""), cod_max_total: String(form.get("cod_max_total") ?? ""),
    cod_enabled: form.get("cod_enabled") === "on",
    delivery_min_days: form.get("delivery_min_days"), delivery_max_days: form.get("delivery_max_days"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = await supabaseForUser();
  const { error } = await s.rpc("update_checkout_settings", { p: parsed.data });
  if (error) return { error: error.message };
  revalidatePath("/admin/shipping");
  return { ok: "Shipping settings saved. Checkout uses them right away." };
}
