import Link from "next/link";
import { notFound } from "next/navigation";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { stockHistory } from "@/server/admin/catalog";
import { Badge, Card, EmptyRow, PageHeader, btnSecondary, td, th } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { StockForm, ThresholdForm } from "../StockForm";

export const metadata = { title: "Stock history" };

const reasonLabel: Record<string, string> = {
  initial: "Opening stock", adjustment: "Manual change", import: "CSV import", order: "Order", cancellation: "Order cancelled", refund: "Refund",
};

export default async function StockHistoryPage({ params }: { params: Promise<{ variantId: string }> }) {
  if (!(await canUse("inventory.write"))) return <NoAccess what="stock" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { variantId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(variantId)) notFound();
  const { variant: v, moves } = await stockHistory(variantId);
  if (!v) notFound();
  const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

  return (
    <div className="max-w-4xl">
      <PageHeader title={v.product_name} back={{ href: "/admin/inventory", label: "Inventory" }}
        actions={<Link href={`/admin/products/${v.product_id}`} className={btnSecondary}>Edit product</Link>}>
        {v.title !== "Default" && `${v.title} · `}SKU {v.sku} · <Badge status={v.stock_state} />
      </PageHeader>

      <div className="grid gap-6 sm:grid-cols-3">
        {[["On hand", v.on_hand], ["Reserved by orders", v.reserved], ["Available to sell", v.available]].map(([l, n]) => (
          <div key={l as string} className="rounded-2xl border border-champagne bg-cream p-5">
            <p className="text-xs uppercase tracking-wide text-taupe">{l}</p>
            <p className="mt-1 text-3xl font-semibold">{Number(n)}<span className="ml-1 text-base font-normal text-taupe">{v.unit === "piece" ? "" : v.unit === "metre" ? "m" : v.unit === "yard" ? "yd" : "sets"}</span></p>
          </div>
        ))}
      </div>

      <Card title="Change stock" className="mt-6"><StockForm variantId={v.variant_id} label={v.product_name} /></Card>
      <Card title="Low-stock alert" className="mt-6"><ThresholdForm variantId={v.variant_id} value={Number(v.low_stock_threshold)} /></Card>

      <h2 className="mb-3 mt-10 text-2xl font-medium">History</h2>
      <div className="overflow-x-auto rounded-2xl border border-champagne bg-cream">
        <table className="w-full min-w-[560px]">
          <thead className="border-b border-champagne"><tr><th className={th}>When</th><th className={th}>Change</th><th className={th}>Reason</th><th className={th}>Note</th></tr></thead>
          <tbody className="divide-y divide-champagne/70">
            {moves.length === 0 && <EmptyRow cols={4}>No changes recorded yet.</EmptyRow>}
            {moves.map((m) => (
              <tr key={m.id}>
                <td className={`${td} whitespace-nowrap`}>{fmt.format(new Date(m.created_at))}</td>
                <td className={`${td} font-medium ${Number(m.delta) > 0 ? "text-sage-deep" : "text-rose"}`}>{Number(m.delta) > 0 ? "+" : ""}{Number(m.delta)}</td>
                <td className={td}>{reasonLabel[m.reason] ?? m.reason}</td>
                <td className={`${td} text-taupe`}>{m.note ?? m.reference ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
