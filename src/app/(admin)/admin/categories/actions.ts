"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { friendlyDbError } from "@/server/admin/errors";
import { processImage, removeImageIfUnused, uploadImage } from "@/server/admin/images";

export type FormState = { error?: string; ok?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

const slugRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const optional = (max: number) => z.string().trim().max(max).transform((v) => v || null);

const CategoryInput = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  name: z.string().trim().min(1, "Enter a name.").max(80),
  slug: z.string().trim().toLowerCase().regex(slugRe, "Use lowercase letters, numbers and hyphens, e.g. silk-sarees."),
  parent_id: z.string().uuid().nullable().or(z.literal("").transform(() => null)),
  description: optional(2000),
  is_active: z.enum(["on"]).optional().transform((v) => v === "on"),
  seo_title: optional(70),
  seo_description: optional(170),
});

function values(form: FormData) {
  return Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

export async function saveCategory(_: FormState, form: FormData): Promise<FormState> {
  const v = values(form);
  try { await requirePermission("catalog.write"); } catch (e) { return { error: (e as Error).message, values: v }; }
  const parsed = CategoryInput.safeParse({ ...v, is_active: form.get("is_active") ?? undefined });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors, values: v };
  }
  const { id, ...row } = parsed.data;
  if (id && row.parent_id === id) return { error: "A category can't be its own parent.", values: v };

  const s = await supabaseForUser();
  if (id) {
    const { error } = await s.from("categories").update(row).eq("id", id);
    if (error) return { error: friendlyDbError(error), values: v };
    revalidatePath("/admin/categories");
    return { ok: "Saved.", values: v };
  }
  // New categories go to the end of their level.
  let last = s.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  last = row.parent_id ? last.eq("parent_id", row.parent_id) : last.is("parent_id", null);
  const sort_order = (((await last).data?.[0]?.sort_order as number | undefined) ?? 0) + 1;
  const { data, error } = await s.from("categories").insert({ ...row, sort_order }).select("id").single();
  if (error) return { error: friendlyDbError(error), values: v };
  revalidatePath("/admin/categories");
  redirect(`/admin/categories/${data.id}?created=1`);
}

export async function toggleCategory(form: FormData) {
  await requirePermission("catalog.write");
  const id = z.string().uuid().parse(form.get("id"));
  const active = form.get("active") === "true";
  const s = await supabaseForUser();
  const { error } = await s.from("categories").update({ is_active: active }).eq("id", id);
  if (error) redirect(`/admin/categories?error=${encodeURIComponent(friendlyDbError(error))}`);
  revalidatePath("/admin/categories");
}

/** Move a category one place up or down among its siblings. */
export async function moveCategory(form: FormData) {
  await requirePermission("catalog.write");
  const id = z.string().uuid().parse(form.get("id"));
  const dir = z.enum(["up", "down"]).parse(form.get("dir"));
  const s = await supabaseForUser();
  const { data: me } = await s.from("categories").select("parent_id").eq("id", id).single();
  let q = s.from("categories").select("id").order("sort_order").order("name");
  q = me?.parent_id ? q.eq("parent_id", me.parent_id) : q.is("parent_id", null);
  const ids = ((await q).data ?? []).map((r) => r.id as string);
  const i = ids.indexOf(id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const { error } = await s.rpc("reorder_categories", { p_ids: ids });
  if (error) redirect(`/admin/categories?error=${encodeURIComponent(friendlyDbError(error))}`);
  revalidatePath("/admin/categories");
}

export async function uploadCategoryImage(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requirePermission("catalog.write");
    const id = z.string().uuid().parse(form.get("id"));
    const kind = z.enum(["image", "banner"]).parse(form.get("kind"));
    const data = await processImage(form.get("file") as File);
    const s = await supabaseForUser();
    const col = kind === "image" ? "image_path" : "banner_path";
    const { data: before } = await s.from("categories").select(col).eq("id", id).single();
    const path = await uploadImage(s, "product-images", `categories/${id}`, data);
    const { error } = await s.from("categories").update({ [col]: path }).eq("id", id);
    if (error) return { error: friendlyDbError(error) };
    const old = (before as Record<string, string | null> | null)?.[col];
    if (old) await removeImageIfUnused(s, "product-images", old, "categories");
    revalidatePath(`/admin/categories/${id}`);
    return { ok: kind === "image" ? "Category photo updated." : "Banner updated." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function removeCategoryImage(form: FormData) {
  await requirePermission("catalog.write");
  const id = z.string().uuid().parse(form.get("id"));
  const kind = z.enum(["image", "banner"]).parse(form.get("kind"));
  const col = kind === "image" ? "image_path" : "banner_path";
  const s = await supabaseForUser();
  const { data: before } = await s.from("categories").select(col).eq("id", id).single();
  await s.from("categories").update({ [col]: null }).eq("id", id);
  const old = (before as Record<string, string | null> | null)?.[col];
  if (old) await removeImageIfUnused(s, "product-images", old, "categories");
  revalidatePath(`/admin/categories/${id}`);
}

const AttributeRows = z.array(z.object({
  id: z.string().uuid().optional(),
  key: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{0,39}$/, "Filter keys use lowercase letters, numbers and underscores, starting with a letter."),
  label: z.string().trim().min(1, "Every filter needs a label.").max(40),
  type: z.enum(["select", "color", "text"]),
  options: z.array(z.string().trim().min(1).max(60)).max(60),
  is_filterable: z.boolean(),
})).max(20);

/** Replace the filter definitions of one category. */
export async function saveAttributes(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requirePermission("catalog.write");
    const categoryId = z.string().uuid().parse(form.get("category_id"));
    let raw: unknown;
    try { raw = JSON.parse(String(form.get("rows") ?? "[]")); } catch { return { error: "Couldn't read the filters." }; }
    const parsed = AttributeRows.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const keys = parsed.data.map((r) => r.key);
    if (new Set(keys).size !== keys.length) return { error: "Two filters have the same key." };

    const s = await supabaseForUser();
    const { data: existing } = await s.from("category_attributes").select("id").eq("category_id", categoryId);
    const keep = new Set(parsed.data.map((r) => r.id).filter(Boolean));
    const removed = (existing ?? []).map((e) => e.id as string).filter((x) => !keep.has(x));
    if (removed.length) {
      const { error } = await s.from("category_attributes").delete().in("id", removed);
      if (error) return { error: friendlyDbError(error) };
    }
    for (const [i, r] of parsed.data.entries()) {
      const row = { category_id: categoryId, key: r.key, label: r.label, type: r.type, options: r.options, is_filterable: r.is_filterable, sort_order: i };
      const { error } = r.id
        ? await s.from("category_attributes").update(row).eq("id", r.id)
        : await s.from("category_attributes").insert(row);
      if (error) return { error: friendlyDbError(error) };
    }
    revalidatePath(`/admin/categories/${categoryId}`);
    return { ok: "Filters saved." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteCategory(_: FormState, form: FormData): Promise<FormState> {
  let name = "";
  try {
    await requirePermission("catalog.write");
    const id = z.string().uuid().parse(form.get("id"));
    const moveTo = z.string().uuid().nullable().parse(form.get("move_to") || null);
    const s = await supabaseForUser();
    const { data: cat } = await s.from("categories").select("name, image_path, banner_path").eq("id", id).single();
    name = cat?.name ?? "";
    const { error } = await s.rpc("delete_category", { p_id: id, p_move_to: moveTo });
    if (error) return { error: friendlyDbError(error) };
    for (const p of [cat?.image_path, cat?.banner_path]) if (p) await removeImageIfUnused(s, "product-images", p, "categories");
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/admin/categories");
  redirect(`/admin/categories?deleted=${encodeURIComponent(name)}`);
}
