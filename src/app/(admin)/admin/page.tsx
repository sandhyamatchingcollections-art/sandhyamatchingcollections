import Link from "next/link";
import { AlertTriangle, ArrowRight, Package, ShoppingCart, Star, Truck } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type Dash = {
  orders?: { to_confirm: number; to_ship: number; on_hold: number; awaiting_payment: number; recent: { order_number: string; customer_name: string; total: number; status: OrderStatus; payment_method: string; created_at: string }[] };
  sales?: { today: number; today_orders: number; week: number; week_orders: number; month: number; month_orders: number };
  stock?: { low: number; out: number };
  catalog?: { live: number; draft: number; reviews_pending: number };
  customers?: number;
};

function Tile({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (<><p className="text-xs uppercase tracking-wide text-taupe">{label}</p><p className="mt-1 text-3xl font-medium text-cocoa">{value}</p>{sub && <p className="text-xs text-taupe">{sub}</p>}</>);
  return href ? <Link href={href} className="block rounded-2xl border border-champagne bg-cream p-5 hover:border-cocoa/30">{body}</Link> : <div className="rounded-2xl border border-champagne bg-cream p-5">{body}</div>;
}

export default async function AdminDashboard() {
  const ctx = await requireStaff("/admin");
  if (ctx.preview || !supabaseConfigured) return <div className="max-w-6xl"><h1 className="text-4xl font-medium">Dashboard</h1><p className="mt-2 text-taupe">Connect Supabase to see your store&apos;s numbers.</p></div>;
  const s = await supabaseForUser();
  await s.rpc("release_expired_orders").then(() => null, () => null);
  const { data } = await s.rpc("admin_dashboard");
  const d = (data ?? {}) as Dash;
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const todo = [
    d.orders && d.orders.to_confirm > 0 && { icon: ShoppingCart, text: `${d.orders.to_confirm} new order${d.orders.to_confirm === 1 ? "" : "s"} to confirm`, href: "/admin/orders?tab=new" },
    d.orders && d.orders.to_ship > 0 && { icon: Truck, text: `${d.orders.to_ship} order${d.orders.to_ship === 1 ? "" : "s"} to pack & ship`, href: "/admin/orders?tab=to-ship" },
    d.orders && d.orders.on_hold > 0 && { icon: AlertTriangle, text: `${d.orders.on_hold} order${d.orders.on_hold === 1 ? "" : "s"} on hold`, href: "/admin/orders?tab=hold" },
    d.stock && d.stock.out > 0 && { icon: Package, text: `${d.stock.out} item${d.stock.out === 1 ? "" : "s"} out of stock`, href: "/admin/inventory?state=out" },
    d.stock && d.stock.low > 0 && { icon: Package, text: `${d.stock.low} item${d.stock.low === 1 ? "" : "s"} running low`, href: "/admin/inventory?state=low" },
    d.catalog && d.catalog.reviews_pending > 0 && { icon: Star, text: `${d.catalog.reviews_pending} review${d.catalog.reviews_pending === 1 ? "" : "s"} to approve`, href: "/admin/reviews" },
  ].filter(Boolean) as { icon: typeof ShoppingCart; text: string; href: string }[];

  return (
    <div className="max-w-6xl">
      <h1 className="text-4xl font-medium">{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}</h1>
      <p className="mt-1 text-taupe">Here&apos;s your store today.</p>

      <section className="mt-6">
        {todo.length === 0 ? <p className="rounded-2xl bg-sage/50 px-5 py-4 text-sm text-cocoa">All caught up — nothing needs your attention right now.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {todo.map((t) => (
              <li key={t.text}><Link href={t.href} className="flex items-center gap-3 rounded-2xl border border-champagne bg-cream px-5 py-4 hover:border-cocoa/30">
                <t.icon className="size-5 text-rose" strokeWidth={1.6} /><span className="flex-1 font-medium">{t.text}</span><ArrowRight className="size-4 text-taupe" /></Link></li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {d.sales && <>
          <Tile label="Today" value={formatINR(Number(d.sales.today))} sub={`${d.sales.today_orders} order${Number(d.sales.today_orders) === 1 ? "" : "s"}`} href="/admin/reports?r=7" />
          <Tile label="Last 7 days" value={formatINR(Number(d.sales.week))} sub={`${d.sales.week_orders} orders`} href="/admin/reports?r=7" />
          <Tile label="Last 30 days" value={formatINR(Number(d.sales.month))} sub={`${d.sales.month_orders} orders`} href="/admin/reports?r=30" />
        </>}
        {d.customers !== undefined && <Tile label="Customers" value={String(d.customers)} href="/admin/customers" />}
        {d.catalog && <Tile label="Products live" value={String(d.catalog.live)} sub={`${d.catalog.draft} draft`} href="/admin/products" />}
      </section>

      {d.orders && (
        <section className="mt-10">
          <div className="flex items-end justify-between"><h2 className="text-2xl font-medium">Latest orders</h2><Link href="/admin/orders" className="text-sm underline underline-offset-4">All orders</Link></div>
          {d.orders.recent.length === 0 ? <p className="mt-3 text-sm text-taupe">No orders yet. They appear here the moment a customer checks out.</p> : (
            <ul className="mt-3 divide-y divide-champagne rounded-2xl border border-champagne bg-cream">
              {d.orders.recent.map((o) => (
                <li key={o.order_number}><Link href={`/admin/orders/${o.order_number}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-ivory">
                  <span className="font-medium">{o.order_number}</span><span className="flex-1 text-sm text-taupe">{o.customer_name} · {o.payment_method === "cod" ? "COD" : "Online"}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                  <span className="w-24 text-right font-medium">{formatINR(Number(o.total))}</span></Link></li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
