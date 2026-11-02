import Link from "next/link";
import { Plus } from "lucide-react";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { EmptyRow, Notice, PageHeader, btnPrimary, td, th } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { formatINR } from "@/lib/money";
import { deleteCoupon } from "./actions";

export const metadata = { title: "Coupons" };
export const dynamic = "force-dynamic";

type Row = { id: string; code: string; description: string | null; kind: string; value: number; min_subtotal: number; max_discount: number | null;
  starts_at: string; ends_at: string | null; usage_limit: number | null; per_customer_limit: number | null; first_order_only: boolean; is_active: boolean };
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  if (!(await canUse("promotions.write"))) return <NoAccess what="coupons" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const sp = await searchParams;
  const s = await supabaseForUser();
  const [{ data }, { data: uses }] = await Promise.all([
    s.from("coupons").select("*").order("created_at", { ascending: false }),
    s.from("coupon_redemptions").select("coupon_id, discount, orders!inner(status)").neq("orders.status", "cancelled"),
  ]);
  const used = new Map<string, { n: number; d: number }>();
  for (const u of (uses ?? []) as { coupon_id: string; discount: number }[]) {
    const x = used.get(u.coupon_id) ?? { n: 0, d: 0 }; x.n++; x.d += Number(u.discount); used.set(u.coupon_id, x);
  }
  const rows = (data ?? []) as Row[];
  const now = Date.now();
  return (
    <div className="max-w-6xl">
      <PageHeader title="Coupons & Discounts" actions={<Link href="/admin/coupons/new" className={btnPrimary}><Plus className="size-4" /> New coupon</Link>}>
        Codes customers enter at checkout. Uses on cancelled orders don&apos;t count.
      </PageHeader>
      {sp.notice && <div className="mb-4"><Notice tone="success">{sp.notice.slice(0, 200)}</Notice></div>}
      <div className="overflow-x-auto rounded-2xl border border-champagne bg-cream">
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-champagne"><tr><th className={th}>Code</th><th className={th}>Offer</th><th className={th}>Used</th><th className={th}>Valid</th><th className={th}>Status</th><th className={th}></th></tr></thead>
          <tbody className="divide-y divide-champagne/70">
            {rows.length === 0 && <EmptyRow cols={6}>No coupons yet. Try one like WELCOME10 for 10% off a first order.</EmptyRow>}
            {rows.map((c) => {
              const u = used.get(c.id) ?? { n: 0, d: 0 };
              const live = c.is_active && new Date(c.starts_at).getTime() <= now && (!c.ends_at || new Date(c.ends_at).getTime() > now) && (!c.usage_limit || u.n < c.usage_limit);
              return (
                <tr key={c.id} className="hover:bg-ivory">
                  <td className={td}><Link href={`/admin/coupons/${c.id}`} className="font-mono font-medium hover:underline">{c.code}</Link>{c.description && <span className="block text-xs text-taupe">{c.description}</span>}</td>
                  <td className={td}>
                    {c.kind === "percent" ? `${c.value}% off${c.max_discount ? ` (max ${formatINR(c.max_discount)})` : ""}` : c.kind === "flat" ? `${formatINR(c.value)} off` : "Free shipping"}
                    <span className="block text-xs text-taupe">{[c.min_subtotal ? `orders ${formatINR(c.min_subtotal)}+` : "", c.first_order_only ? "first order" : "", c.per_customer_limit ? `${c.per_customer_limit}× per customer` : ""].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className={td}>{u.n}{c.usage_limit ? ` / ${c.usage_limit}` : ""}{u.d > 0 && <span className="block text-xs text-taupe">{formatINR(u.d)} given</span>}</td>
                  <td className={`${td} text-xs`}>{day(c.starts_at)} – {c.ends_at ? day(c.ends_at) : "no end"}</td>
                  <td className={td}><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${live ? "bg-sage text-cocoa" : "bg-champagne text-taupe"}`}>{live ? "Live" : c.is_active ? "Not live" : "Off"}</span></td>
                  <td className={td}>
                    <form action={deleteCoupon}><input type="hidden" name="id" value={c.id} />
                      <SubmitButton className="text-xs text-taupe hover:text-rose" pendingText="…" confirm={`Delete coupon ${c.code}?`}>Delete</SubmitButton></form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
