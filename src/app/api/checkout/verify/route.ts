import { NextResponse, after } from "next/server";
import { notifyOrder } from "@/server/notify";
import { z } from "zod";
import { supabaseServer } from "@/server/supabase-admin";
import { verifyPaymentSignature } from "@/server/razorpay";

const Body = z.object({
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Called by the payment window on success. Only a valid Razorpay signature marks the order paid. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment details." }, { status: 400 });
  const { razorpay_order_id: o, razorpay_payment_id: p, razorpay_signature: sig } = parsed.data;
  if (!verifyPaymentSignature(o, p, sig)) {
    return NextResponse.json({ error: "We couldn't verify this payment. If money was taken, contact us with your order number." }, { status: 400 });
  }
  const { data, error } = await supabaseServer().rpc("confirm_payment", { p_rzp_order: o, p_payment: p, p_amount: null });
  if (error) {
    console.error("confirm_payment:", error.message);
    return NextResponse.json({ error: "Payment received, but we couldn't update your order yet. It will update shortly." }, { status: 500 });
  }
  after(() => notifyPaid(o, data));
  return NextResponse.json({ ok: true, status: (data as { status: string }).status });
}

/** After a confirmed payment: email the customer and the store (once — repeats return already=true). */
async function notifyPaid(rzpOrder: string, result: unknown) {
  if ((result as { already?: boolean } | null)?.already) return;
  const { data } = await supabaseServer().from("orders").select("order_number, access_token").eq("razorpay_order_id", rzpOrder).maybeSingle();
  if (data) await notifyOrder(data.order_number, data.access_token, "placed");
}

