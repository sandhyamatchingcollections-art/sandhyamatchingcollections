"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

export type TaxState = { ok?: string; error?: string };
const Rate = z.coerce.number().refine((n) => [0, 3, 5, 12, 18, 28].includes(n), "Choose a GST rate");
const Input = z.object({
  gstin: z.string().trim().toUpperCase().regex(/^([0-9]{2}[A-Z0-9]{13})?$/, "GSTIN is 15 characters, starting with the 2-digit state code"),
  legal_name: z.string().trim().max(120),
  gst_state: z.string().trim().max(60),
  address: z.string().trim().max(300),
  default_gst_rate: Rate, shipping_gst_rate: Rate,
  invoice_prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/, "Invoice prefix: up to 10 letters/numbers"),
});

export async function saveTax(_: TaxState, form: FormData): Promise<TaxState> {
  try { await requirePermission("settings.store"); } catch (e) { return { error: (e as Error).message }; }
  const parsed = Input.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = await supabaseForUser();
  const { error } = await s.rpc("update_tax_settings", { p: parsed.data });
  if (error) return { error: error.message };
  revalidatePath("/admin/tax");
  return { ok: "Tax settings saved. New invoices use them." };
}
