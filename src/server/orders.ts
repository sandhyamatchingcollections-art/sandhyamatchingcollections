import "server-only";
import { supabaseForUser } from "@/lib/supabase/server";
import { storageUrl } from "@/lib/supabase/env";
import { mapQuote } from "@/server/catalog/supabase-source";
import type { CartLineIn, CheckoutQuote, CouponResult, OrderView, PaymentMethod, SavedAddress } from "@/lib/types";

const n = (x: unknown) => Number(x ?? 0);

export async function checkoutQuote(lines: CartLineIn[], method: PaymentMethod, coupon?: string): Promise<CheckoutQuote> {
  const s = await supabaseForUser();
  const { data, error } = await s.rpc("checkout_quote", { p_lines: lines, p_method: method, p_coupon: coupon || null });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  return {
    ...mapQuote(d),
    shipping_fee: n(d.shipping_fee), cod_fee: n(d.cod_fee), total: n(d.total),
    free_shipping_min: d.free_shipping_min == null ? null : n(d.free_shipping_min),
    cod_allowed: Boolean(d.cod_allowed), cod_max_total: d.cod_max_total == null ? null : n(d.cod_max_total),
    online_allowed: Boolean(d.online_allowed), discount: n(d.discount),
    coupon: d.coupon ? { ...(d.coupon as CouponResult), discount: n((d.coupon as CouponResult).discount) } : null,
  };
}

export function mapOrder(d: Record<string, unknown>): OrderView {
  type RawItem = Omit<OrderView["items"][number], "image_url"> & { image_path?: string | null };
  const o = d as unknown as Omit<OrderView, "items"> & { items: RawItem[] };
  return {
    ...o,
    subtotal: n(o.subtotal), shipping_fee: n(o.shipping_fee), cod_fee: n(o.cod_fee), discount: n(o.discount), total: n(o.total),
    refunded_amount: n(o.refunded_amount),
    items: (o.items ?? []).map(({ image_path, ...i }) => ({
      ...i, qty: n(i.qty), price: n(i.price), mrp: i.mrp == null ? null : n(i.mrp), line_total: n(i.line_total),
      image_url: storageUrl("product-images", image_path ?? null),
    })),
    events: o.events ?? [],
  };
}

/** An order the visitor may see: their own, staff, or with the private link token. */
export async function orderView(number: string, token?: string): Promise<OrderView | null> {
  if (!/^SMC\d{4,10}$/i.test(number)) return null;
  const s = await supabaseForUser();
  const { data, error } = await s.rpc("order_view", {
    p_number: number, p_token: token && /^[0-9a-f-]{36}$/i.test(token) ? token : null,
  });
  if (error || !data) return null;
  return mapOrder(data as Record<string, unknown>);
}

export async function myOrders() {
  const s = await supabaseForUser();
  const { data } = await s.rpc("my_orders");
  return ((data ?? []) as Record<string, unknown>[]).map((o) => ({
    id: String(o.id), order_number: String(o.order_number), status: String(o.status), payment_method: String(o.payment_method),
    total: n(o.total), created_at: String(o.created_at),
  }));
}

export async function myAddresses(): Promise<SavedAddress[]> {
  const s = await supabaseForUser();
  const { data } = await s.from("addresses").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: false });
  return (data ?? []) as SavedAddress[];
}
