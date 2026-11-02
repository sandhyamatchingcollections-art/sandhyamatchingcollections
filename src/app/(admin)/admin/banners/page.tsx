import Link from "next/link";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { Notice, PageHeader, btnPrimary } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { bannerAction } from "./actions";

export const metadata = { title: "Promotional Banners" };
export const dynamic = "force-dynamic";
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function BannersPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  if (!(await canUse("content.write"))) return <NoAccess what="banners" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const sp = await searchParams;
  const s = await supabaseForUser();
  const { data } = await s.from("banners").select("*").order("sort_order").order("created_at");
  const rows = (data ?? []) as { id: string; image_url: string; title: string | null; link: string | null; starts_at: string; ends_at: string | null; is_active: boolean }[];
  const now = Date.now();
  const op = (id: string, o: string, label: string, icon: React.ReactNode, disabled = false) => (
    <form action={bannerAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={o} />
      <button disabled={disabled} aria-label={label} className="grid size-8 place-items-center rounded-full hover:bg-ivory disabled:opacity-25">{icon}</button></form>
  );
  return (
    <div className="max-w-5xl">
      <PageHeader title="Promotional Banners" actions={<Link href="/admin/banners/new" className={btnPrimary}><Plus className="size-4" /> New banner</Link>}>
        Image banners that slide on the homepage, below the main banner. Use photos with offers, new arrivals or festive edits.
      </PageHeader>
      {sp.notice && <div className="mb-4"><Notice tone="success">{sp.notice.slice(0, 200)}</Notice></div>}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-champagne bg-cream p-8 text-center text-taupe">No banners yet. The slider appears on the homepage as soon as you add one.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((b, i) => {
            const live = b.is_active && new Date(b.starts_at).getTime() <= now && (!b.ends_at || new Date(b.ends_at).getTime() > now);
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-champagne bg-cream p-3">
                <div className="flex flex-col">{op(b.id, "up", "Move up", <ArrowUp className="size-4" />, i === 0)}{op(b.id, "down", "Move down", <ArrowDown className="size-4" />, i === rows.length - 1)}</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image_url} alt="" className="aspect-[21/9] w-48 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/banners/${b.id}`} className="font-medium hover:underline">{b.title || "Banner without text"}</Link>
                  <p className="text-xs text-taupe">{b.link ? `Goes to ${b.link} · ` : ""}{day(b.starts_at)} – {b.ends_at ? day(b.ends_at) : "no end"}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${live ? "bg-sage text-cocoa" : "bg-champagne text-taupe"}`}>{live ? "Live" : b.is_active ? "Scheduled / ended" : "Off"}</span>
                <form action={bannerAction}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="op" value="delete" />
                  <SubmitButton className="text-xs text-taupe hover:text-rose" pendingText="…" confirm="Delete this banner?">Delete</SubmitButton></form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
