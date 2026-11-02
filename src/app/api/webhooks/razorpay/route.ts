import { NextResponse, after } from "next/server";
import { notifyOrder } from "@/server/notify";
import { supabaseServer } from "@/server/supabase-admin";
import { verifyWebhookSignature } from "@/server/razorpay";

type Event = { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number } } } };

/**
 * Razorpay → us, server to server. Backs up the browser callback (e.g. the shopper
 * closed the tab right after paying). Safe to receive the same event many times.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature") ?? "")) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  let ev: Event;
  try { ev = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }

  if (ev.event === "payment.captured" || ev.event === "order.paid") {
    const pay = ev.payload?.payment?.entity;
    if (pay?.order_id && pay.id) {
      const { data, error } = await supabaseServer().rpc("confirm_payment", {
        p_rzp_order: pay.order_id, p_payment: pay.id, p_amount: pay.amount ?? null,
      });
      // Unknown order = not from this store; acknowledge so Razorpay stops retrying.
      if (error && error.code !== "P0002") {
        console.error("webhook confirm_payment:", error.message);
        return NextResponse.json({ error: "retry" }, { status: 500 });
      }
      if (!error) after(() => notifyPaid(pay.order_id!, data));
    }
  }
  return NextResponse.json({ ok: true });
}

/** After a confirmed payment: email the customer and the store (once — repeats return already=true). */
async function notifyPaid(rzpOrder: string, result: unknown) {
  if ((result as { already?: boolean } | null)?.already) return;
  const { data } = await supabaseServer().from("orders").select("order_number, access_token").eq("razorpay_order_id", rzpOrder).maybeSingle();
  if (data) await notifyOrder(data.order_number, data.access_token, "placed");
}
