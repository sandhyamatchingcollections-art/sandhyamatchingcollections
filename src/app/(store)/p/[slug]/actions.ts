"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { supabaseForUser } from "@/lib/supabase/server";

export type ReviewState = { ok?: string; error?: string };

const Input = z.object({
  product: z.string().uuid(), slug: z.string().max(80),
  rating: z.coerce.number().int().min(1, "Choose a star rating").max(5),
  name: z.string().trim().min(2, "Enter your name").max(60),
  title: z.string().trim().max(100), body: z.string().trim().max(2000),
});

/** Verified buyers only (the database checks for a delivered order). Reviews appear after approval. */
export async function submitReview(_: ReviewState, form: FormData): Promise<ReviewState> {
  const parsed = Input.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = parsed.data;
  const s = await supabaseForUser();
  const { error } = await s.rpc("submit_review", { p_product: r.product, p_rating: r.rating, p_title: r.title, p_body: r.body, p_name: r.name });
  if (error) return { error: error.message };
  revalidatePath(`/p/${r.slug}`);
  return { ok: "Thank you! Your review will appear once it's approved." };
}
