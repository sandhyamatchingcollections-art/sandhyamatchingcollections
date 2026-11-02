import Link from "next/link";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { adminStock } from "@/server/admin/catalog";
import { Badge, EmptyRow, PageHeader, Pagination, btnSecondary, inputCls, td, th } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { StockForm } from "./StockForm";

export const metadata = { title: "Inventory" };

const tabs = [
  { key: "", label: "All" }, { key: "low", label: "Low stock" }, { key: "out", label: "Out of stock" }, { key: "untracked", label: "Not tracked" },
];
const unitShort: Record<string, string> = { metre: "m", yard: "yd", set: "sets", piece: "" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; state?: string; page?: string }> }) {
  if (!(await canUse("inventory.write"))) return <NoAccess what="stock" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, pages } = await adminStock({ q: sp.q, state: sp.state, page });
  const href = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, state: sp.state, ...patch })) if (v) u.set(k, v);
    return `/admin/inventory${u.size ? `?${u}` : ""}`;
  };

  return (
    <div className="max-w-6xl">
      <PageHeader title="Inventory">
        Every change is recorded with who made it and why. Stock reserved by orders in progress can&apos;t be removed.
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Stock filter" className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <Link key={t.key} href={href({ state: t.key || undefined, page: undefined })} aria-current={(sp.state ?? "") === t.key ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm ${(sp.state ?? "") === t.key ? "bg-cocoa text-cream" : "border border-champagne bg-cream"}`}>
              {t.label}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex gap-2">
          {sp.state && <input type="hidden" name="state" value={sp.state} />}
          <input name="q" defaultValue={sp.q} placeholder="Product or SKU" aria-label="Search stock" className={`${inputCls} mt-0 w-56`} />
          <button className={btnSecondary}>Search</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-champagne bg-cream">
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-champagne">
            <tr><th className={th}>Item</th><th className={th}>SKU</th><th className={th}>Available</th><th className={th}>Status</th><th className={th}>Change stock</th></tr>
          </thead>
          <tbody className="divide-y divide-champagne/70">
            {rows.length === 0 && <EmptyRow cols={5}>{total === 0 && !sp.q && !sp.state ? "No products yet." : "Nothing here."}</EmptyRow>}
            {rows.map((r) => (
              <tr key={r.variant_id} className="hover:bg-ivory">
                <td className={td}>
                  <Link href={`/admin/inventory/${r.variant_id}`} className="font-medium hover:underline">{r.product_name}</Link>
                  {r.title !== "Default" && <span className="block text-xs text-taupe">{r.title}</span>}
                </td>
                <td className={`${td} text-xs text-taupe`}>{r.sku}</td>
                <td className={td}>
                  {r.track_inventory ? <>{Number(r.available)} {unitShort[r.unit]}</> : "—"}
                  {Number(r.reserved) > 0 && <span className="block text-xs text-taupe">{Number(r.reserved)} reserved</span>}
                </td>
                <td className={td}><Badge status={r.stock_state} /></td>
                <td className={td}>{r.track_inventory ? <StockForm variantId={r.variant_id} label={`${r.product_name} ${r.title}`} compact /> : <span className="text-xs text-taupe">Turn on “Track stock” in the product</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} hrefFor={(n) => href({ page: String(n) })} />
    </div>
  );
}
