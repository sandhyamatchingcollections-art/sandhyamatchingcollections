"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { homeConfigSchemas } from "@/lib/home-schema";

export type SectionState = { error?: string };

export async function saveSection(_: SectionState, form: FormData): Promise<SectionState> {
  try { await requirePermission("content.write"); } catch (e) { return { error: (e as Error).message }; }
  const id = String(form.get("id") ?? "");
  const s = await supabaseForUser();
  const { data: row } = await s.from("homepage_sections").select("type").eq("id", id).maybeSingle();
  if (!row) return { error: "Section not found." };
  let config: unknown;
  try { config = JSON.parse(String(form.get("config") ?? "")); } catch { return { error: "The form couldn't be read. Please reload." }; }
  const schema = homeConfigSchemas[row.type as keyof typeof homeConfigSchemas];
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `${i.path.join(" › ") || "Section"}: ${i.message}` };
  }
  const { error } = await s.from("homepage_sections").update({ config: parsed.data, is_enabled: form.get("is_enabled") === "on" }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/"); revalidatePath("/admin/homepage");
  redirect(`/admin/homepage?notice=${encodeURIComponent("Section saved — it's live on the homepage.")}`);
}

export async function toggleSection(form: FormData): Promise<void> {
  await requirePermission("content.write");
  const id = z.string().max(40).parse(form.get("id"));
  const s = await supabaseForUser();
  await s.from("homepage_sections").update({ is_enabled: form.get("on") === "1" }).eq("id", id);
  revalidatePath("/"); revalidatePath("/admin/homepage");
  redirect("/admin/homepage");
}

export async function moveSection(form: FormData): Promise<void> {
  await requirePermission("content.write");
  const ids = z.array(z.string().max(40)).parse(JSON.parse(String(form.get("order") ?? "[]")));
  const s = await supabaseForUser();
  await s.rpc("reorder_home_sections", { p_ids: ids });
  revalidatePath("/"); revalidatePath("/admin/homepage");
  redirect("/admin/homepage");
}
