"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

export type StoreState = { ok?: string; error?: string };
const url = (label: string) => z.string().trim().refine((v) => v === "" || /^https:\/\/\S+$/.test(v), `${label} must start with https://`);
const Input = z.object({
  name: z.string().trim().min(2, "Enter the store name").max(80),
  tagline: z.string().trim().max(120), description: z.string().trim().max(400), announcement: z.string().trim().max(140),
  shipping_note: z.string().trim().max(120), returns_note: z.string().trim().max(200),
  whatsapp: z.string().trim().refine((v) => v === "" || /^\+?[0-9\s-]{10,17}$/.test(v), "WhatsApp: enter the number with country code, e.g. 91 98859 49698")
    .transform((v) => { const d = v.replace(/\D/g, ""); return d.length === 10 ? `91${d}` : d; }),
  instagram_url: url("Instagram link"), instagram_handle: z.string().trim().max(60).transform((v) => v.replace(/^@/, "")), facebook_url: url("Facebook link"),
  email: z.string().trim().refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email"),
  phone: z.string().trim().max(30), address: z.string().trim().max(300),
  new_arrival_days: z.coerce.number().int().min(1).max(365),
});

export async function saveStore(_: StoreState, form: FormData): Promise<StoreState> {
  try { await requirePermission("settings.store"); } catch (e) { return { error: (e as Error).message }; }
  const parsed = Input.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = await supabaseForUser();
  const { error } = await s.rpc("update_store_settings", { p: parsed.data });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Store settings saved. The whole site uses them right away." };
}
