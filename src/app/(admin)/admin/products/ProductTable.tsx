"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, EmptyRow, btnSmall, inputCls, td, th } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { formatINR } from "@/lib/money";
import type { AdminProductRow } from "@/server/admin/catalog";
import { bulkProducts } from "./actions";

const unitShort: Record<string, string> = { metre: "/ m", yard: "/ yd", set: "/ set" };

export function ProductTable({ rows, categories, back, empty }: {
  rows: AdminProductRow[]; categories: { id: string; label: string }[]; back: string; empty: string;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [action, setAction] = useState("status");
  const all = rows.length > 0 && picked.length === rows.length;

  return (
    <form action={bulkProducts}>
      <input type="hidden" name="back" value={back} />
      {picked.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}

      {picked.length > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-end gap-3 rounded-2xl border border-cocoa/20 bg-lavender p-3 shadow-sm">
          <p className="self-center text-sm font-medium">{picked.length} selected</p>
          <label className="text-xs">Change
            <select name="action" value={action} onChange={(e) => setAction(e.target.value)} className={`${inputCls} h-10`}>
              <option value="status">Status</option>
              <option value="add_category">Add to category</option>
              <option value="remove_category">Remove from category</option>
              <option value="price_percent">Prices by %</option>
            </select>
          </label>
          {action === "status" && (
            <label className="text-xs">To
              <select name="value" className={`${inputCls} h-10`} defaultValue="active">
                <option value="active">Live</option><option value="draft">Draft</option><option value="archived">Archived</option>
              </select>
            </label>
          )}
          {(action === "add_category" || action === "remove_category") && (
            <label className="text-xs">Category
              <select name="value" className={`${inputCls} h-10`} required defaultValue="">
                <option value="" disabled>Choose…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          )}
          {action === "price_percent" && (
            <label className="text-xs">Percent (e.g. 10 or -15)
              <input name="value" inputMode="decimal" required className={`${inputCls} h-10 w-32`} placeholder="10" />
            </label>
          )}
          <SubmitButton className={`${btnSmall} h-10 bg-cocoa px-4 text-cream hover:bg-cocoa-soft`} pendingText="Applying…"
            confirm={action === "price_percent" ? "Change selling price and MRP of all selected products (rounded to whole rupees)?" : undefined}>
            Apply
          </SubmitButton>
          <button type="button" className="self-center text-xs underline" onClick={() => setPicked([])}>Clear</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-champagne bg-cream">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-champagne">
            <tr>
              <th className={`${th} w-10`}>
                <input type="checkbox" aria-label="Select all on this page" className="size-4 accent-cocoa" checked={all}
                  onChange={(e) => setPicked(e.target.checked ? rows.map((r) => r.id) : [])} />
              </th>
              <th className={th}>Product</th><th className={th}>Category</th><th className={th}>Price</th>
              <th className={th}>Stock</th><th className={th}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-champagne/70">
            {rows.length === 0 && <EmptyRow cols={6}>{empty}</EmptyRow>}
            {rows.map((r) => (
              <tr key={r.id} className={picked.includes(r.id) ? "bg-lavender/30" : "hover:bg-ivory"}>
                <td className={td}>
                  <input type="checkbox" aria-label={`Select ${r.name}`} className="size-4 accent-cocoa" checked={picked.includes(r.id)}
                    onChange={(e) => setPicked((x) => (e.target.checked ? [...x, r.id] : x.filter((y) => y !== r.id)))} />
                </td>
                <td className={td}>
                  <Link href={`/admin/products/${r.id}`} className="flex items-center gap-3 hover:underline">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.image_url ? <img src={r.image_url} alt="" className="size-11 rounded-lg object-cover" /> : <span className="size-11 shrink-0 rounded-lg bg-blush" />}
                    <span>
                      <span className="font-medium">{r.name}</span>
                      <span className="block text-xs text-taupe">{r.sku}{r.variant_count > 1 ? ` · ${r.variant_count} variants` : ""}</span>
                    </span>
                  </Link>
                </td>
                <td className={`${td} text-taupe`}>{r.category_name ?? "—"}</td>
                <td className={td}>
                  {r.price != null ? <>{formatINR(r.price)}<span className="text-xs text-taupe"> {unitShort[r.unit ?? ""] ?? ""}</span></> : "—"}
                  {r.mrp != null && r.price != null && r.mrp > r.price && <s className="block text-xs text-taupe">{formatINR(r.mrp)}</s>}
                </td>
                <td className={td}>{r.available == null ? <span className="text-taupe">Not tracked</span> : Number(r.available) <= 0 ? <Badge status="out" /> : Number(r.available)}</td>
                <td className={td}><Badge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
