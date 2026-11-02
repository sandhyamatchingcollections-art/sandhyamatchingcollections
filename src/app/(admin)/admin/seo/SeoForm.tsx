"use client";

import { useActionState, useState } from "react";
import { Card, Field, Notice, btnPrimary, inputCls, textareaCls } from "@/components/admin/ui";
import { ImageField } from "@/components/admin/ImageField";
import { saveSeo, type SeoState } from "./actions";

export function SeoForm({ v, fallbackTitle, fallbackDescription, site }: { v: { seo_title: string; seo_description: string; og_image_url: string }; fallbackTitle: string; fallbackDescription: string; site: string }) {
  const [state, action, pending] = useActionState<SeoState, FormData>(saveSeo, {});
  const [title, setTitle] = useState(v.seo_title);
  const [desc, setDesc] = useState(v.seo_description);
  return (
    <form action={action} className="space-y-6">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      <Card title="How your homepage appears on Google">
        <div className="grid gap-5">
          <Field label={`Title (${title.length}/70)`} htmlFor="seo_title" hint="Empty = store name and tagline"><input id="seo_title" name="seo_title" maxLength={70} value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} /></Field>
          <Field label={`Description (${desc.length}/170)`} htmlFor="seo_description" hint="One or two sentences with what you sell and where you ship"><textarea id="seo_description" name="seo_description" rows={3} maxLength={170} value={desc} onChange={(e) => setDesc(e.target.value)} className={textareaCls} /></Field>
        </div>
        <div className="mt-5 rounded-2xl border border-champagne bg-white p-4" aria-label="Google preview">
          <p className="text-xs text-[#4d5156]">{site.replace(/^https?:\/\//, "")}</p>
          <p className="text-lg text-[#1a0dab]">{title || fallbackTitle}</p>
          <p className="text-sm text-[#4d5156]">{desc || fallbackDescription}</p>
        </div>
      </Card>
      <Card title="Share image" description="Shown when your site is shared on WhatsApp, Facebook or Instagram.">
        <ImageField name="og_image_url" value={v.og_image_url || null} folder="seo" aspect="aspect-[1200/630]" hint="1200 × 630 works best. Your logo on a pastel background is a good choice." />
      </Card>
      <p className="text-sm text-taupe">Your sitemap is at <a className="underline" href="/sitemap.xml" target="_blank">{site}/sitemap.xml</a> — add it in Google Search Console after launch. Each product&apos;s own title and description are set in the product form.</p>
      <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Save SEO settings"}</button>
    </form>
  );
}
