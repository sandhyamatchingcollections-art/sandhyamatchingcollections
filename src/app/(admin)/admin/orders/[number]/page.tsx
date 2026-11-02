import { notFound } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { canUse, getPermissions } from "@/server/auth";
import { whatsappUpdate } from "@/server/notify";
import { SITE_URL } from "@/lib/supabase/env";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { orderView } from "@/server/orders";
import { Card, Notice, PageHeader, btnDanger, btnPrimary, btnSecondary, inputCls, textareaCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { formatINR, whatsappLink } from "@/lib/money";
import { PAYMENT_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";
import { changeOrderStatus, refundOrder, saveStaffNote } from "../actions";

export const metadata = { title: "Order" };
export const dynamic = "force-dynamic";

// Next steps offered for each status (the database enforces the same rules).
const NEXT: Record<OrderStatus, { status: OrderStatus; label: string; primary?: boolean }[]> = {
  pending_payment: [],
  placed: [{ status: "confirmed", label: "Confirm order", primary: true }, { status: "packed", label: "Mark packed" }, { status: "on_hold", label: "Put on hold" }],
  confirmed: [{ status: "packed", label: "Mark packed", primary: true }, { status: "on_hold", label: "Put on hold" }],
  packed: [{ status: "on_hold", label: "Put on hold" }],
  shipped: [{ status: "delivered", label: "Mark delivered", primary: true }],
  delivered: [],
  cancelled: [],
  on_hold: [{ status: "confirmed", label: "Resume (confirm)", primary: true }],
};
const CAN_SHIP: OrderStatus[] = ["placed", "confirmed", "packed"];
const CAN_CANCEL: OrderStatus[] = ["pending_payment", "placed", "confirmed", "packed", "on_hold"];
const when = (d: string | null) => d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—";

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ error?: string; saved?: string }> };

export default async function AdminOrder({ params, searchParams }: Props) {
  if (!(await canUse("orders.write"))) return <NoAccess what="orders" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  const o = await orderView(number);
  if (!o) notFound();
  const s = await supabaseForUser();
  const { data: extra } = await s.from("orders").select("staff_note, razorpay_order_id, razorpay_payment_id").eq("id", o.id).single();
  const a = o.shipping_address;
  const canRefund = false;
  const remaining = o.total - o.refunded_amount;
  const customerLink = `${SITE_URL}/order/${o.order_number}?t=${o.access_token}`;
  const hidden = (status: string) => (<><input type="hidden" name="id" value={o.id} /><input type="hidden" name="number" value={o.order_number} /><input type="hidden" name="status" value={status} /></>);

  return (
    <div className="max-w-6xl">
      <PageHeader title={`Order ${o.order_number}`} back={{ href: "/admin/orders", label: "Orders" }}>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
        <span className="ml-2 text-taupe">{o.payment_method === "cod" ? "Cash on Delivery" : "Online"} · {PAYMENT_LABEL[o.payment_status]} · {when(o.created_at)}</span>
      </PageHeader>
      <div className="mb-6 space-y-3">
        {sp.saved && <Notice tone="success">Saved.</Notice>}
        {sp.error && <Notice tone="error">{sp.error.slice(0, 300)}</Notice>}
        {o.status === "on_hold" && <Notice tone="error">This order is on hold. {extra?.staff_note ?? ""}</Notice>}
        {o.status === "pending_payment" && <Notice tone="info">The customer hasn&apos;t completed online payment. Unpaid orders cancel themselves after 30 minutes.</Notice>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card title="Next step">
            <div className="flex flex-wrap items-start gap-3">
              {NEXT[o.status].map((n) => (
                <form key={n.status} action={changeOrderStatus}>{hidden(n.status)}<input type="hidden" name="note" value="" />
                  <SubmitButton className={n.primary ? btnPrimary : btnSecondary} pendingText="Saving…">{n.label}</SubmitButton></form>
              ))}
              {CAN_SHIP.includes(o.status) && (
                <form action={changeOrderStatus} className="flex flex-wrap items-center gap-2">{hidden("shipped")}
                  <input name="note" placeholder="Courier & tracking no. (optional)" aria-label="Courier and tracking number" maxLength={300} className={`${inputCls} mt-0 w-64`} />
                  <SubmitButton className={btnSecondary} pendingText="Saving…">Mark shipped</SubmitButton>
                </form>
              )}
              {NEXT[o.status].length === 0 && !CAN_SHIP.includes(o.status) && !CAN_CANCEL.includes(o.status) && <p className="text-sm text-taupe">Nothing more to do for this order.</p>}
            </div>
            {CAN_SHIP.includes(o.status) && <p className="mt-3 text-xs text-taupe">Marking shipped takes the items off your stock for good. Cancelling before that puts them back.</p>}
            {CAN_CANCEL.includes(o.status) && (
              <form action={changeOrderStatus} className="mt-5 flex flex-wrap items-center gap-2 border-t border-champagne pt-5">{hidden("cancelled")}
                <input name="note" placeholder="Reason (shown to the customer)" aria-label="Cancellation reason" maxLength={300} className={`${inputCls} mt-0 w-72`} />
                <SubmitButton className={btnDanger} pendingText="Cancelling…" confirm={`Cancel order ${o.order_number}? Held stock goes back on sale.`}>Cancel order</SubmitButton>
              </form>
            )}
          </Card>

          <Card title={`Items (${o.items.length})`}>
            <ul className="divide-y divide-champagne text-sm">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-4 py-2.5">
                  <span><span className="font-medium">{i.name}</span>{i.title !== "Default" && <span className="text-taupe"> · {i.title}</span>}
                    <span className="block text-xs text-taupe">SKU {i.sku} · {i.qty}{i.unit === "metre" ? " m" : i.unit === "yard" ? " yd" : " ×"} at {formatINR(i.price)}</span></span>
                  <span className="font-medium">{formatINR(i.line_total)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-champagne pt-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(o.subtotal)}</dd></div>
              {(o.discount > 0 || o.coupon_code) && <div className="flex justify-between text-sage-deep"><dt>Coupon {o.coupon_code}</dt><dd>{o.discount > 0 ? `−${formatINR(o.discount)}` : "Free shipping"}</dd></div>}
              <div className="flex justify-between"><dt>Shipping</dt><dd>{o.shipping_fee ? formatINR(o.shipping_fee) : "Free"}</dd></div>
              {o.cod_fee > 0 && <div className="flex justify-between"><dt>COD charge</dt><dd>{formatINR(o.cod_fee)}</dd></div>}
              <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd>{formatINR(o.total)}</dd></div>
              {o.refunded_amount > 0 && <div className="flex justify-between text-rose"><dt>Refunded</dt><dd>−{formatINR(o.refunded_amount)}</dd></div>}
            </dl>
            {o.invoice_number && <a href={`/invoice/${o.order_number}`} target="_blank" className={`${btnSecondary} mt-4`}>Invoice {o.invoice_number}</a>}
          </Card>

          <Card title="History">
            <ol className="space-y-2 text-sm">
              {o.events.map((e, i) => <li key={i}><span className="font-medium">{STATUS_LABEL[e.status as OrderStatus] ?? e.status}</span> <span className="text-taupe">· {when(e.at)}{e.note ? ` · ${e.note}` : ""}</span></li>)}
            </ol>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card title="Customer">
            <p className="text-sm font-medium">{o.customer_name}</p>
            <p className="text-sm text-taupe">{o.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`tel:+91${o.phone}`} className={btnSecondary}><Phone className="size-4" /> {o.phone}</a>
              <a href={whatsappLink(`91${o.phone}`, whatsappUpdate(o, customerLink))} target="_blank" rel="noopener noreferrer" className={btnSecondary}><MessageCircle className="size-4" /> Send update on WhatsApp</a>
            </div>
          </Card>
          <Card title="Ship to">
            <p className="text-sm font-medium">{a.full_name} · {a.phone}</p>
            <p className="text-sm text-taupe">{[a.line1, a.line2, a.landmark, a.city, a.state].filter(Boolean).join(", ")} – {a.pincode}</p>
            {o.customer_note && <p className="mt-3 rounded-xl bg-lavender/50 p-3 text-sm"><span className="font-medium">Customer note:</span> {o.customer_note}</p>}
          </Card>
          {o.payment_method === "online" && (
            <Card title="Payment">
              <p className="text-sm">{PAYMENT_LABEL[o.payment_status]}{o.paid_at ? ` · ${when(o.paid_at)}` : ""}</p>
              {extra?.razorpay_payment_id && <p className="mt-1 break-all text-xs text-taupe">Razorpay payment {extra.razorpay_payment_id}</p>}
              {extra?.razorpay_order_id && <p className="break-all text-xs text-taupe">Razorpay order {extra.razorpay_order_id}</p>}
            </Card>
          )}
          {canRefund && (
            <Card title="Refund" description={`Paid ${formatINR(o.total)}${o.refunded_amount ? `, ${formatINR(o.refunded_amount)} already refunded` : ""}.`}>
              <form action={refundOrder} className="space-y-3">
                <input type="hidden" name="id" value={o.id} /><input type="hidden" name="number" value={o.order_number} />
                <label className="block text-sm">Amount (₹)
                  <input name="amount" inputMode="decimal" required defaultValue={String(remaining / 100)} aria-label="Refund amount in rupees" className={inputCls} /></label>
                <fieldset className="space-y-1 text-sm">
                  <legend className="sr-only">Refund method</legend>
                  {o.payment_method === "online" && <label className="flex items-center gap-2"><input type="radio" name="method" value="razorpay" defaultChecked className="accent-cocoa" /> Back to the customer&apos;s card/UPI (Razorpay)</label>}
                  <label className="flex items-center gap-2"><input type="radio" name="method" value="manual" defaultChecked={o.payment_method !== "online"} className="accent-cocoa" /> Refunded by hand (UPI / cash)</label>
                </fieldset>
                <input name="note" maxLength={300} placeholder="Reason (optional)" aria-label="Refund reason" className={inputCls} />
                <SubmitButton className={btnDanger} pendingText="Refunding…" confirm={`Refund this order ${o.order_number}? This can't be undone.`}>Refund</SubmitButton>
              </form>
            </Card>
          )}
          <Card title="Staff note" description="Only staff can see this.">
            <form action={saveStaffNote}>
              <input type="hidden" name="id" value={o.id} /><input type="hidden" name="number" value={o.order_number} />
              <textarea name="staff_note" rows={4} maxLength={2000} defaultValue={extra?.staff_note ?? ""} aria-label="Staff note" className={textareaCls} />
              <SubmitButton className={`${btnSecondary} mt-2`}>Save note</SubmitButton>
            </form>
          </Card>
        </aside>
      </div>
    </div>
  );
}
