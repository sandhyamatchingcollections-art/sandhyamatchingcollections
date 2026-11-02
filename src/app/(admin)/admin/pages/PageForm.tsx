"use client";

import { useActionState, useState } from "react";
import { Card, Field, Notice, btnPrimary, inputCls } from "@/components/admin/ui";
import { RichText } from "@/components/store/RichText";
import { savePage, type PageState } from "./actions";

export function PageForm({ v }: { v: { slug: string; title: string; body: string; is_published: boolean } }) {
  const [state, action, pending] = useActionState<PageState, FormData>(savePage, {});
  const [body, setBody] = useState(v.body);
  return (
    <form action={action} className="space-y-6">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="slug" value={v.slug} />
      <Card title="Page">
        <Field label="Title" htmlFor="title"><input id="title" name="title" required maxLength={80} defaultValue={v.title} className={inputCls} /></Field>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Field label="Text" htmlFor="body" hint="## Heading · - list item · **bold** · [link](/c/sarees) · blank line = new paragraph">
            <textarea id="body" name="body" rows={22} maxLength={50000} value={body} onChange={(e) => setBody(e.target.value)}
              className="mt-2 w-full rounded-xl border border-champagne bg-ivory p-4 font-mono text-[13px] leading-relaxed focus:border-cocoa/50 focus:outline-none" />
          </Field>
          <div>
            <p className="text-sm font-medium text-cocoa">Preview</p>
            <div className="mt-2 max-h-[34rem] overflow-auto rounded-xl border border-champagne bg-cream p-5"><RichText text={body} /></div>
          </div>
        </div>
      </Card>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_published" defaultChecked={v.is_published} className="size-4 accent-cocoa" /> Published (visible on the store)</label>
      <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Save page"}</button>
    </form>
  );
}
