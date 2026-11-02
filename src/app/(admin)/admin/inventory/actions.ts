"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { friendlyDbError } from "@/server/admin/errors";

export type StockState = { ok?: string; error?: string };

const decimal = /^\d{1,6}(\.\d{1,3})?$/;
const Input = z.object({
  variant_id: z.string().uuid(),
  mode: z.enum(["add", "remove", "set"]),
  amount: z.string().trim().regex(decimal, "Enter a number like 5 or 2.5").transform(Number),
  note: z.string().trim().max(200).default(""),
});

/** Add, remove or set stock. Every change goes through adjust_stock(), which logs who/when/why. */
export async function adjustStock(_: StockState, form: FormData): Promise<StockState> {
  try {
    await requirePermission("inventory.write");
    const parsed = Input.safeParse({
      variant_id: form.get("variant_id"), mode: form.get("mode"), amount: form.get("amount") ?? "", note: form.get("note") ?? "",
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const { variant_id, mode, amount, note } = parsed.data;
    const s = await supabaseForUser();
    const { data: cur, error: e1 } = await s.from("admin_stock").select("on_hand, reserved, unit").eq("variant_id", variant_id).single();
    if (e1 || !cur) return { error: "That item wasn't found." };
    const onHand = Number(cur.on_hand);
    const delta = mode === "add" ? amount : mode === "remove" ? -amount : amount - onHand;
    if (delta === 0) return { error: "No change — the amount is the same." };
    if (onHand + delta < 0) return { error: `Stock can't go below zero — only ${onHand} in stock.` };
    if (onHand + delta < Number(cur.reserved)) return { error: `Can't go below ${Number(cur.reserved)}: that much is reserved by orders in progress.` };
    const { data, error } = await s.rpc("adjust_stock", {
      p_variant: variant_id, p_delta: delta, p_reason: "adjustment", p_note: note || (mode === "set" ? "Stock count" : null),
    });
    if (error) return { error: friendlyDbError(error) };
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${variant_id}`);
    return { ok: `Stock is now ${Number(data)}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setThreshold(_: StockState, form: FormData): Promise<StockState> {
  try {
    await requirePermission("inventory.write");
    const variant_id = z.string().uuid().parse(form.get("variant_id"));
    const raw = String(form.get("threshold") ?? "").trim();
    if (!decimal.test(raw)) return { error: "Enter a number like 5 or 2.5" };
    const s = await supabaseForUser();
    const { error } = await s.from("inventory").update({ low_stock_threshold: Number(raw) }).eq("variant_id", variant_id);
    if (error) return { error: friendlyDbError(error) };
    revalidatePath(`/admin/inventory/${variant_id}`);
    return { ok: "Low-stock alert level saved." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
