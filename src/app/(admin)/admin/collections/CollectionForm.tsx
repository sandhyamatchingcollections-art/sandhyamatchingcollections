"use client";

import { useActionState, useState } from "react";
import { Field, Notice, inputCls, textareaCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveCollection, type CollectionState } from "./actions";

const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export function CollectionForm({ initial }: { initial: { id?: string; title: string; slug: string; description: string | null; is_active: boolean } }) {
  const [state, action] = useActionState<CollectionState, FormData>(saveCollection, {});
  const [title, setTitle] = useState(state.values?.title ?? initial.title);
  const [slug, setSlug] = useState(state.values?.slug ?? initial.slug);
  return (
    <form action={action} className="space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Title" htmlFor="title">
          <input id="title" name="title" required maxLength={80} className={inputCls} value={title}
            onChange={(e) => { setTitle(e.target.value); if (!initial.id) setSlug(toSlug(e.target.value)); }} />
        </Field>
        <Field label="Web address" htmlFor="slug" hint={initial.id ? "Fixed — homepage sections link to it" : `Shown as /collections/${slug || "…"}`}>
          <input id="slug" name="slug" required maxLength={60} className={inputCls} value={slug} readOnly={Boolean(initial.id)}
            onChange={(e) => setSlug(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="description" className="sm:col-span-2" hint="Shown at the top of the collection page">
          <textarea id="description" name="description" rows={2} maxLength={500} className={textareaCls} defaultValue={state.values?.description ?? initial.description ?? ""} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={state.values ? state.values.is_active === "on" : initial.is_active} className="size-4 accent-cocoa" />
        Show on the store
      </label>
      <SubmitButton>{initial.id ? "Save" : "Create collection"}</SubmitButton>
    </form>
  );
}
