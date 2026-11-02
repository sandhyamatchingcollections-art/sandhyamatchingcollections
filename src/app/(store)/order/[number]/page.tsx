import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, MessageCircle, Package, XCircle } from "lucide-react";
import { PageShell } from "@/components/store/ListingPage";
import { PhotoPlaceholder } from "@/components/ui/primitives";
import { getStoreSettings } from "@/server/catalog";
import { orderView } from "@/server/orders";
import { formatINR, whatsappLink } from "@/lib/money";
import { PAYMENT_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/orders";
import { ClearCartOnce, CopyLink, RefreshSoon } from "./OrderClient";

export const metadata = { title: "Your order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string; placed?: string; verify?: string }> };

const when = (d: string | null) => d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "";
const qtyText = (q: number, unit: string) => `${q}${unit === "metre" ? " m" : unit === "yard" ? " yd" : " ×"}`;

export default async function OrderPage({ params, searchParams }: Props) {
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  const [o, store] = await Promise.all([orderView(number, sp.t), getStoreSettings()]);
  if (!o) notFound();

  const justPlaced = sp.placed === "1" && o.status !== "cancelled";
  const a = o.shipping_address;
  const head =
    o.status === "cancelled" ? { icon: XCircle, title: "This order was cancelled", text: o.cancel_reason ?? "" }
    : o.status === "pending_payment" ? { icon: Clock, title: "Waiting for your payment",
        text: sp.verify ? "If money was taken, your order will update here within a few minutes." : "If you've paid, this page updates within a few minutes. Unpaid orders are cancelled after 30 minutes." }
    : justPlaced ? { icon: CheckCircle2, title: `Thank you, ${o.customer_name.split(" ")[0]}! Your order is placed.`,
        text: o.payment_method === "cod" ? "Please keep the cash ready when it arrives. We'll call if we need anything." : "Your payment was received." }
    : { icon: Package, title: STATUS_LABEL[o.status], text: "" };
  const Icon = head.icon;

  return (
    <PageShell crumbs={[{ label: "Order " + o.order_number }]} title={`Order ${o.order_number}`}>
      {justPlaced && <ClearCartOnce />}
      {o.status === "pending_payment" && <RefreshSoon />}
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-3xl border border-champagne bg-cream p-6 sm:p-7" aria-live="polite">
            <div className="flex items-start gap-4">
              <Icon className={`mt-1 size-8 shrink-0 ${o.status === "cancelled" ? "text-rose" : "text-sage-deep"}`} strokeWidth={1.5} />
              <div>
                <h2 className="text-2xl font-medium">{head.title}</h2>
                {head.text && <p className="mt-1 text-taupe">{head.text}</p>}
                <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                  <span className="text-taupe">{PAYMENT_LABEL[o.payment_status]}</span>
                  <span className="text-taupe">· Placed {when(o.placed_at ?? o.created_at)}</span>
                </p>
              </div>
            </div>
            {sp.t && o.status !== "cancelled" && (
              <div className="mt-5 rounded-2xl bg-ivory p-4 text-sm">
                <p className="font-medium">Save this page to track your order</p>
                <p className="mt-1 text-taupe">Anyone with this link can see the order, so share it only with people you trust.</p>
                <CopyLink />
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-champagne bg-cream p-6 sm:p-7">
            <h2 className="text-xl font-medium">Items</h2>
            <ul className="mt-4 divide-y divide-champagne">
              {o.items.map((i) => (
                <li key={i.id} className="flex gap-4 py-3 text-sm">
                  {i.image_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={i.image_url} alt="" className="size-16 rounded-xl object-cover" />
                    : <PhotoPlaceholder tone="blush" motif="none" label="" className="size-16 rounded-xl" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.name}</p>
                    <p className="text-taupe">{i.title !== "Default" ? `${i.title} · ` : ""}{qtyText(i.qty, i.unit)} · {formatINR(i.price)} each · SKU {i.sku}</p>
                  </div>
                  <p className="font-medium">{formatINR(i.line_total)}</p>
                </li>
              ))}
            </ul>
          </section>

          {o.events.length > 0 && (
            <section className="rounded-3xl border border-champagne bg-cream p-6 sm:p-7">
              <h2 className="text-xl font-medium">Progress</h2>
              <ol className="mt-4 space-y-3 border-l border-champagne pl-5 text-sm">
                {o.events.map((e, idx) => (
                  <li key={idx}>
                    <p className="font-medium">{STATUS_LABEL[e.status as keyof typeof STATUS_LABEL] ?? e.status}</p>
                    <p className="text-taupe">{when(e.at)}{e.note ? ` · ${e.note}` : ""}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="h-fit space-y-4">
          <section className="rounded-3xl bg-blush/50 p-6">
            <h2 className="text-xl font-medium">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(o.subtotal)}</dd></div>
              <div className="flex justify-between"><dt>Shipping</dt><dd>{o.shipping_fee ? formatINR(o.shipping_fee) : "Free"}</dd></div>
              {o.cod_fee > 0 && <div className="flex justify-between"><dt>COD charge</dt><dd>{formatINR(o.cod_fee)}</dd></div>}
              {o.discount > 0 && <div className="flex justify-between text-sage-deep"><dt>Coupon{o.coupon_code ? ` ${o.coupon_code}` : ""}</dt><dd>−{formatINR(o.discount)}</dd></div>}
              {o.discount === 0 && o.coupon_code && <div className="flex justify-between text-sage-deep"><dt>Coupon {o.coupon_code}</dt><dd>Free shipping</dd></div>}
              <div className="flex justify-between border-t border-champagne pt-2 text-base font-semibold"><dt>Total</dt><dd>{formatINR(o.total)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-taupe">{o.payment_method === "cod" ? "Cash on Delivery" : "Paid online"}{o.payment_method === "online" && o.payment_status === "pending" ? " (pending)" : ""}</p>
            {o.refunded_amount > 0 && <p className="mt-1 text-xs font-medium text-sage-deep">{formatINR(o.refunded_amount)} refunded</p>}
            {o.invoice_number && (
              <a href={`/invoice/${o.order_number}${sp.t ? `?t=${sp.t}` : ""}`} target="_blank" className="mt-3 inline-flex min-h-10 items-center rounded-full border border-cocoa/30 px-4 text-sm hover:border-cocoa">
                Download invoice
              </a>
            )}
          </section>
          <section className="rounded-3xl border border-champagne bg-cream p-6 text-sm">
            <h2 className="text-xl font-medium">Delivering to</h2>
            <p className="mt-2 font-medium">{a.full_name} · {a.phone}</p>
            <p className="text-taupe">{[a.line1, a.line2, a.landmark, a.city, a.state].filter(Boolean).join(", ")} – {a.pincode}</p>
            {o.customer_note && <p className="mt-3"><span className="text-taupe">Your note:</span> {o.customer_note}</p>}
          </section>
          {store.whatsapp && (
            <a href={whatsappLink(store.whatsapp, `Hi, I have a question about my order ${o.order_number}.`)} target="_blank" rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-sage-deep text-sm font-medium text-cream">
              <MessageCircle className="size-4" /> Questions? WhatsApp us
            </a>
          )}
          <Link href="/products" className="block text-center text-sm text-taupe underline-offset-4 hover:underline">Continue shopping</Link>
        </aside>
      </div>
    </PageShell>
  );
}
