"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, Field, Notice, btnPrimary, btnSmall, inputCls, textareaCls } from "@/components/admin/ui";
import { ImageField } from "@/components/admin/ImageField";
import { saveSection, type SectionState } from "../actions";

type Spec = { path: string; label: string; kind: "text" | "textarea" | "link" | "image" | "number" | "select"; options?: [string, string][]; hint?: string; max?: number; aspect?: string };
type Json = Record<string, unknown>;

const cta = (k: string, label: string): Spec[] => [
  { path: `${k}.label`, label: `${label} — button text`, kind: "text", max: 40 },
  { path: `${k}.href`, label: `${label} — goes to`, kind: "link", hint: "A page on your site, e.g. /collections/bridal or /c/sarees" },
];
const tones: [string, string][] = [["blush", "Blush pink"], ["peach", "Peach"], ["lavender", "Lavender"], ["sage", "Sage green"], ["champagne", "Champagne"]];

const SPECS: Record<string, Spec[]> = {
  hero: [{ path: "eyebrow", label: "Small line above the heading", kind: "text", max: 60 }, { path: "heading", label: "Heading", kind: "text", max: 90 },
    { path: "body", label: "Text", kind: "textarea", max: 300 }, ...cta("primary", "Main button"), ...cta("secondary", "Second button"),
    { path: "imageUrl", label: "Photo", kind: "image", aspect: "aspect-[4/5]", hint: "Portrait photo works best (about 1200 × 1500)." }, { path: "imageAlt", label: "Photo description (for screen readers)", kind: "text", max: 160 }],
  banners: [{ path: "intervalSeconds", label: "Seconds per banner", kind: "number", hint: "Add and order the banner images in Admin → Promotional Banners." }],
  budget: [{ path: "heading", label: "Heading", kind: "text", max: 90 }, { path: "body", label: "Text", kind: "textarea", max: 200 }],
  bridalShowcase: [{ path: "eyebrow", label: "Small line above the heading", kind: "text", max: 60 }, { path: "heading", label: "Heading", kind: "text", max: 90 },
    { path: "body", label: "Text", kind: "textarea", max: 300 },
    { path: "imageUrl", label: "Bridal photo", kind: "image", aspect: "aspect-[3/4]", hint: "A full-length bride photo, portrait (about 1200 × 1600). It's shown in an arch." },
    { path: "imageAlt", label: "Photo description", kind: "text", max: 160 }, ...cta("cta", "Button")],
  feature: [{ path: "heading", label: "Heading", kind: "text", max: 90 }, { path: "body", label: "Text", kind: "textarea", max: 300 }, ...cta("cta", "Button"),
    { path: "imageUrl", label: "Photo", kind: "image", aspect: "aspect-[4/5]" }, { path: "imageAlt", label: "Photo description", kind: "text", max: 160 },
    { path: "collectionSlug", label: "Products from collection", kind: "text", hint: "e.g. bridal or kurtas (from Featured Collections)" },
    { path: "imageSide", label: "Photo on the", kind: "select", options: [["left", "Left"], ["right", "Right"]] }, { path: "tone", label: "Background colour", kind: "select", options: tones }],
  productRail: [{ path: "heading", label: "Heading", kind: "text", max: 90 }, { path: "body", label: "Text", kind: "textarea", max: 200 }, ...cta("cta", "Button"),
    { path: "limit", label: "How many products", kind: "number" }],
  owner: [{ path: "eyebrow", label: "Small line above the heading", kind: "text", max: 60 }, { path: "heading", label: "Heading", kind: "text", max: 90 },
    { path: "name", label: "Founder's name", kind: "text", max: 60, hint: "Shown under the story in a signature style" }, { path: "role", label: "Title", kind: "text", max: 80 },
    { path: "quote", label: "Quote", kind: "textarea", max: 240 }, { path: "body", label: "Story", kind: "textarea", max: 900 },
    { path: "imageUrl", label: "Founder's photo", kind: "image", aspect: "aspect-[4/5]", hint: "A warm portrait (about 1000 × 1250)." }, { path: "imageAlt", label: "Photo description", kind: "text", max: 160 }],
  promo: [{ path: "heading", label: "Heading", kind: "text", max: 90 }, { path: "body", label: "Text", kind: "textarea", max: 200 }, ...cta("cta", "Button")],
};

const get = (o: Json, path: string): unknown => path.split(".").reduce<unknown>((a, k) => (a as Json | undefined)?.[k], o);
function setIn(o: Json, path: string, v: unknown): Json {
  const [k, ...rest] = path.split(".");
  return { ...o, [k]: rest.length ? setIn((o[k] as Json) ?? {}, rest.join("."), v) : v };
}

export function SectionEditor({ id, type, initial, enabled }: { id: string; type: string; initial: Json; enabled: boolean }) {
  const [state, action, pending] = useActionState<SectionState, FormData>(saveSection, {});
  const [cfg, setCfg] = useState<Json>(initial);
  const set = (path: string, v: unknown) => setCfg((c) => setIn(c, path, v));
  const items = (cfg.items as { label: string; note: string; href: string }[] | undefined) ?? [];
  const ranges = (cfg.ranges as { key: string; label: string; enabled: boolean }[] | undefined) ?? [];

  return (
    <form action={action} className="space-y-6">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="config" value={JSON.stringify(cfg)} />
      <Card title="Content">
        <div className="grid gap-5">
          {(SPECS[type] ?? []).map((f) => {
            const v = get(cfg, f.path);
            const fid = `f-${f.path.replace(/\./g, "-")}`;
            if (f.kind === "image") return (
              <Field key={f.path} label={f.label} htmlFor={fid}>
                <ImageField value={(v as string | null) ?? null} onChange={(u) => set(f.path, u)} aspect={f.aspect} hint={f.hint} />
              </Field>
            );
            return (
              <Field key={f.path} label={f.label} htmlFor={fid} hint={f.hint}>
                {f.kind === "textarea" ? <textarea id={fid} rows={4} maxLength={f.max} className={textareaCls} value={String(v ?? "")} onChange={(e) => set(f.path, e.target.value)} />
                  : f.kind === "select" ? <select id={fid} className={inputCls} value={String(v ?? "")} onChange={(e) => set(f.path, e.target.value)}>{f.options!.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>
                  : f.kind === "number" ? <input id={fid} type="number" className={inputCls} value={Number(v ?? 0)} onChange={(e) => set(f.path, Number(e.target.value))} />
                  : <input id={fid} maxLength={f.max} className={inputCls} value={String(v ?? "")} onChange={(e) => set(f.path, e.target.value)} />}
              </Field>
            );
          })}
        </div>
      </Card>

      {type === "bridalShowcase" && (
        <Card title="What the bride needs" description="Each line links to a category. Shown in two columns around the photo.">
          <ul className="space-y-3">
            {items.map((it, i) => (
              <li key={i} className="grid gap-2 rounded-xl border border-champagne bg-ivory p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <label className="text-xs">Name<input className={inputCls} maxLength={40} value={it.label} onChange={(e) => set("items", items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></label>
                <label className="text-xs">Small note<input className={inputCls} maxLength={60} value={it.note} onChange={(e) => set("items", items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} /></label>
                <label className="text-xs">Goes to<input className={inputCls} value={it.href} onChange={(e) => set("items", items.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} /></label>
                <button type="button" onClick={() => set("items", items.filter((_, j) => j !== i))} aria-label={`Remove ${it.label}`} className="grid size-10 place-items-center rounded-full text-taupe hover:text-rose"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
          {items.length < 10 && <button type="button" onClick={() => set("items", [...items, { label: "", note: "", href: "/c/" }])} className={`${btnSmall} mt-3`}><Plus className="size-4" /> Add item</button>}
        </Card>
      )}

      {type === "budget" && (
        <Card title="Budget tiles">
          <ul className="space-y-2 text-sm">
            {ranges.map((r, i) => (
              <li key={r.key}><label className="flex items-center gap-2"><input type="checkbox" checked={r.enabled} className="size-4 accent-cocoa"
                onChange={(e) => set("ranges", ranges.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} /> {r.label}</label></li>
            ))}
          </ul>
        </Card>
      )}

      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_enabled" defaultChecked={enabled} className="size-4 accent-cocoa" /> Show this section on the homepage</label>
      <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Save section"}</button>
    </form>
  );
}
