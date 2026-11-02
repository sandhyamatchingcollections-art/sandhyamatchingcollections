"use client";

import { useActionState } from "react";
import { Card, Field, Notice, btnPrimary, inputCls } from "@/components/admin/ui";
import { saveShipping, type ShippingState } from "./actions";

type V = { shipping_fee: string; free_shipping_min: string; cod_enabled: boolean; cod_fee: string; cod_max_total: string; delivery_min_days: number; delivery_max_days: number };

export function ShippingForm({ v }: { v: V }) {
  const [state, action, pending] = useActionState<ShippingState, FormData>(saveShipping, {});
  return (
    <form action={action} className="space-y-6">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      <Card title="Delivery charge" description="One flat charge per order. Leave “Free above” empty to always charge.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Shipping charge (₹)" htmlFor="shipping_fee"><input id="shipping_fee" name="shipping_fee" inputMode="decimal" required defaultValue={v.shipping_fee} className={inputCls} /></Field>
          <Field label="Free shipping above (₹)" htmlFor="free_shipping_min" hint="Order subtotal at or above this ships free"><input id="free_shipping_min" name="free_shipping_min" inputMode="decimal" defaultValue={v.free_shipping_min} className={inputCls} /></Field>
          <Field label="Fastest delivery (days)" htmlFor="delivery_min_days"><input id="delivery_min_days" name="delivery_min_days" type="number" min={1} max={60} required defaultValue={v.delivery_min_days} className={inputCls} /></Field>
          <Field label="Slowest delivery (days)" htmlFor="delivery_max_days" hint="Shown on product pages and checkout"><input id="delivery_max_days" name="delivery_max_days" type="number" min={1} max={90} required defaultValue={v.delivery_max_days} className={inputCls} /></Field>
        </div>
      </Card>
      <Card title="Cash on Delivery">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="cod_enabled" defaultChecked={v.cod_enabled} className="size-4 accent-cocoa" /> Offer Cash on Delivery</label>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field label="COD charge (₹)" htmlFor="cod_fee" hint="Extra charge for COD orders; 0 for none"><input id="cod_fee" name="cod_fee" inputMode="decimal" required defaultValue={v.cod_fee} className={inputCls} /></Field>
          <Field label="COD only for orders up to (₹)" htmlFor="cod_max_total" hint="Empty = no limit. Limits risk on expensive items."><input id="cod_max_total" name="cod_max_total" inputMode="decimal" defaultValue={v.cod_max_total} className={inputCls} /></Field>
        </div>
      </Card>
      <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Save shipping settings"}</button>
    </form>
  );
}
