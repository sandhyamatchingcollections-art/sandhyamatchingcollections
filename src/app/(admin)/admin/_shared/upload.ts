"use server";

import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { storageUrl } from "@/lib/supabase/env";
import { processImage, uploadImage } from "@/server/admin/images";

/** Upload a homepage / banner / share image. Returns its public URL (stored in the content). */
export async function uploadCampaignImage(_: unknown, form: FormData): Promise<{ url?: string; error?: string }> {
  try {
    await requirePermission("content.write");
    const folder = String(form.get("folder") ?? "home").replace(/[^a-z0-9-]/g, "") || "home";
    const data = await processImage(form.get("file") as File);
    const s = await supabaseForUser();
    const path = await uploadImage(s, "campaign-images", folder, data);
    return { url: storageUrl("campaign-images", path) ?? undefined };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
