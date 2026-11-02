"use client";

import { useActionState } from "react";
import { Card, Field, Notice, btnPrimary, inputCls, textareaCls } from "@/components/admin/ui";
import { saveStore, type StoreState } from "./actions";

export type StoreValues = Record<"name" | "tagline" | "description" | "announcement" | "shipping_note" | "returns_note" | "whatsapp" | "instagram_url"
  | "instagram_handle" | "facebook_url" | "email" | "phone" | "address", string> & { new_arrival_days: number };

export function StoreForm({ v }: { v: StoreValues }) {
  const [state, action, pending] = useActionState<StoreState, FormData>(saveStore, {});
  const t = (name: keyof StoreValues, label: string, hint?: string, max = 120) => (
    <Field label={label} htmlFor={name} hint={hint}><input id={name} name={name} maxLength={max} defaultValue={String(v[name] ?? "")} className={inputCls} /></Field>
  );
  return (
    <form action={action} className="space-y-6">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      <Card title="Store">
        <div className="grid gap-5 sm:grid-cols-2">
          {t("name", "Store name", undefined, 80)}
          {t("tagline", "Tagline", "e.g. One Stop Destination for Ladies Items")}
          <Field label="About the store (footer & Google)" htmlFor="description" className="sm:col-span-2"><textarea id="description" name="description" rows={3} maxLength={400} defaultValue={v.description} className={textareaCls} /></Field>
          <Field label="Announcement bar (top of every page)" htmlFor="announcement" className="sm:col-span-2" hint="Empty = shows a live offer, or your tagline">
            <input id="announcement" name="announcement" maxLength={140} defaultValue={v.announcement} className={inputCls} placeholder="e.g. Festive sale — free shipping above ₹999" /></Field>
          {t("shipping_note", "Shipping line", "e.g. Shipping all over India")}
          {t("returns_note", "Returns line on product pages", "e.g. No returns, exchanges or refunds", 200)}
          <Field label="New arrivals = added in the last (days)" htmlFor="new_arrival_days"><input id="new_arrival_days" name="new_arrival_days" type="number" min={1} max={365} defaultValue={v.new_arrival_days} className={inputCls} /></Field>
        </div>
      </Card>
      <Card title="Contact & social">
        <div className="grid gap-5 sm:grid-cols-2">
          {t("whatsapp", "WhatsApp number", "With country code, e.g. 91 98859 49698")}
          {t("phone", "Phone (optional)", undefined, 30)}
          {t("email", "Email", "Also receives new-order emails")}
          {t("instagram_handle", "Instagram username", "Without @")}
          {t("instagram_url", "Instagram link", "https://www.instagram.com/…", 200)}
          {t("facebook_url", "Facebook link (optional)", undefined, 200)}
          <Field label="Shop address" htmlFor="address" className="sm:col-span-2"><textarea id="address" name="address" rows={3} maxLength={300} defaultValue={v.address} className={textareaCls} /></Field>
        </div>
      </Card>
      <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Save store settings"}</button>
    </form>
  );
}
