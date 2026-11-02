"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

export type OfferState = { error?: string };
const date = z.string().trim().transform((v) => (v ? new Date(`${v}T00:00:00+05:30`).toISOString() : null));
const Input = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  title: z.string().trim().min(1, "Enter a title").max(120),
  description: z.string().trim().max(500),
  starts: date, ends: date, is_active: z.boolean(),
});

export async function saveOffer(_: OfferState, form: FormData): Promise<OfferState> {
  try { await requirePermission("promotions.write"); } catch (e) { return { error: (e as Error).message }; }
  const parsed = Input.safeParse({ ...Object.fromEntries(form.entries()), is_active: form.get("is_active") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const o = parsed.data;
  if (o.ends && o.starts && o.ends <= o.starts) return { error: "The end date must be after the start date." };
  const row = { title: o.title, description: o.description || null, starts_at: o.starts ?? new Date().toISOString(), ends_at: o.ends, is_active: o.is_active };
  const s = await supabaseForUser();
  const { error } = o.id ? await s.from("promotions").update(row).eq("id", o.id) : await s.from("promotions").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/admin/offers"); revalidatePath("/");
  redirect(`/admin/offers?notice=${encodeURIComponent("Offer saved.")}`);
}

export async function deleteOffer(form: FormData): Promise<void> {
  await requirePermission("promotions.write");
  const id = z.string().uuid().parse(form.get("id"));
  const s = await supabaseForUser();
  await s.from("promotions").delete().eq("id", id);
  revalidatePath("/admin/offers"); revalidatePath("/");
  redirect(`/admin/offers?notice=${encodeURIComponent("Offer deleted.")}`);
}
