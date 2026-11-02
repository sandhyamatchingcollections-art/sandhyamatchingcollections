"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import type { Review, ReviewSummary } from "@/lib/types";
import { submitReview, type ReviewState } from "./actions";

export function Stars({ value, className = "size-4" }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${className} ${value >= n - 0.25 ? "fill-champagne-deep text-champagne-deep" : value >= n - 0.75 ? "fill-champagne-deep/50 text-champagne-deep" : "text-cocoa/25"}`} strokeWidth={1.5} />
      ))}
    </span>
  );
}

const field = "mt-1 w-full rounded-xl border border-champagne bg-ivory px-4 py-2.5 text-[15px] focus:border-cocoa/50 focus:outline-none";

function ReviewForm({ productId, slug, existing }: { productId: string; slug: string; existing: { rating: number; title: string | null; body: string | null; author_name: string; status: string } | null }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(submitReview, {});
  const [rating, setRating] = useState(existing?.rating ?? 0);
  if (state.ok) return <p role="status" className="rounded-2xl bg-sage/50 p-4 text-sm text-cocoa">{state.ok}</p>;
  return (
    <form action={action} className="space-y-3 rounded-3xl border border-champagne bg-cream p-5">
      <p className="font-medium">{existing ? "Edit your review" : "Write a review"}</p>
      {existing?.status === "pending" && <p className="text-xs text-taupe">Your review is waiting for approval.</p>}
      <input type="hidden" name="product" value={productId} /><input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="rating" value={rating} />
      <fieldset>
        <legend className="text-sm">Your rating</legend>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={rating === n} className="rounded p-0.5">
              <Star className={`size-7 ${rating >= n ? "fill-champagne-deep text-champagne-deep" : "text-cocoa/30"}`} strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm">Your name<input name="name" required maxLength={60} defaultValue={existing?.author_name ?? ""} className={field} /></label>
      <label className="block text-sm">Title (optional)<input name="title" maxLength={100} defaultValue={existing?.title ?? ""} className={field} /></label>
      <label className="block text-sm">Your review (optional)<textarea name="body" rows={4} maxLength={2000} defaultValue={existing?.body ?? ""} className={field} /></label>
      {state.error && <p role="alert" className="text-sm text-rose">{state.error}</p>}
      <button disabled={pending || !rating} className="min-h-11 rounded-full bg-cocoa px-6 text-sm font-medium text-cream disabled:opacity-50">{pending ? "Sending…" : "Submit review"}</button>
    </form>
  );
}

export function Reviews({ productId, slug, summary, reviews, me, signedIn }: {
  productId: string; slug: string; summary: ReviewSummary; reviews: Review[]; signedIn: boolean;
  me: { can_review: boolean; review: { rating: number; title: string | null; body: string | null; author_name: string; status: string } | null } | null;
}) {
  return (
    <section id="reviews" className="mt-16 scroll-mt-40">
      <h2 className="text-3xl font-medium">Customer reviews</h2>
      <div className="mt-6 grid gap-8 md:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          {summary.count > 0 ? (
            <div>
              <p className="flex items-center gap-3"><span className="font-display text-5xl text-cocoa">{summary.average.toFixed(1)}</span><Stars value={summary.average} className="size-5" /></p>
              <p className="text-sm text-taupe">{summary.count} review{summary.count === 1 ? "" : "s"}</p>
              <ul className="mt-3 space-y-1 text-xs text-taupe">
                {(["5", "4", "3", "2", "1"] as const).map((k) => {
                  const c = Number(summary.stars?.[k] ?? 0);
                  return (
                    <li key={k} className="flex items-center gap-2">{k}★
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-champagne"><span className="block h-full rounded-full bg-cocoa" style={{ width: `${summary.count ? (c / summary.count) * 100 : 0}%` }} /></span>
                      <span className="w-6 text-right">{c}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : <p className="text-sm text-taupe">No reviews yet.</p>}
          {me?.can_review ? <ReviewForm productId={productId} slug={slug} existing={me.review} />
            : signedIn ? <p className="text-xs text-taupe">You can review this product after your order of it is delivered.</p>
            : <p className="text-sm text-taupe">Bought this? <Link href={`/login?next=/p/${slug}%23reviews`} className="underline underline-offset-4">Sign in</Link> to write a review.</p>}
        </div>
        <ul className="space-y-5">
          {reviews.map((r) => (
            <li key={r.id} className="border-b border-champagne pb-5">
              <div className="flex flex-wrap items-center gap-3"><Stars value={r.rating} />{r.title && <p className="font-medium">{r.title}</p>}</div>
              {r.body && <p className="mt-2 whitespace-pre-line leading-relaxed text-cocoa-soft">{r.body}</p>}
              <p className="mt-2 text-xs text-taupe">{r.author_name}{r.verified && " · Verified buyer"} · {new Date(r.created_at).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
