"use client";

import { useActionState, useState } from "react";
import { Card, Field, Notice, btnPrimary, inputCls } from "@/components/admin/ui";
import { saveCoupon, type CouponState } from "./actions";

export type CouponValues = {
  id?: string; code: string; description: string; kind: "percent" | "flat" | "free_shipping"; value: string;
  min_subtotal: string; max_discount: string; starts: string; ends: string; usage_limit: string; per_customer_limit: string;
  first_order_only: boolean; is_active: boolean;
};

export function CouponForm({ initial }: { initial: CouponValues }) {
  const [state, action, pending] = useActionState<CouponState, FormData>(saveCoupon, {});
  const v = { ...initial, ...(state.values ?? {}) } as CouponValues;
  const [kind, setKind] = useState(initial.kind);
  return (
    <form action={action} className="space-y-6">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <Card title="Coupon">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Code" htmlFor="code" hint="Customers type this at checkout"><input id="code" name="code" required defaultValue={v.code} maxLength={30} className={`${inputCls} uppercase`} /></Field>
          <Field label="Description (for you)" htmlFor="description"><input id="description" name="description" defaultValue={v.description} maxLength={200} className={inputCls} /></Field>
          <Field label="Type" htmlFor="kind">
            <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as CouponValues["kind"])} className={inputCls}>
              <option value="percent">Percent off</option><option value="flat">Rupees off</option><option value="free_shipping">Free shipping</option>
            </select>
          </Field>
          {kind !== "free_shipping" && (
            <Field label={kind === "percent" ? "Percent off" : "Rupees off (₹)"} htmlFor="value">
              <input id="value" name="value" inputMode="decimal" required defaultValue={v.value} className={inputCls} />
            </Field>
          )}
          {kind === "free_shipping" && <input type="hidden" name="value" value="0" />}
          <Field label="Minimum order (₹)" htmlFor="min_subtotal" hint="Optional"><input id="min_subtotal" name="min_subtotal" inputMode="decimal" defaultValue={v.min_subtotal} className={inputCls} /></Field>
          {kind === "percent" && <Field label="Maximum discount (₹)" htmlFor="max_discount" hint="Optional cap"><input id="max_discount" name="max_discount" inputMode="decimal" defaultValue={v.max_discount} className={inputCls} /></Field>}
          {kind !== "percent" && <input type="hidden" name="max_discount" value="" />}
        </div>
      </Card>
      <Card title="Limits">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Starts" htmlFor="starts" hint="Empty = today"><input id="starts" name="starts" type="date" defaultValue={v.starts} className={inputCls} /></Field>
          <Field label="Ends" htmlFor="ends" hint="Empty = no end"><input id="ends" name="ends" type="date" defaultValue={v.ends} className={inputCls} /></Field>
          <Field label="Total uses" htmlFor="usage_limit" hint="Empty = unlimited"><input id="usage_limit" name="usage_limit" inputMode="numeric" defaultValue={v.usage_limit} className={inputCls} /></Field>
          <Field label="Uses per customer" htmlFor="per_customer_limit" hint="Matched by phone or email. Empty = unlimited"><input id="per_customer_limit" name="per_customer_limit" inputMode="numeric" defaultValue={v.per_customer_limit} className={inputCls} /></Field>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="first_order_only" defaultChecked={v.first_order_only} className="size-4 accent-cocoa" /> First order only</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={v.is_active} className="size-4 accent-cocoa" /> Active</label>
        </div>
      </Card>
      <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Save coupon"}</button>
    </form>
  );
}
