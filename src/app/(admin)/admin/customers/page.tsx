import Link from "next/link";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { EmptyRow, PageHeader, Pagination, btnSecondary, inputCls, td, th } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { formatINR, whatsappLink } from "@/lib/money";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";
const PER = 25;
type Row = { phone: string; name: string; email: string; orders: number; spent: number; last_order_at: string; first_order_at: string; has_account: boolean; city: string | null };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  if (!(await canUse("customers.read"))) return <NoAccess what="customers" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const s = await supabaseForUser();
  const { data, error } = await s.rpc("admin_customers", { p_q: sp.q ?? null, p_limit: PER, p_offset: (page - 1) * PER });
  const r = (data ?? { total: 0, rows: [] }) as { total: number; rows: Row[] };
  const pages = Math.max(1, Math.ceil(r.total / PER));
  const d = (x: string) => new Date(x).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
  return (
    <div className="max-w-6xl">
      <PageHeader title="Customers">{r.total} customer{r.total === 1 ? "" : "s"} who have ordered, grouped by phone number.</PageHeader>
      <form role="search" className="mb-4 flex gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Name, phone or email" aria-label="Search customers" className={`${inputCls} mt-0 w-72`} />
        <button className={btnSecondary}>Search</button>
      </form>
      {error && <p role="alert" className="mb-4 rounded-xl bg-blush px-4 py-3 text-sm">{error.message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-champagne bg-cream">
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-champagne"><tr><th className={th}>Customer</th><th className={th}>Contact</th><th className={th}>Orders</th><th className={th}>Spent</th><th className={th}>Last order</th><th className={th}></th></tr></thead>
          <tbody className="divide-y divide-champagne/70">
            {r.rows.length === 0 && <EmptyRow cols={6}>{sp.q ? "No customers match." : "Customers appear here after their first order."}</EmptyRow>}
            {r.rows.map((c) => (
              <tr key={c.phone} className="hover:bg-ivory">
                <td className={td}><span className="font-medium">{c.name}</span>{c.city && <span className="block text-xs text-taupe">{c.city}</span>}{c.has_account && <span className="mt-0.5 inline-block rounded-full bg-lavender px-2 text-[10px]">Has account</span>}</td>
                <td className={td}>{c.phone}<span className="block text-xs text-taupe">{c.email}</span></td>
                <td className={td}>{c.orders}</td>
                <td className={`${td} font-medium`}>{formatINR(Number(c.spent))}</td>
                <td className={`${td} text-xs`}>{d(c.last_order_at)}<span className="block text-taupe">since {d(c.first_order_at)}</span></td>
                <td className={td}>
                  <div className="flex gap-2 text-xs">
                    <Link href={`/admin/orders?q=${c.phone}`} className="underline underline-offset-4">Orders</Link>
                    <a href={whatsappLink(`91${c.phone}`, `Hi ${c.name.split(" ")[0]}, `)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">WhatsApp</a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} hrefFor={(n) => `/admin/customers?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(n) })}`} />
    </div>
  );
}
