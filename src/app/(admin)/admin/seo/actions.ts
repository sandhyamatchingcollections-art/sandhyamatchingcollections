"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

export type SeoState = { ok?: string; error?: string };
const Input = z.object({
  seo_title: z.string().trim().max(70, "Title: up to 70 characters"), seo_description: z.string().trim().max(170, "Description: up to 170 characters"),
  og_image_url: z.string().url().or(z.literal("")),
});

export async function saveSeo(_: SeoState, form: FormData): Promise<SeoState> {
  try { await requirePermission("content.write"); } catch (e) { return { error: (e as Error).message }; }
  const parsed = Input.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = await supabaseForUser();
  const { error } = await s.rpc("update_seo_settings", { p: parsed.data });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Saved. Google picks up changes the next time it visits your site." };
}
