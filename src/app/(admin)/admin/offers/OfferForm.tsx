"use client";

import { useActionState } from "react";
import { Card, Field, Notice, btnPrimary, inputCls, textareaCls } from "@/components/admin/ui";
import { saveOffer, type OfferState } from "./actions";

export function OfferForm({ v }: { v: { id?: string; title: string; description: string; starts: string; ends: string; is_active: boolean } }) {
  const [state, action, pending] = useActionState<OfferState, FormData>(saveOffer, {});
  return (
    <form action={action} className="space-y-6">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="id" value={v.id ?? ""} />
      <Card title="Offer" description="Live offers appear in the homepage offer banner.">
        <div className="grid gap-5">
          <Field label="Title" htmlFor="title" hint="e.g. Flat 10% off bridal sets — use code BRIDE10"><input id="title" name="title" required maxLength={120} defaultValue={v.title} className={inputCls} /></Field>
          <Field label="Details (optional)" htmlFor="description"><textarea id="description" name="description" rows={3} maxLength={500} defaultValue={v.description} className={textareaCls} /></Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Starts" htmlFor="starts" hint="Empty = today"><input id="starts" name="starts" type="date" defaultValue={v.starts} className={inputCls} /></Field>
            <Field label="Ends" htmlFor="ends" hint="Empty = until you switch it off"><input id="ends" name="ends" type="date" defaultValue={v.ends} className={inputCls} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={v.is_active} className="size-4 accent-cocoa" /> Show on the store</label>
        </div>
      </Card>
      <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Save offer"}</button>
    </form>
  );
}
