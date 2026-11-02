"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

export type PageState = { error?: string };
const Input = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,40}$/), title: z.string().trim().min(2, "Enter a title").max(80), body: z.string().max(50000), is_published: z.boolean() });

export async function savePage(_: PageState, form: FormData): Promise<PageState> {
  try { await requirePermission("content.write"); } catch (e) { return { error: (e as Error).message }; }
  const parsed = Input.safeParse({ ...Object.fromEntries(form.entries()), is_published: form.get("is_published") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  const s = await supabaseForUser();
  const { error } = await s.from("content_pages").update({ title: p.title, body: p.body, is_published: p.is_published }).eq("slug", p.slug);
  if (error) return { error: error.message };
  revalidatePath(`/pages/${p.slug}`); revalidatePath("/admin/pages");
  redirect(`/admin/pages?notice=${encodeURIComponent(`${p.title} saved${p.is_published ? " and published" : " as a draft"}.`)}`);
}
