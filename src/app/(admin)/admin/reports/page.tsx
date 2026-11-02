import Link from "next/link";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { Card, PageHeader, btnSecondary, td, th } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { formatINR } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

type Report = {
  orders: number; sales: number; discounts: number; shipping: number; refunds: number; items_sold: number; customers: number; cancelled: number;
  by_day: { day: string; orders: number; sales: number }[];
  by_method: { method: string; orders: number; sales: number }[];
  by_status: { status: OrderStatus; orders: number }[];
  top_products: { name: string; qty: number; sales: number }[];
  coupons: { code: string; uses: number; discount: number }[];
};

const ist = (d = new Date()) => new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function range(key: string, from?: string, to?: string): [string, string] {
  const today = ist();
  const back = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n + 1); return ymd(d); };
  if (key === "custom" && from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) return [from, to];
  if (key === "month") return [ymd(new Date(today.getFullYear(), today.getMonth(), 1)), ymd(today)];
  if (key === "lastmonth") return [ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)), ymd(new Date(today.getFullYear(), today.getMonth(), 0))];
  if (key === "90") return [back(90), ymd(today)];
  if (key === "7") return [back(7), ymd(today)];
  return [back(30), ymd(today)];
}
const dateCls = "h-11 w-40 rounded-xl border border-champagne bg-ivory px-3 text-sm focus:border-cocoa/50 focus:outline-none";
const plural = (n: number, w: string) => `${n} ${w}${Number(n) === 1 ? "" : "s"}`;
const PRESETS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["month", "This month"], ["lastmonth", "Last month"]];
const shortDay = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function SalesChart({ days }: { days: Report["by_day"] }) {
  const W = 720, H = 220, padL = 56, padB = 28, padT = 12;
  const max = Math.max(1, ...days.map((d) => Number(d.sales)));
  const nice = Math.pow(10, Math.floor(Math.log10(max))) * Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max))));
  const slot = (W - padL) / days.length, bw = Math.max(2, Math.min(28, slot - 2));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  const ticks = [0, 0.5, 1].map((f) => nice * f);
  const every = Math.ceil(days.length / 8);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Sales per day">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="stroke-champagne" strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="fill-taupe text-[11px]">{formatINR(t).replace(/\.00$/, "")}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const v = Number(d.sales), x = padL + i * slot + (slot - bw) / 2, top = y(v), h = H - padB - top;
          return (
            <g key={d.day} className="group">
              <rect x={padL + i * slot} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              {v > 0 && <path d={`M${x},${H - padB} V${top + Math.min(4, h)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${H - padB} Z`} className="fill-cocoa group-hover:fill-rose" />}
              <title>{`${shortDay(d.day)}: ${formatINR(v)} · ${d.orders} order${Number(d.orders) === 1 ? "" : "s"}`}</title>
              {i % every === 0 && <text x={padL + i * slot + slot / 2} y={H - 8} textAnchor="middle" className="fill-taupe text-[11px]">{shortDay(d.day)}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">Hover a bar for the day&apos;s sales. The table below lists every day.</figcaption>
    </figure>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string }> }) {
  if (!(await canUse("reports.view"))) return <NoAccess what="reports" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const sp = await searchParams;
  const key = sp.r ?? "30";
  const [from, to] = range(key, sp.from, sp.to);
  const s = await supabaseForUser();
  const { data, error } = await s.rpc("sales_report", { p_from: from, p_to: to });
  const r = data as Report | null;
  const tiles = r ? [
    ["Sales", formatINR(Number(r.sales)), plural(r.orders, "order")],
    ["Average order", formatINR(r.orders ? Math.round(Number(r.sales) / Number(r.orders) / 100) * 100 : 0), plural(r.customers, "customer")],
    ["Items sold", String(Number(r.items_sold)), `${r.cancelled} cancelled`],
    ["Refunds", formatINR(Number(r.refunds)), `Coupons ${formatINR(Number(r.discounts))}`],
  ] : [];

  return (
    <div className="max-w-6xl">
      <PageHeader title="Reports & Analytics">{shortDay(from)} – {shortDay(to)} · placed orders (cancelled and unpaid excluded), India time.</PageHeader>
      <div className="mb-6 flex flex-wrap items-end gap-2">
        {PRESETS.map(([k, label]) => (
          <Link key={k} href={`/admin/reports?r=${k}`} aria-current={key === k ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm ${key === k ? "bg-cocoa text-cream" : "border border-champagne bg-cream"}`}>{label}</Link>
        ))}
        <form className="ml-auto flex flex-wrap items-end gap-2">
          <input type="hidden" name="r" value="custom" />
          <input type="date" name="from" defaultValue={from} aria-label="From date" className={dateCls} />
          <input type="date" name="to" defaultValue={to} aria-label="To date" className={dateCls} />
          <button className={btnSecondary}>Show</button>
        </form>
      </div>
      {error && <p role="alert" className="rounded-xl bg-blush px-4 py-3 text-sm">Couldn&apos;t load the report: {error.message}</p>}
      {r && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map(([label, value, sub]) => (
              <div key={label} className="rounded-2xl border border-champagne bg-cream p-5">
                <p className="text-xs uppercase tracking-wide text-taupe">{label}</p>
                <p className="mt-1 text-3xl font-medium text-cocoa">{value}</p>
                <p className="text-xs text-taupe">{sub}</p>
              </div>
            ))}
          </div>
          <Card title="Sales per day">
            {Number(r.orders) === 0 ? <p className="text-sm text-taupe">No orders in this period yet.</p> : <SalesChart days={r.by_day} />}
            <details className="mt-3 text-sm"><summary className="cursor-pointer text-taupe">Show as table</summary>
              <table className="mt-2 w-full"><thead><tr><th className={th}>Day</th><th className={th}>Orders</th><th className={th}>Sales</th></tr></thead>
                <tbody>{r.by_day.filter((d) => Number(d.orders) > 0).map((d) => <tr key={d.day}><td className={td}>{shortDay(d.day)}</td><td className={td}>{d.orders}</td><td className={td}>{formatINR(Number(d.sales))}</td></tr>)}</tbody></table>
            </details>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Best-selling products">
              {r.top_products.length === 0 ? <p className="text-sm text-taupe">Nothing sold yet.</p> : (
                <table className="w-full"><thead><tr><th className={th}>Product</th><th className={th}>Qty</th><th className={th}>Sales</th></tr></thead>
                  <tbody>{r.top_products.map((p) => <tr key={p.name}><td className={td}>{p.name}</td><td className={td}>{Number(p.qty)}</td><td className={td}>{formatINR(Number(p.sales))}</td></tr>)}</tbody></table>
              )}
            </Card>
            <div className="space-y-6">
              <Card title="Payment methods">
                {r.by_method.length === 0 ? <p className="text-sm text-taupe">—</p> : r.by_method.map((m) => (
                  <p key={m.method} className="flex justify-between py-1 text-sm"><span>{m.method === "cod" ? "Cash on Delivery" : "Online"} · {plural(m.orders, "order")}</span><span className="font-medium">{formatINR(Number(m.sales))}</span></p>
                ))}
              </Card>
              <Card title="Order status">
                {r.by_status.length === 0 ? <p className="text-sm text-taupe">—</p> : r.by_status.map((x) => (
                  <p key={x.status} className="flex justify-between py-1 text-sm"><span>{STATUS_LABEL[x.status] ?? x.status}</span><span className="font-medium">{x.orders}</span></p>
                ))}
              </Card>
              <Card title="Coupons used">
                {r.coupons.length === 0 ? <p className="text-sm text-taupe">No coupons used.</p> : r.coupons.map((c) => (
                  <p key={c.code} className="flex justify-between py-1 text-sm"><span className="font-mono">{c.code} · {c.uses}×</span><span>−{formatINR(Number(c.discount))}</span></p>
                ))}
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
