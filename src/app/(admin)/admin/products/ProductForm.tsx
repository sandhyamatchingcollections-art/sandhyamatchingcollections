"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { Card, Field, Notice, btnSmall, inputCls, textareaCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveProduct, uploadProductImage, type ProductFormState } from "./actions";
import { shrinkImage } from "@/components/admin/ImageUpload";
import { btnSecondary } from "@/components/admin/ui";
import type { CategoryAttribute } from "@/server/admin/catalog";
import { blankVariant, type ProductDraft, type Unit, type VariantDraft } from "./product-draft";

type CatOption = { id: string; label: string; level: number; hidden: boolean };

const toSlug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const unitLabel: Record<Unit, string> = { piece: "Per piece", metre: "Per metre", yard: "Per yard", set: "Per set" };

export function ProductForm({ initial, categories, collections, attrMap }: {
  initial: ProductDraft;
  categories: CatOption[];
  collections: { id: string; title: string }[];
  attrMap: Record<string, CategoryAttribute[]>;
}) {
  const [state, action] = useActionState<ProductFormState, FormData>(saveProduct, {});
  const [p, setP] = useState<ProductDraft>(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));
  const fe = state.fieldErrors ?? {};
  const router = useRouter();
  // New products: photos are picked here and uploaded right after the product is created.
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [progress, setProgress] = useState("");
  const started = useRef<string | null>(null);
  useEffect(() => {
    const id = state.createdId;
    if (!id || started.current === id) return;
    started.current = id;
    (async () => {
      let failed = 0;
      for (const [i, ph] of photos.entries()) {
        setProgress(`Product created. Uploading photo ${i + 1} of ${photos.length}…`);
        const fd = new FormData();
        fd.set("id", id);
        fd.set("file", await shrinkImage(ph.file));
        try { if ((await uploadProductImage({}, fd)).error) failed++; } catch { failed++; }
      }
      router.replace(`/admin/products/${id}?created=1${failed ? `&photo_errors=${failed}` : ""}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.createdId]);
  function addPhotos(files: FileList | null) {
    const picked = Array.from(files ?? []).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    setPhotos((cur) => [...cur, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 10));
  }
  function movePhoto(i: number, d: -1 | 1) {
    setPhotos((cur) => { const n = [...cur]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  }
  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => setP((x) => ({ ...x, [k]: v }));
  const setVariant = (i: number, patch: Partial<VariantDraft>) =>
    setP((x) => ({ ...x, variants: x.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));

  // Filters that apply to the chosen categories (including inherited ones), without duplicates.
  const attrs = useMemo(() => {
    const seen = new Map<string, CategoryAttribute>();
    for (const c of p.categories) for (const a of attrMap[c.id] ?? []) seen.set(a.id, a);
    return [...seen.values()];
  }, [p.categories, attrMap]);

  const payload = JSON.stringify({
    ...p,
    attributes: attrs.map((a) => ({ attribute_id: a.id, values: p.attributes[a.id] ?? [] })),
    variants: p.variants.map((v, i) => { const copy = { ...v, sku: v.sku.trim() || suggestedSku(v, i) }; delete copy.on_hand; return copy; }),
  });
  const primaryId = p.categories.find((c) => c.primary)?.id ?? p.categories[0]?.id;

  function toggleCategory(id: string, on: boolean) {
    set("categories", on ? [...p.categories, { id, primary: p.categories.length === 0 }] : p.categories.filter((c) => c.id !== id));
  }
  // Suggested SKU shown as a hint; used only when the SKU box is left empty.
  function suggestedSku(v: VariantDraft, i: number) {
    const base = (p.slug || toSlug(p.name)).toUpperCase().split("-").filter(Boolean).map((w) => w.slice(0, 4)).join("-").slice(0, 24);
    const tail = [v.color, v.size].filter(Boolean).join("-").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 12);
    return [base || "SKU", tail || String(i + 1)].join("-");
  }

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <input type="hidden" name="payload" value={payload} />
      <input type="hidden" name="then" value={!p.id && photos.length ? "photos" : ""} />
      <div className="space-y-6 lg:col-span-2">
        {progress && <Notice tone="success">{progress}</Notice>}
        {state.error && <Notice tone="error">{state.error}</Notice>}
        {state.ok && <Notice tone="success">{state.ok}</Notice>}
      </div>

      <div className="min-w-0 space-y-6">
        <Card title="Product">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" error={fe.name} className="sm:col-span-2">
              <input id="name" className={inputCls} value={p.name} maxLength={160}
                onChange={(e) => setP((x) => ({ ...x, name: e.target.value, ...(slugTouched ? {} : { slug: toSlug(e.target.value) }) }))} />
            </Field>
            <Field label="Web address" htmlFor="slug" error={fe.slug} hint={`Shown as /p/${p.slug || "…"}`}>
              <input id="slug" className={inputCls} value={p.slug} maxLength={80} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} />
            </Field>
            <Field label="Brand" htmlFor="brand" hint="Optional">
              <input id="brand" className={inputCls} value={p.brand} maxLength={80} onChange={(e) => set("brand", e.target.value)} />
            </Field>
            <Field label="Description" htmlFor="description" className="sm:col-span-2" hint="Fabric, work, care instructions, what's included…">
              <textarea id="description" rows={6} className={textareaCls} value={p.description} maxLength={10000} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </div>
        </Card>

        {!p.id && (
          <Card title="Photos" description="The first photo is the main one. They upload when the product is created.">
            {photos.length > 0 && (
              <ul className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
                {photos.map((ph, i) => (
                  <li key={ph.url} className="relative rounded-xl border border-champagne bg-ivory p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph.url} alt={`Photo ${i + 1}`} className="aspect-[4/5] w-full rounded-lg object-cover" />
                    {i === 0 && <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-rose">Main photo</p>}
                    <div className="mt-1 flex justify-center gap-1">
                      <button type="button" disabled={i === 0} onClick={() => movePhoto(i, -1)} aria-label={`Move photo ${i + 1} earlier`} className="grid size-7 place-items-center rounded-full hover:bg-cream disabled:opacity-30"><ArrowLeft className="size-3.5" /></button>
                      <button type="button" disabled={i === photos.length - 1} onClick={() => movePhoto(i, 1)} aria-label={`Move photo ${i + 1} later`} className="grid size-7 place-items-center rounded-full hover:bg-cream disabled:opacity-30"><ArrowRight className="size-3.5" /></button>
                      <button type="button" onClick={() => setPhotos((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`} className="grid size-7 place-items-center rounded-full text-rose hover:bg-cream"><X className="size-3.5" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {photos.length < 10 && (
              <label className={`${btnSecondary} cursor-pointer`}>
                <ImagePlus className="size-4" /> {photos.length ? "Add more photos" : "Choose photos"}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only"
                  onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
              </label>
            )}
            <p className="mt-2 text-xs text-taupe">JPEG, PNG or WebP, up to 10 photos. Square or portrait photos look best.</p>
          </Card>
        )}

        <Card title="Prices, variants and stock" description="Add one row per colour/size. Fabrics can be sold by the metre in 0.5 m steps.">
          {fe.variants && <p className="mb-3 text-sm text-rose">{fe.variants}</p>}
          <div className="space-y-4">
            {p.variants.map((v, i) => {
              const err = (k: string) => fe[`variants.${i}.${k}`];
              const byLength = v.unit === "metre" || v.unit === "yard";
              const u = v.unit === "metre" ? "m" : v.unit === "yard" ? "yd" : "";
              return (
                <fieldset key={v.id ?? `new-${i}`} className={`rounded-xl border p-4 ${v.is_active ? "border-champagne bg-ivory/50" : "border-dashed border-champagne opacity-70"}`}>
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-taupe">
                    Variant {i + 1}{v.id ? "" : " · new"}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Colour" htmlFor={`v${i}-color`} error={err("color")}>
                      <input id={`v${i}-color`} className={inputCls} value={v.color} maxLength={40} placeholder="e.g. Rose" onChange={(e) => setVariant(i, { color: e.target.value })} />
                    </Field>
                    <Field label="Size" htmlFor={`v${i}-size`} error={err("size")}>
                      <input id={`v${i}-size`} className={inputCls} value={v.size} maxLength={20} placeholder="e.g. M or 38" onChange={(e) => setVariant(i, { size: e.target.value })} />
                    </Field>
                    <Field label="SKU" htmlFor={`v${i}-sku`} error={err("sku")} className="sm:col-span-2" hint={v.sku ? undefined : "Leave blank to use the suggestion shown"}>
                      <input id={`v${i}-sku`} className={inputCls} value={v.sku} maxLength={40} placeholder={suggestedSku(v, i)} onChange={(e) => setVariant(i, { sku: e.target.value })} />
                    </Field>
                    <Field label="Sold" htmlFor={`v${i}-unit`}>
                      <select id={`v${i}-unit`} className={inputCls} value={v.unit} onChange={(e) => {
                        const unit = e.target.value as Unit;
                        const len = unit === "metre" || unit === "yard";
                        setVariant(i, { unit, qty_step: len ? (byLength ? v.qty_step : "0.5") : "1", min_qty: len ? v.min_qty : String(Math.max(1, Math.round(Number(v.min_qty) || 1))) });
                      }}>
                        {(Object.keys(unitLabel) as Unit[]).map((k) => <option key={k} value={k}>{unitLabel[k]}</option>)}
                      </select>
                    </Field>
                    <Field label={`Selling price (₹${u ? ` / ${u}` : ""})`} htmlFor={`v${i}-price`} error={err("price")}>
                      <input id={`v${i}-price`} inputMode="decimal" className={inputCls} value={v.price} placeholder="0.00" onChange={(e) => setVariant(i, { price: e.target.value })} />
                    </Field>
                    <Field label="MRP (₹)" htmlFor={`v${i}-mrp`} error={err("mrp")} hint="Optional — shows a discount">
                      <input id={`v${i}-mrp`} inputMode="decimal" className={inputCls} value={v.mrp} onChange={(e) => setVariant(i, { mrp: e.target.value })} />
                    </Field>
                    {v.id ? (
                      <Field label="In stock" htmlFor={`v${i}-stock`} hint="Change stock in Inventory">
                        <p id={`v${i}-stock`} className="mt-3 text-sm font-medium">{v.track_inventory ? `${v.on_hand ?? 0}${u ? ` ${u}` : ""}` : "Not tracked"}</p>
                      </Field>
                    ) : (
                      <Field label={`Opening stock${u ? ` (${u})` : ""}`} htmlFor={`v${i}-stock`} error={err("initial_stock")}>
                        <input id={`v${i}-stock`} inputMode="decimal" className={inputCls} value={v.initial_stock} disabled={!v.track_inventory} placeholder="0" onChange={(e) => setVariant(i, { initial_stock: e.target.value })} />
                      </Field>
                    )}
                    <Field label={`Minimum order${u ? ` (${u})` : ""}`} htmlFor={`v${i}-min`} error={err("min_qty")}>
                      <input id={`v${i}-min`} inputMode="decimal" className={inputCls} value={v.min_qty} onChange={(e) => setVariant(i, { min_qty: e.target.value })} />
                    </Field>
                    {byLength && (
                      <Field label={`Steps of (${u})`} htmlFor={`v${i}-step`} error={err("qty_step")} hint="e.g. 0.5 or 1">
                        <input id={`v${i}-step`} inputMode="decimal" className={inputCls} value={v.qty_step} onChange={(e) => setVariant(i, { qty_step: e.target.value })} />
                      </Field>
                    )}
                    <Field label={`Maximum per order${u ? ` (${u})` : ""}`} htmlFor={`v${i}-max`} error={err("max_qty")} hint="Optional">
                      <input id={`v${i}-max`} inputMode="decimal" className={inputCls} value={v.max_qty} onChange={(e) => setVariant(i, { max_qty: e.target.value })} />
                    </Field>
                    <Field label="Weight (grams)" htmlFor={`v${i}-wt`} error={err("weight_grams")} hint="For shipping">
                      <input id={`v${i}-wt`} inputMode="numeric" className={inputCls} value={v.weight_grams} onChange={(e) => setVariant(i, { weight_grams: e.target.value })} />
                    </Field>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-cocoa" checked={v.is_active} onChange={(e) => setVariant(i, { is_active: e.target.checked })} /> On sale</label>
                    <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-cocoa" checked={v.track_inventory} onChange={(e) => setVariant(i, { track_inventory: e.target.checked })} /> Track stock</label>
                    {p.variants.length > 1 && (
                      <button type="button" className={`${btnSmall} ml-auto`} onClick={() => setP((x) => ({ ...x, variants: x.variants.filter((_, j) => j !== i) }))}>
                        <Trash2 className="size-3.5" /> Remove variant
                      </button>
                    )}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <button type="button" className={`${btnSmall} mt-4`} onClick={() => setP((x) => ({ ...x, variants: [...x.variants, blankVariant(x.variants[0]?.unit)] }))}>
            <Plus className="size-3.5" /> Add variant
          </button>
        </Card>

        {attrs.length > 0 && (
          <Card title="Filters" description="Helps shoppers find this product with the category filters.">
            <div className="space-y-5">
              {attrs.map((a) => {
                const vals = p.attributes[a.id] ?? [];
                const setVals = (next: string[]) => set("attributes", { ...p.attributes, [a.id]: next });
                return (
                  <div key={a.id}>
                    <p className="text-sm font-medium">{a.label}</p>
                    {a.type === "select" && a.options.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {a.options.map((o) => (
                          <label key={o} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${vals.includes(o) ? "border-cocoa bg-cocoa text-cream" : "border-champagne bg-cream"}`}>
                            <input type="checkbox" className="sr-only" checked={vals.includes(o)} onChange={(e) => setVals(e.target.checked ? [...vals, o] : vals.filter((x) => x !== o))} />
                            {o}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <input className={inputCls} aria-label={a.label} value={vals.join(", ")} placeholder={a.type === "color" ? "e.g. Rose, Gold" : ""}
                        onChange={(e) => setVals(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card title="Search engines" description="Optional. Leave blank to use the product name and description.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Page title" htmlFor="seo_title" error={fe.seo_title} hint="Up to 70 characters">
              <input id="seo_title" className={inputCls} value={p.seo_title} maxLength={70} onChange={(e) => set("seo_title", e.target.value)} />
            </Field>
            <Field label="Description" htmlFor="seo_description" error={fe.seo_description} hint="Up to 170 characters">
              <input id="seo_description" className={inputCls} value={p.seo_description} maxLength={170} onChange={(e) => set("seo_description", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="Tax (GST)" description="Used on invoices. Prices you enter already include GST.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="GST rate" htmlFor="gst_rate" error={fe.gst_rate}>
              <select id="gst_rate" className={inputCls} value={p.gst_rate} onChange={(e) => set("gst_rate", e.target.value)}>
                <option value="">Store default</option>
                {["0", "3", "5", "12", "18", "28"].map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </Field>
            <Field label="HSN code" htmlFor="hsn" error={fe.hsn} hint="Optional, 4–8 digits (e.g. 5007 silk fabric, 7117 imitation jewellery)">
              <input id="hsn" inputMode="numeric" className={inputCls} value={p.hsn} maxLength={8} onChange={(e) => set("hsn", e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card title="Visibility">
          <Field label="Status" htmlFor="status" error={fe.status}>
            <select id="status" className={inputCls} value={p.status} onChange={(e) => set("status", e.target.value as ProductDraft["status"])}>
              <option value="draft">Draft — not on the store</option>
              <option value="active">Live — on the store</option>
              <option value="archived">Archived — hidden, kept for records</option>
            </select>
          </Field>
          <div className="mt-4 space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-cocoa" checked={p.is_featured} onChange={(e) => set("is_featured", e.target.checked)} /> Featured</label>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 accent-cocoa" checked={p.quote_only} onChange={(e) => set("quote_only", e.target.checked)} />
              <span>Price on request<span className="block text-xs text-taupe">Shows “Enquire on WhatsApp” instead of Add to Cart (e.g. custom printing).</span></span></label>
          </div>
          <div className="mt-5"><SubmitButton busy={Boolean(progress)} pendingText={progress ? "Uploading photos…" : "Saving…"} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-cocoa px-5 text-sm font-medium text-cream hover:bg-cocoa-soft disabled:opacity-60">{p.id ? "Save product" : "Create product"}</SubmitButton></div>
        </Card>

        <Card title="Categories" description="Tick every category it belongs in. The starred one is used for breadcrumbs.">
          {fe.categories && <p className="mb-2 text-sm text-rose">{fe.categories}</p>}
          {p.categories.length > 0 && (
            <p className="mb-3 flex flex-wrap gap-1.5" aria-label="Chosen categories">
              {p.categories.map((c) => (
                <span key={c.id} className="rounded-full bg-lavender px-2.5 py-1 text-xs">
                  {c.id === primaryId && "★ "}{categories.find((x) => x.id === c.id)?.label ?? "…"}
                </span>
              ))}
            </p>
          )}
          <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {categories.map((c) => {
              const on = p.categories.some((x) => x.id === c.id);
              return (
                <li key={c.id} className="flex items-center gap-2 text-sm" style={{ paddingLeft: c.level * 16 }}>
                  <input type="checkbox" id={`cat-${c.id}`} className="size-4 accent-cocoa" checked={on} onChange={(e) => toggleCategory(c.id, e.target.checked)} />
                  <label htmlFor={`cat-${c.id}`} className={`flex-1 ${c.hidden ? "text-taupe" : ""}`}>{c.label}{c.hidden ? " (hidden)" : ""}</label>
                  {on && (
                    <button type="button" aria-label={`Make ${c.label} the main category`} aria-pressed={primaryId === c.id}
                      className={`text-base leading-none ${primaryId === c.id ? "text-rose" : "text-champagne hover:text-taupe"}`}
                      onClick={() => set("categories", p.categories.map((x) => ({ ...x, primary: x.id === c.id })))}>★</button>
                  )}
                </li>
              );
            })}
          </ul>
          <Link href="/admin/categories/new" target="_blank" className="mt-3 inline-block text-xs text-taupe underline">+ New category</Link>
        </Card>

        <Card title="Collections" description="Homepage sections like Bridal or Premium Picks.">
          <ul className="space-y-1.5">
            {collections.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-cocoa" checked={p.collections.includes(c.id)}
                    onChange={(e) => set("collections", e.target.checked ? [...p.collections, c.id] : p.collections.filter((x) => x !== c.id))} />
                  {c.title}
                </label>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </form>
  );
}
