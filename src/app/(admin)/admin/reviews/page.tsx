import Link from "next/link";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { moderateReview } from "./actions";

export const metadata = { title: "Reviews" };
export const dynamic = "force-dynamic";
const TABS = [["pending", "Waiting for approval"], ["approved", "Approved"], ["hidden", "Hidden"]] as const;

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!(await canUse("catalog.write"))) return <NoAccess what="reviews" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "pending";
  const s = await supabaseForUser();
  const { data } = await s.from("product_reviews").select("id, author_name, rating, title, body, verified, created_at, products(name, slug)")
    .eq("status", tab).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as { id: string; author_name: string; rating: number; title: string | null; body: string | null; verified: boolean; created_at: string; products: { name: string; slug: string } | null }[];
  const btn = (id: string, status: string, label: string, cls: string) => (
    <form action={moderateReview}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} /><input type="hidden" name="tab" value={tab} />
      <SubmitButton className={cls} pendingText="…">{label}</SubmitButton></form>
  );
  return (
    <div className="max-w-4xl">
      <PageHeader title="Reviews & Ratings">Only customers whose order was delivered can review. Reviews appear on the product page after you approve them.</PageHeader>
      <nav className="mb-4 flex gap-1.5" aria-label="Review status">
        {TABS.map(([k, l]) => <Link key={k} href={`/admin/reviews?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm ${tab === k ? "bg-cocoa text-cream" : "border border-champagne bg-cream"}`}>{l}</Link>)}
      </nav>
      {rows.length === 0 ? <p className="rounded-2xl border border-dashed border-champagne bg-cream p-8 text-center text-taupe">No reviews here.</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-champagne bg-cream p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm"><span className="text-champagne-deep" aria-label={`${r.rating} stars`}>{"★".repeat(r.rating)}<span className="text-cocoa/25">{"★".repeat(5 - r.rating)}</span></span> {r.title && <strong className="ml-1">{r.title}</strong>}</p>
                  {r.products && <Link href={`/p/${r.products.slug}`} target="_blank" className="text-xs text-taupe underline underline-offset-4">{r.products.name}</Link>}
                </div>
                <div className="flex gap-2">
                  {tab !== "approved" && btn(r.id, "approved", "Approve", "min-h-9 rounded-full bg-cocoa px-4 text-xs font-medium text-cream")}
                  {tab !== "hidden" && btn(r.id, "hidden", "Hide", "min-h-9 rounded-full border border-champagne px-4 text-xs hover:border-cocoa/40")}
                </div>
              </div>
              {r.body && <p className="mt-2 whitespace-pre-line text-sm text-cocoa-soft">{r.body}</p>}
              <p className="mt-2 text-xs text-taupe">{r.author_name}{r.verified && " · Verified buyer"} · {new Date(r.created_at).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
