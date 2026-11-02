import Link from "next/link";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { Notice, PageHeader } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";

export const metadata = { title: "Pages & Policies" };
export const dynamic = "force-dynamic";

export default async function PagesAdmin({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  if (!(await canUse("content.write"))) return <NoAccess what="pages" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const sp = await searchParams;
  const s = await supabaseForUser();
  const { data } = await s.from("content_pages").select("slug, title, is_published, updated_at").order("sort_order");
  const rows = (data ?? []) as { slug: string; title: string; is_published: boolean; updated_at: string }[];
  return (
    <div className="max-w-3xl">
      <PageHeader title="Pages & Policies">FAQ, contact and policy pages linked from the footer. Starter drafts are ready — review, edit and publish each one.</PageHeader>
      {sp.notice && <div className="mb-4"><Notice tone="success">{sp.notice.slice(0, 200)}</Notice></div>}
      <ul className="divide-y divide-champagne rounded-2xl border border-champagne bg-cream">
        {rows.map((p) => (
          <li key={p.slug} className="flex items-center justify-between gap-3 px-5 py-4">
            <div>
              <Link href={`/admin/pages/${p.slug}`} className="font-medium hover:underline">{p.title}</Link>
              <p className="text-xs text-taupe">/pages/{p.slug} · edited {new Date(p.updated_at).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}</p>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${p.is_published ? "bg-sage text-cocoa" : "bg-peach text-cocoa"}`}>{p.is_published ? "Published" : "Draft"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-taupe">Please have your policies checked by someone who knows the rules for online stores in India.</p>
    </div>
  );
}
