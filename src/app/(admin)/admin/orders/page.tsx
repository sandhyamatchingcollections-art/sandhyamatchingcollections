import Link from "next/link";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { EmptyRow, PageHeader, Pagination, btnSecondary, inputCls, td, th } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { formatINR } from "@/lib/money";
import { PAYMENT_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const PER_PAGE = 25;
const tabs: { key: string; label: string; statuses?: OrderStatus[] }[] = [
  { key: "", label: "All" },
  { key: "new", label: "New", statuses: ["placed"] },
  { key: "to-ship", label: "To ship", statuses: ["confirmed", "packed"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "hold", label: "On hold", statuses: ["on_hold"] },
  { key: "unpaid", label: "Awaiting payment", statuses: ["pending_payment"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

type Row = { id: string; order_number: string; customer_name: string; phone: string; total: number; status: OrderStatus;
  payment_method: string; payment_status: string; created_at: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; page?: string }> }) {
  if (!(await canUse("orders.write"))) return <NoAccess what="orders" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const s = await supabaseForUser();
  await s.rpc("release_expired_orders"); // tidy up unpaid orders past their 30 minutes

  let query = s.from("orders").select("id, order_number, customer_name, phone, total, status, payment_method, payment_status, created_at", { count: "exact" })
    .order("created_at", { ascending: false }).range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const tab = tabs.find((t) => t.key === (sp.tab ?? ""));
  if (tab?.statuses) query = query.in("status", tab.statuses);
  const q = (sp.q ?? "").trim().replace(/[^\p{L}\p{N}@.+\- ]/gu, "").slice(0, 60);
  if (q) query = query.or(`order_number.ilike.%${q}%,phone.ilike.%${q.replace(/\D/g, "") || q}%,customer_name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, count, error } = await query;
  const rows = (data ?? []) as Row[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));
  const { count: newCount } = await s.from("orders").select("id", { count: "exact", head: true }).eq("status", "placed");

  const href = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, tab: sp.tab, ...patch })) if (v) u.set(k, v);
    return `/admin/orders${u.size ? `?${u}` : ""}`;
  };

  return (
    <div className="max-w-6xl">
      <PageHeader title="Orders">{newCount ? `${newCount} new order${newCount === 1 ? "" : "s"} to confirm.` : "Newest first."}</PageHeader>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Order filter" className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <Link key={t.key} href={href({ tab: t.key || undefined, page: undefined })} aria-current={(sp.tab ?? "") === t.key ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm ${(sp.tab ?? "") === t.key ? "bg-cocoa text-cream" : "border border-champagne bg-cream"}`}>
              {t.label}{t.key === "new" && newCount ? ` (${newCount})` : ""}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex gap-2">
          {sp.tab && <input type="hidden" name="tab" value={sp.tab} />}
          <input name="q" defaultValue={sp.q} placeholder="Order no., phone, name" aria-label="Search orders" className={`${inputCls} mt-0 w-60`} />
          <button className={btnSecondary}>Search</button>
        </form>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-blush px-4 py-3 text-sm">Couldn&apos;t load orders: {error.message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-champagne bg-cream">
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-champagne">
            <tr><th className={th}>Order</th><th className={th}>Customer</th><th className={th}>Total</th><th className={th}>Payment</th><th className={th}>Status</th></tr>
          </thead>
          <tbody className="divide-y divide-champagne/70">
            {rows.length === 0 && <EmptyRow cols={5}>{q || tab?.statuses ? "No orders match." : "No orders yet. They appear here as soon as a customer checks out."}</EmptyRow>}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-ivory">
                <td className={td}>
                  <Link href={`/admin/orders/${r.order_number}`} className="font-medium hover:underline">{r.order_number}</Link>
                  <span className="block text-xs text-taupe">{new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</span>
                </td>
                <td className={td}>{r.customer_name}<span className="block text-xs text-taupe">{r.phone}</span></td>
                <td className={`${td} font-medium`}>{formatINR(Number(r.total))}</td>
                <td className={td}>{r.payment_method === "cod" ? "COD" : "Online"}<span className="block text-xs text-taupe">{PAYMENT_LABEL[r.payment_status]}</span></td>
                <td className={td}><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} hrefFor={(n) => href({ page: String(n) })} />
    </div>
  );
}
