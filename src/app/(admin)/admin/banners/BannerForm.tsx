"use client";

import { useActionState } from "react";
import { Card, Field, Notice, btnPrimary, inputCls } from "@/components/admin/ui";
import { ImageField } from "@/components/admin/ImageField";
import { saveBanner, type BannerState } from "./actions";

export type BannerValues = { id?: string; image_url: string; mobile_image_url: string; alt: string; title: string; subtitle: string;
  cta_label: string; link: string; text_color: "dark" | "light"; starts: string; ends: string; is_active: boolean };

export function BannerForm({ v }: { v: BannerValues }) {
  const [state, action, pending] = useActionState<BannerState, FormData>(saveBanner, {});
  return (
    <form action={action} className="space-y-6">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="id" value={v.id ?? ""} />
      <Card title="Photos">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Banner photo (computer)" htmlFor="image_url">
            <ImageField name="image_url" value={v.image_url || null} folder="banners" aspect="aspect-[21/9]" hint="Wide photo, about 2100 × 900." />
          </Field>
          <Field label="Phone photo (optional)" htmlFor="mobile_image_url">
            <ImageField name="mobile_image_url" value={v.mobile_image_url || null} folder="banners" aspect="aspect-[4/5]" hint="Tall photo, about 1000 × 1250. Without it, the wide photo is cropped." />
          </Field>
        </div>
        <Field label="Photo description (for screen readers)" htmlFor="alt" className="mt-5"><input id="alt" name="alt" maxLength={160} defaultValue={v.alt} className={inputCls} /></Field>
      </Card>
      <Card title="Text on the banner (optional)" description="Leave empty if your photo already has text on it.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Title" htmlFor="title"><input id="title" name="title" maxLength={80} defaultValue={v.title} className={inputCls} /></Field>
          <Field label="Subtitle" htmlFor="subtitle"><input id="subtitle" name="subtitle" maxLength={160} defaultValue={v.subtitle} className={inputCls} /></Field>
          <Field label="Button text" htmlFor="cta_label"><input id="cta_label" name="cta_label" maxLength={30} defaultValue={v.cta_label} className={inputCls} /></Field>
          <Field label="Banner goes to" htmlFor="link" hint="e.g. /collections/bridal — the whole banner is clickable"><input id="link" name="link" defaultValue={v.link} className={inputCls} /></Field>
          <Field label="Text colour" htmlFor="text_color">
            <select id="text_color" name="text_color" defaultValue={v.text_color} className={inputCls}><option value="dark">Dark text (for light photos)</option><option value="light">Light text (for dark photos)</option></select>
          </Field>
        </div>
      </Card>
      <Card title="When to show">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Starts" htmlFor="starts" hint="Empty = today"><input id="starts" name="starts" type="date" defaultValue={v.starts} className={inputCls} /></Field>
          <Field label="Ends" htmlFor="ends" hint="Empty = until you switch it off"><input id="ends" name="ends" type="date" defaultValue={v.ends} className={inputCls} /></Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={v.is_active} className="size-4 accent-cocoa" /> Show on the homepage</label>
      </Card>
      <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Save banner"}</button>
    </form>
  );
}
