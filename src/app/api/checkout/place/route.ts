import { NextResponse, after } from "next/server";
import { notifyOrder } from "@/server/notify";
import { supabaseForUser } from "@/lib/supabase/server";
import { supabaseServer } from "@/server/supabase-admin";
import { createRazorpayOrder, onlinePaymentsReady, razorpayKeyId } from "@/server/razorpay";
import { getStoreSettings } from "@/server/catalog";
import { PlaceOrder } from "../schema";

type Placed = { id: string; order_number: string; access_token: string; total: number; status: string };

/**
 * Create the order. The database re-prices everything and holds the stock;
 * for online payment we then open a Razorpay order for that exact total.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = PlaceOrder.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;
  if (input.method === "online" && !onlinePaymentsReady) {
    return NextResponse.json({ error: "Online payment isn't set up yet. Please choose Cash on Delivery." }, { status: 400 });
  }

  const s = await supabaseForUser();
  const { data, error } = await s.rpc("place_order", { p: input });
  if (error) {
    const cartChanged = error.hint === "cart_changed";
    const couponError = error.hint === "coupon";
    const known = cartChanged || couponError || error.code === "22023";
    if (!known) console.error("place_order:", error.message);
    return NextResponse.json({ error: known ? error.message : "Couldn't place the order. Please try again.", cartChanged, couponError }, { status: 409 });
  }
  const order = data as Placed;
  const link = `/order/${order.order_number}?t=${order.access_token}`;
  if (input.method === "cod") {
    after(() => notifyOrder(order.order_number, order.access_token, "placed")); // emails go out after the response
    return NextResponse.json({ kind: "cod", redirect: `${link}&placed=1` });
  }

  // Online: open a Razorpay order for the database's total.
  try {
    const rzpOrder = await createRazorpayOrder(Number(order.total), order.order_number, { order_number: order.order_number });
    const { error: e2 } = await supabaseServer().rpc("attach_razorpay_order", { p_order: order.id, p_rzp_order: rzpOrder });
    if (e2) throw new Error(e2.message);
    const store = await getStoreSettings();
    return NextResponse.json({
      kind: "online",
      order: { id: order.id, number: order.order_number, token: order.access_token, link },
      razorpay: {
        key: razorpayKeyId, order_id: rzpOrder, amount: Number(order.total), currency: "INR",
        name: store.name, description: `Order ${order.order_number}`,
        prefill: { name: input.name, email: input.email, contact: input.phone },
      },
    });
  } catch (e) {
    console.error("razorpay order:", (e as Error).message);
    await s.rpc("abandon_order", { p_order: order.id, p_token: order.access_token }); // give the stock back
    return NextResponse.json({ error: "Couldn't start the online payment. Please try again, or choose Cash on Delivery." }, { status: 502 });
  }
}
