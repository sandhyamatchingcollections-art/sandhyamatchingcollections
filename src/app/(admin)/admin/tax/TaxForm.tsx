"use client";

import { useActionState } from "react";
import { Card, Field, Notice, btnPrimary, inputCls, textareaCls } from "@/components/admin/ui";
import { INDIAN_STATES } from "@/lib/orders";
import { saveTax, type TaxState } from "./actions";

type V = { gstin: string; legal_name: string; gst_state: string; address: string; default_gst_rate: number; shipping_gst_rate: number; invoice_prefix: string };
const RATES = [0, 3, 5, 12, 18, 28];

export function TaxForm({ v }: { v: V }) {
  const [state, action, pending] = useActionState<TaxState, FormData>(saveTax, {});
  return (
    <form action={action} className="space-y-6">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      <Card title="Business details on invoices">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="GSTIN" htmlFor="gstin" hint="Leave empty if not registered (invoices then show no GST breakdown)"><input id="gstin" name="gstin" maxLength={15} defaultValue={v.gstin} className={`${inputCls} uppercase`} /></Field>
          <Field label="Legal / business name" htmlFor="legal_name" hint="As on your GST certificate"><input id="legal_name" name="legal_name" maxLength={120} defaultValue={v.legal_name} className={inputCls} /></Field>
          <Field label="Registered state" htmlFor="gst_state" hint="Same state as the customer → CGST + SGST; otherwise IGST">
            <select id="gst_state" name="gst_state" defaultValue={v.gst_state} className={inputCls}>
              <option value="">Choose…</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Invoice prefix" htmlFor="invoice_prefix" hint="Invoices are numbered PREFIX/2026-27/0001"><input id="invoice_prefix" name="invoice_prefix" maxLength={10} defaultValue={v.invoice_prefix} className={`${inputCls} uppercase`} /></Field>
          <Field label="Business address" htmlFor="address" className="sm:col-span-2"><textarea id="address" name="address" rows={3} maxLength={300} defaultValue={v.address} className={textareaCls} /></Field>
        </div>
      </Card>
      <Card title="GST rates" description="Prices include GST. Set a different rate on any product (e.g. 3% jewellery, 18% cosmetics).">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Default rate for products" htmlFor="default_gst_rate">
            <select id="default_gst_rate" name="default_gst_rate" defaultValue={String(v.default_gst_rate)} className={inputCls}>{RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select>
          </Field>
          <Field label="Rate on shipping charges" htmlFor="shipping_gst_rate">
            <select id="shipping_gst_rate" name="shipping_gst_rate" defaultValue={String(v.shipping_gst_rate)} className={inputCls}>{RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select>
          </Field>
        </div>
        <p className="mt-4 text-xs text-taupe">Please confirm rates and HSN codes with your accountant; they depend on the product and its price.</p>
      </Card>
      <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Save tax settings"}</button>
    </form>
  );
}
