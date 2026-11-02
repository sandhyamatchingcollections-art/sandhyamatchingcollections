import Link from "next/link";
import { Plus } from "lucide-react";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { EmptyRow, Notice, PageHeader, btnPrimary, td, th } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { deleteOffer } from "./actions";

export const metadata = { title: "Offers" };
export const dynamic = "force-dynamic";
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  if (!(await canUse("promotions.write"))) return <NoAccess what="offers" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const sp = await searchParams;
  const s = await supabaseForUser();
  const { data } = await s.from("promotions").select("*").order("starts_at", { ascending: false });
  const rows = (data ?? []) as { id: string; title: string; description: string | null; starts_at: string; ends_at: string | null; is_active: boolean }[];
  const now = Date.now();
  return (
    <div className="max-w-5xl">
      <PageHeader title="Offers & Campaigns" actions={<Link href="/admin/offers/new" className={btnPrimary}><Plus className="size-4" /> New offer</Link>}>
        Announcements shown in the homepage offer banner while they&apos;re live. Pair them with a coupon code.
      </PageHeader>
      {sp.notice && <div className="mb-4"><Notice tone="success">{sp.notice.slice(0, 200)}</Notice></div>}
      <div className="overflow-x-auto rounded-2xl border border-champagne bg-cream">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-champagne"><tr><th className={th}>Offer</th><th className={th}>Dates</th><th className={th}>Status</th><th className={th}></th></tr></thead>
          <tbody className="divide-y divide-champagne/70">
            {rows.length === 0 && <EmptyRow cols={4}>No offers yet.</EmptyRow>}
            {rows.map((o) => {
              const live = o.is_active && new Date(o.starts_at).getTime() <= now && (!o.ends_at || new Date(o.ends_at).getTime() > now);
              return (
                <tr key={o.id} className="hover:bg-ivory">
                  <td className={td}><Link href={`/admin/offers/${o.id}`} className="font-medium hover:underline">{o.title}</Link>{o.description && <span className="block text-xs text-taupe">{o.description}</span>}</td>
                  <td className={`${td} text-xs`}>{day(o.starts_at)} – {o.ends_at ? day(o.ends_at) : "no end"}</td>
                  <td className={td}><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${live ? "bg-sage text-cocoa" : "bg-champagne text-taupe"}`}>{live ? "Live" : o.is_active ? "Scheduled / ended" : "Off"}</span></td>
                  <td className={td}><form action={deleteOffer}><input type="hidden" name="id" value={o.id} /><SubmitButton className="text-xs text-taupe hover:text-rose" pendingText="…" confirm="Delete this offer?">Delete</SubmitButton></form></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
