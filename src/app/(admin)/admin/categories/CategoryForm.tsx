"use client";

import { useActionState, useState } from "react";
import { Card, Field, Notice, inputCls, textareaCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveCategory, type FormState } from "./actions";

export type ParentOption = { id: string; label: string; disabled: boolean };
type Initial = {
  id?: string; name: string; slug: string; parent_id: string | null; description: string | null;
  is_active: boolean; seo_title: string | null; seo_description: string | null;
};

const toSlug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export function CategoryForm({ initial, parents }: { initial: Initial; parents: ParentOption[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveCategory, {});
  const v = state.values;
  const [name, setName] = useState(v?.name ?? initial.name);
  const [slug, setSlug] = useState(v?.slug ?? initial.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <Card title="Details">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" error={fe.name}>
            <input id="name" name="name" required maxLength={80} className={inputCls} value={name}
              onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(toSlug(e.target.value)); }} />
          </Field>
          <Field label="Web address" htmlFor="slug" error={fe.slug} hint={`Shown as /c/${slug || "…"}`}>
            <input id="slug" name="slug" required maxLength={80} className={inputCls} value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} />
          </Field>
          <Field label="Parent category" htmlFor="parent_id" hint="Leave as “Top level” for a main menu category.">
            <select id="parent_id" name="parent_id" defaultValue={v?.parent_id ?? initial.parent_id ?? ""} className={inputCls}>
              <option value="">Top level</option>
              {parents.map((p) => <option key={p.id} value={p.id} disabled={p.disabled}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Visibility" htmlFor="is_active">
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input id="is_active" type="checkbox" name="is_active" defaultChecked={v ? v.is_active === "on" : initial.is_active} className="size-4 accent-cocoa" />
              Show on the store
            </label>
          </Field>
          <Field label="Description" htmlFor="description" className="sm:col-span-2" hint="Optional. Appears at the top of the category page.">
            <textarea id="description" name="description" rows={3} maxLength={2000} className={textareaCls} defaultValue={v?.description ?? initial.description ?? ""} />
          </Field>
        </div>
      </Card>

      <Card title="Search engines" description="Optional. Leave blank to use the category name.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Page title" htmlFor="seo_title" error={fe.seo_title} hint="Up to 70 characters">
            <input id="seo_title" name="seo_title" maxLength={70} className={inputCls} defaultValue={v?.seo_title ?? initial.seo_title ?? ""} />
          </Field>
          <Field label="Description" htmlFor="seo_description" error={fe.seo_description} hint="Up to 170 characters">
            <input id="seo_description" name="seo_description" maxLength={170} className={inputCls} defaultValue={v?.seo_description ?? initial.seo_description ?? ""} />
          </Field>
        </div>
      </Card>

      <div className="flex gap-3">
        <SubmitButton>{initial.id ? "Save changes" : "Create category"}</SubmitButton>
      </div>
    </form>
  );
}
