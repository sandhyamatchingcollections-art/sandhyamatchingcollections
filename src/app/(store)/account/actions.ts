"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { getUser } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

// `values` echoes what was typed, so the form keeps it after React resets the inputs.
export type ProfileState = { ok?: boolean; error?: string; values?: { full_name: string; phone: string } };

// Only these two fields can ever be written — no mass assignment.
const Profile = z.object({
  full_name: z.string().trim().max(120).transform((v) => v || null),
  phone: z.string().trim().transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => v === "" || /^(\+91)?[6-9][0-9]{9}$/.test(v), "Enter a 10-digit Indian mobile number.")
    .transform((v) => v || null),
});

export async function updateProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await getUser();
  if (!user) return { error: "Please sign in again." };
  const values = { full_name: String(form.get("full_name") ?? ""), phone: String(form.get("phone") ?? "") };
  const parsed = Profile.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const supabase = await supabaseForUser();
  // RLS also restricts this to the user's own row.
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { error: "Couldn't save. Please try again.", values };
  revalidatePath("/account");
  return { ok: true, values };
}

/** Delete one of the signed-in customer's saved addresses (RLS limits it to their own). */
export async function deleteAddress(form: FormData): Promise<void> {
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success || !(await getUser())) return;
  const supabase = await supabaseForUser();
  await supabase.from("addresses").delete().eq("id", id.data);
  revalidatePath("/account");
}
