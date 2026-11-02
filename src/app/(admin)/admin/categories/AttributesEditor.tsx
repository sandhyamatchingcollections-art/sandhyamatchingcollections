"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Notice, btnSmall, inputCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveAttributes, type FormState } from "./actions";
import type { CategoryAttribute } from "@/server/admin/catalog";

type Row = { id?: string; key: string; label: string; type: "select" | "color" | "text"; options: string; is_filterable: boolean };

const toKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "f_$1").slice(0, 40);

export function AttributesEditor({ categoryId, initial }: { categoryId: string; initial: CategoryAttribute[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveAttributes, {});
  const [rows, setRows] = useState<Row[]>(initial.map((a) => ({ ...a, options: a.options.join(", ") })));
  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const payload = JSON.stringify(rows.map((r) => ({
    ...(r.id ? { id: r.id } : {}), key: r.key || toKey(r.label), label: r.label, type: r.type, is_filterable: r.is_filterable,
    options: r.type === "select" ? r.options.split(",").map((o) => o.trim()).filter(Boolean) : [],
  })));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="rows" value={payload} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      {rows.length === 0 && <p className="text-sm text-taupe">No filters yet. Add one such as “Fabric” or “Colour”.</p>}
      {rows.map((r, i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-champagne bg-ivory/60 p-3 sm:grid-cols-[1fr_130px_2fr_auto] sm:items-end">
          <label className="text-xs text-taupe">Label
            <input className={inputCls} value={r.label} maxLength={40} placeholder="Fabric"
              onChange={(e) => update(i, { label: e.target.value, ...(r.id ? {} : { key: toKey(e.target.value) }) })} />
          </label>
          <label className="text-xs text-taupe">Type
            <select className={inputCls} value={r.type} onChange={(e) => update(i, { type: e.target.value as Row["type"] })}>
              <option value="select">Choice list</option><option value="color">Colour</option><option value="text">Free text</option>
            </select>
          </label>
          <label className="text-xs text-taupe">{r.type === "select" ? "Choices (comma separated)" : "Choices"}
            <input className={inputCls} value={r.type === "select" ? r.options : ""} disabled={r.type !== "select"}
              placeholder={r.type === "select" ? "Cotton, Silk, Georgette" : "Typed on each product"} onChange={(e) => update(i, { options: e.target.value })} />
          </label>
          <div className="flex items-center gap-3 pb-1">
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="accent-cocoa" checked={r.is_filterable}
              onChange={(e) => update(i, { is_filterable: e.target.checked })} /> Filter</label>
            <button type="button" className={btnSmall} aria-label={`Remove ${r.label || "filter"}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnSmall} onClick={() => setRows((x) => [...x, { key: "", label: "", type: "select", options: "", is_filterable: true }])}>
          <Plus className="size-3.5" /> Add filter
        </button>
        <SubmitButton>Save filters</SubmitButton>
      </div>
      <p className="text-xs text-taupe">Filters set here also apply to every subcategory. Removing a filter clears it from all products.</p>
    </form>
  );
}
