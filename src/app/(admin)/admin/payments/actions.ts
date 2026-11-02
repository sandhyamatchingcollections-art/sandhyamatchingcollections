"use server";

import { revalidatePath } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

export async function toggleOnlinePayments(form: FormData): Promise<void> {
  await requirePermission("settings.payments");
  const s = await supabaseForUser();
  const { error } = await s.rpc("set_online_payments", { p_on: form.get("on") === "1" });
  revalidatePath("/admin/payments");
  redirect(error ? `/admin/payments?error=${encodeURIComponent(error.message)}` : "/admin/payments?saved=1");
}
