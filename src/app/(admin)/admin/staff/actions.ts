"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

export type StaffState = { ok?: string; error?: string; values?: { email: string; role: string } };
const Role = z.enum(["super_admin", "store_manager", "product_manager", "order_manager"]);

export async function addStaff(_: StaffState, form: FormData): Promise<StaffState> {
  try {
    await requirePermission("staff.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const values = { email: String(form.get("email") ?? ""), role: String(form.get("role") ?? "") };
  const parsed = z.object({ email: z.string().trim().email("Enter a valid email."), role: Role }).safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const supabase = await supabaseForUser();
  // The database function re-checks the permission and records the change in the audit log.
  const { error } = await supabase.rpc("grant_role", { p_email: parsed.data.email, p_role: parsed.data.role });
  if (error) return { error: error.message, values };
  revalidatePath("/admin/staff");
  return { ok: `${parsed.data.email} can now sign in to the admin.` };
}

export async function removeRole(form: FormData): Promise<void> {
  let message: string | null = null;
  try {
    await requirePermission("staff.manage");
    const parsed = z.object({ user: z.string().uuid(), role: Role }).parse({ user: form.get("user"), role: form.get("role") });
    const supabase = await supabaseForUser();
    const { error } = await supabase.rpc("revoke_role", { p_user: parsed.user, p_role: parsed.role });
    if (error) message = error.message;
  } catch (e) {
    message = (e as Error).message;
  }
  revalidatePath("/admin/staff");
  redirect(message ? `/admin/staff?error=${encodeURIComponent(message)}` : "/admin/staff");
}
