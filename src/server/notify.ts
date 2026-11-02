import "server-only";
import { supabasePublic } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/supabase/env";
import { formatINR } from "@/lib/money";
import { getStoreSettings } from "@/server/catalog";
import { mapOrder } from "@/server/orders";
import { sendEmail } from "./email";
import type { OrderView } from "@/lib/types";

export type NotifyKind = "placed" | "shipped" | "delivered" | "cancelled" | "refunded";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const qty = (q: number, u: string) => `${q}${u === "metre" ? " m" : u === "yard" ? " yd" : " ×"}`;

function layout(store: string, title: string, intro: string, o: OrderView, link: string, extra = "") {
  const rows = o.items.map((i) => `<tr><td style="padding:6px 0">${esc(i.name)}${i.title !== "Default" ? ` · ${esc(i.title)}` : ""}<br><span style="color:#8a7468;font-size:12px">${qty(i.qty, i.unit)}</span></td><td style="padding:6px 0;text-align:right">${formatINR(i.line_total)}</td></tr>`).join("");
  const line = (k: string, v: string, b = false) => `<tr><td style="padding:3px 0;${b ? "font-weight:600" : ""}">${k}</td><td style="padding:3px 0;text-align:right;${b ? "font-weight:600" : ""}">${v}</td></tr>`;
  const a = o.shipping_address;
  return `<!doctype html><html><body style="margin:0;background:#faf6f1;font-family:Arial,sans-serif;color:#3e2c25">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf9;border:1px solid #eaded2;border-radius:16px">
<tr><td style="padding:24px 28px 8px"><p style="margin:0;font-family:Georgia,serif;font-size:22px">${esc(store)}</p></td></tr>
<tr><td style="padding:8px 28px"><h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:normal">${esc(title)}</h1>
<p style="margin:0 0 4px;line-height:1.5">${intro}</p>${extra}
<p style="margin:18px 0"><a href="${link}" style="display:inline-block;background:#3e2c25;color:#fffdf9;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px">View order ${esc(o.order_number)}</a></p></td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" style="border-top:1px solid #eaded2;font-size:14px">${rows}</table>
<table role="presentation" width="100%" style="border-top:1px solid #eaded2;font-size:14px;margin-top:6px">
${line("Subtotal", formatINR(o.subtotal))}${o.discount ? line(`Coupon ${esc(o.coupon_code ?? "")}`, "−" + formatINR(o.discount)) : ""}
${line("Shipping", o.shipping_fee ? formatINR(o.shipping_fee) : "Free")}${o.cod_fee ? line("COD charge", formatINR(o.cod_fee)) : ""}
${line("Total", formatINR(o.total), true)}</table></td></tr>
<tr><td style="padding:16px 28px 24px;font-size:13px;color:#8a7468">Delivering to ${esc(a.full_name)}, ${esc([a.line1, a.line2, a.city, a.state].filter(Boolean).join(", "))} – ${esc(a.pincode)}<br>
Payment: ${o.payment_method === "cod" ? "Cash on Delivery" : "Paid online"}</td></tr>
</table><p style="font-size:12px;color:#8a7468">Questions? Just reply to this email.</p></td></tr></table></body></html>`;
}

/**
 * Email the customer about their order (and the store about new orders).
 * Never throws: a failed email must not undo a placed order or a status change.
 */
export async function notifyOrder(number: string, token: string, kind: NotifyKind, extra?: { amount?: number; note?: string | null }): Promise<void> {
  try {
    const { data } = await supabasePublic().rpc("order_view", { p_number: number, p_token: token });
    if (!data) return;
    const o = mapOrder(data as Record<string, unknown>);
    const store = await getStoreSettings();
    const link = `${SITE_URL}/order/${o.order_number}?t=${token}`;
    const first = esc(o.customer_name.split(" ")[0]);
    const latestNote = extra?.note ?? [...o.events].reverse().find((e) => e.status === kind)?.note ?? null;
    const noteHtml = latestNote ? `<p style="margin:8px 0 0;padding:10px 12px;background:#f3ece4;border-radius:10px">${esc(latestNote)}</p>` : "";

    const msg = {
      placed: { s: `Order ${o.order_number} confirmed`, t: `Thank you, ${first}!`, i: o.payment_method === "cod"
        ? "We've received your order. Please keep the cash ready when it arrives — we'll let you know when it ships."
        : "We've received your order and your payment. We'll let you know when it ships." },
      shipped: { s: `Your order ${o.order_number} is on its way`, t: "Your order has shipped", i: `Good news, ${first} — your order is on its way.` },
      delivered: { s: `Order ${o.order_number} delivered`, t: "Delivered!", i: `Your order has been delivered, ${first}. We hope you love it.` },
      cancelled: { s: `Order ${o.order_number} cancelled`, t: "Your order was cancelled", i: `Your order has been cancelled. Please contact us on WhatsApp for any help.` },
      refunded: { s: `Refund for order ${o.order_number}`, t: "Refund on its way", i: `We've refunded ${formatINR(extra?.amount ?? o.refunded_amount)} for your order. It usually reaches your account in 5–7 working days.` },
    }[kind];
    await sendEmail({ to: o.email, subject: msg.s, html: layout(store.name, msg.t, msg.i, o, link, noteHtml), replyTo: store.email });

    if (kind === "placed" && store.email) {
      await sendEmail({
        to: store.email, subject: `New order ${o.order_number} · ${formatINR(o.total)} · ${o.payment_method === "cod" ? "COD" : "Paid online"}`,
        html: layout(store.name, `New order from ${o.customer_name}`, `Phone ${esc(o.phone)} · ${esc(o.email)}${o.customer_note ? `<br>Note: ${esc(o.customer_note)}` : ""}`,
          o, `${SITE_URL}/admin/orders/${o.order_number}`),
      });
    }
  } catch (e) {
    console.error("notifyOrder:", (e as Error).message);
  }
}

/** Ready-to-send WhatsApp text for the store to share an update with the customer. */
export function whatsappUpdate(o: OrderView, link: string): string {
  const first = o.customer_name.split(" ")[0];
  const note = [...o.events].reverse().find((e) => e.status === o.status)?.note;
  switch (o.status) {
    case "placed": case "confirmed": return `Hi ${first}, thank you for your order ${o.order_number} (${formatINR(o.total)}). We've confirmed it and will update you when it ships. Track here: ${link}`;
    case "packed": return `Hi ${first}, your order ${o.order_number} is packed and will ship soon. Track here: ${link}`;
    case "shipped": return `Hi ${first}, your order ${o.order_number} has shipped${note ? ` (${note})` : ""}. Track here: ${link}`;
    case "delivered": return `Hi ${first}, your order ${o.order_number} has been delivered. We hope you love it! 💐`;
    case "cancelled": return `Hi ${first}, your order ${o.order_number} has been cancelled${o.cancel_reason ? ` (${o.cancel_reason})` : ""}. Please message us if you have any questions.`;
    default: return `Hi ${first}, about your order ${o.order_number}: ${link}`;
  }
}
