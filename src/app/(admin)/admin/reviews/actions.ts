"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

export async function moderateReview(form: FormData): Promise<void> {
  await requirePermission("catalog.write");
  const p = z.object({ id: z.string().uuid(), status: z.enum(["approved", "hidden", "pending"]), tab: z.string().max(20) })
    .parse({ id: form.get("id"), status: form.get("status"), tab: String(form.get("tab") ?? "pending") });
  const s = await supabaseForUser();
  await s.rpc("set_review_status", { p_review: p.id, p_status: p.status });
  revalidatePath("/admin/reviews"); revalidatePath("/p/[slug]", "page");
  redirect(`/admin/reviews?tab=${p.tab}`);
}
