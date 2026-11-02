"use server";

import { z } from "zod";
import { revalidatePath } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { orderView } from "@/server/orders";
import { notifyOrder } from "@/server/notify";
import { razorpaySecretSet, refundRazorpayPayment } from "@/server/razorpay";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";

const Status = z.enum(["placed", "confirmed", "packed", "shipped", "delivered", "cancelled", "on_hold"]);

/** Move an order to its next step. The database checks the step is allowed and handles stock. */
export async function changeOrderStatus(form: FormData): Promise<void> {
  const number = String(form.get("number") ?? "");
  let msg = "";
  try {
    await requirePermission("orders.write");
    const p = z.object({ id: z.string().uuid(), status: Status, note: z.string().trim().max(300) })
      .parse({ id: form.get("id"), status: form.get("status"), note: String(form.get("note") ?? "") });
    const s = await supabaseForUser();
    const { error } = await s.rpc("set_order_status", { p_order: p.id, p_status: p.status, p_note: p.note || null });
    if (error) msg = error.message;
    else if (p.status === "shipped" || p.status === "delivered" || p.status === "cancelled") {
      const o = await orderView(number); // staff can read it; gives the customer's private link token
      if (o) after(() => notifyOrder(o.order_number, o.access_token, p.status as "shipped" | "delivered" | "cancelled", { note: p.note || null }));
    }
  } catch (e) {
    msg = (e as Error).message;
  }
  revalidatePath("/admin/orders");
  redirect(`/admin/orders/${encodeURIComponent(number)}${msg ? `?error=${encodeURIComponent(msg)}` : "?saved=1"}`);
}

export async function saveStaffNote(form: FormData): Promise<void> {
  const number = String(form.get("number") ?? "");
  await requirePermission("orders.write");
  const id = z.string().uuid().parse(form.get("id"));
  const s = await supabaseForUser();
  const { error } = await s.rpc("set_order_staff_note", { p_order: id, p_note: String(form.get("staff_note") ?? "") });
  redirect(`/admin/orders/${encodeURIComponent(number)}${error ? `?error=${encodeURIComponent(error.message)}` : "?saved=1"}`);
}

/**
 * Refund a paid order. Online payments go back through Razorpay first; the refund is
 * recorded only after Razorpay accepts it. "Manual" records money returned by hand (UPI/cash).
 */
export async function refundOrder(form: FormData): Promise<void> {
  const number = String(form.get("number") ?? "");
  let msg = "";
  let done: { token: string; amount: number } | null = null;
  try {
    await requirePermission("orders.refund");
    const p = z.object({
      id: z.string().uuid(),
      amount: z.string().trim().transform((v) => Math.round(Number(v) * 100)).pipe(z.number().int().positive("Enter the refund amount")),
      method: z.enum(["razorpay", "manual"]),
      note: z.string().trim().max(300),
    }).parse({ id: form.get("id"), amount: String(form.get("amount") ?? ""), method: form.get("method"), note: String(form.get("note") ?? "") });
    const s = await supabaseForUser();
    const { data: o } = await s.from("orders").select("total, refunded_amount, payment_status, razorpay_payment_id, access_token").eq("id", p.id).single();
    if (!o) throw new Error("Order not found.");
    if (p.amount > Number(o.total) - Number(o.refunded_amount)) throw new Error("That's more than what's left to refund.");
    let rzpRefund: string | null = null;
    if (p.method === "razorpay") {
      if (!o.razorpay_payment_id || !razorpaySecretSet) throw new Error("This order can't be refunded through Razorpay. Use “Refunded by hand” instead.");
      rzpRefund = await refundRazorpayPayment(o.razorpay_payment_id, p.amount, { order_number: number });
    }
    const { error } = await s.rpc("record_refund", { p_order: p.id, p_amount: p.amount, p_method: p.method, p_rzp_refund: rzpRefund, p_note: p.note || null });
    if (error) {
      msg = rzpRefund
        ? `Razorpay accepted refund ${rzpRefund}, but it couldn't be saved here: ${error.message}. Don't refund again — note this refund id.`
        : error.message;
    } else done = { token: o.access_token, amount: p.amount };
  } catch (e) {
    msg = (e as Error).message;
  }
  if (done) { const d = done; after(() => notifyOrder(number, d.token, "refunded", { amount: d.amount })); }
  revalidatePath("/admin/orders");
  redirect(`/admin/orders/${encodeURIComponent(number)}${msg ? `?error=${encodeURIComponent(msg)}` : "?saved=1"}`);
}
