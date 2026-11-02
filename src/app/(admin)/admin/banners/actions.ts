"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

export type BannerState = { error?: string };
const date = z.string().trim().transform((v) => (v ? new Date(`${v}T00:00:00+05:30`).toISOString() : null));
const Input = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  image_url: z.string().url("Upload the banner photo"),
  mobile_image_url: z.string().url().or(z.literal("")).transform((v) => v || null),
  alt: z.string().trim().max(160), title: z.string().trim().max(80), subtitle: z.string().trim().max(160),
  cta_label: z.string().trim().max(30),
  link: z.string().trim().regex(/^(\/[A-Za-z0-9\-_/?=&.%]*)?$/, "Link must be a page on your site, like /collections/bridal"),
  text_color: z.enum(["dark", "light"]), starts: date, ends: date, is_active: z.boolean(),
});

export async function saveBanner(_: BannerState, form: FormData): Promise<BannerState> {
  try { await requirePermission("content.write"); } catch (e) { return { error: (e as Error).message }; }
  const parsed = Input.safeParse({ ...Object.fromEntries(form.entries()), is_active: form.get("is_active") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const b = parsed.data;
  if (b.ends && b.starts && b.ends <= b.starts) return { error: "The end date must be after the start date." };
  const row = { image_url: b.image_url, mobile_image_url: b.mobile_image_url, alt: b.alt, title: b.title || null, subtitle: b.subtitle || null,
    cta_label: b.cta_label || null, link: b.link || null, text_color: b.text_color, starts_at: b.starts ?? new Date().toISOString(), ends_at: b.ends, is_active: b.is_active };
  const s = await supabaseForUser();
  let error;
  if (b.id) ({ error } = await s.from("banners").update(row).eq("id", b.id));
  else {
    const { data: last } = await s.from("banners").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    ({ error } = await s.from("banners").insert({ ...row, sort_order: (last?.[0]?.sort_order ?? 0) + 1 }));
  }
  if (error) return { error: error.message };
  revalidatePath("/"); revalidatePath("/admin/banners");
  redirect(`/admin/banners?notice=${encodeURIComponent("Banner saved.")}`);
}

export async function bannerAction(form: FormData): Promise<void> {
  await requirePermission("content.write");
  const id = z.string().uuid().parse(form.get("id"));
  const op = String(form.get("op"));
  const s = await supabaseForUser();
  if (op === "delete") await s.from("banners").delete().eq("id", id);
  if (op === "up" || op === "down") {
    const { data } = await s.from("banners").select("id, sort_order").order("sort_order").order("created_at");
    const list = (data ?? []) as { id: string }[];
    const i = list.findIndex((x) => x.id === id), j = op === "up" ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < list.length) {
      [list[i], list[j]] = [list[j], list[i]];
      await Promise.all(list.map((x, k) => s.from("banners").update({ sort_order: k + 1 }).eq("id", x.id)));
    }
  }
  revalidatePath("/"); revalidatePath("/admin/banners");
  redirect("/admin/banners");
}
