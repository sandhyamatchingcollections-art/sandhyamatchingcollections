"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { friendlyDbError } from "@/server/admin/errors";

export type CollectionState = { ok?: string; error?: string; values?: Record<string, string> };

const Input = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  title: z.string().trim().min(1, "Enter a title").max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens"),
  description: z.string().trim().max(500).transform((v) => v || null),
  is_active: z.boolean(),
});

export async function saveCollection(_: CollectionState, form: FormData): Promise<CollectionState> {
  const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  try { await requirePermission("catalog.write"); } catch (e) { return { error: (e as Error).message, values }; }
  const parsed = Input.safeParse({ ...values, is_active: form.get("is_active") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const { id, ...row } = parsed.data;
  const s = await supabaseForUser();
  if (id) {
    // The web address of an existing collection is fixed: homepage sections point at it.
    const { error } = await s.from("collections").update({ title: row.title, description: row.description, is_active: row.is_active }).eq("id", id);
    if (error) return { error: friendlyDbError(error), values };
    revalidatePath(`/admin/collections/${id}`);
    return { ok: "Saved.", values };
  }
  const { data, error } = await s.from("collections").insert(row).select("id").single();
  if (error) return { error: friendlyDbError(error), values };
  revalidatePath("/admin/collections");
  redirect(`/admin/collections/${data.id}`);
}

/** Add, remove or reorder products inside a collection. */
export async function collectionProduct(form: FormData) {
  await requirePermission("catalog.write");
  const collection = z.string().uuid().parse(form.get("collection_id"));
  const product = z.string().uuid().safeParse(form.get("product_id"));
  const op = z.enum(["add", "remove", "up", "down"]).parse(form.get("op"));
  if (!product.success) redirect(`/admin/collections/${collection}?error=${encodeURIComponent("Choose a product to add.")}`);
  const s = await supabaseForUser();
  const { data: rows } = await s.from("collection_products").select("product_id").eq("collection_id", collection).order("sort_order");
  let ids = (rows ?? []).map((r) => r.product_id as string);
  if (op === "add" && !ids.includes(product.data)) ids.push(product.data);
  if (op === "remove") ids = ids.filter((x) => x !== product.data);
  if (op === "up" || op === "down") {
    const i = ids.indexOf(product.data), j = op === "up" ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < ids.length) [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  if (op === "remove") await s.from("collection_products").delete().eq("collection_id", collection).eq("product_id", product.data);
  const { error } = await s.from("collection_products").upsert(ids.map((pid, n) => ({ collection_id: collection, product_id: pid, sort_order: n })));
  if (error) redirect(`/admin/collections/${collection}?error=${encodeURIComponent(friendlyDbError(error))}`);
  revalidatePath(`/admin/collections/${collection}`);
}
