"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card, Notice, btnPrimary, btnSecondary, td, th } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { importStep, type ImportState } from "./actions";

const actionLabel = { create: "New", update: "Update", skip: "Skip (exists)", error: "Error" };
const actionTone = { create: "bg-sage text-sage-deep", update: "bg-lavender", skip: "bg-champagne/70", error: "bg-blush text-rose" };

export function ImportFlow() {
  const [state, action] = useActionState<ImportState, FormData>(importStep, { stage: "upload" });

  if (state.stage === "done" && state.result) {
    const r = state.result;
    return (
      <Card>
        <Notice tone="success">Import complete: {r.created} new, {r.updated} updated, {r.skipped} skipped.</Notice>
        <p className="mt-4 text-sm text-taupe">New products were imported with the status in your file (Draft if blank). Add photos from each product page.</p>
        <div className="mt-5 flex gap-3">
          <Link href="/admin/products?status=draft" className={btnPrimary}>Review imported drafts</Link>
          <button type="button" className={btnSecondary} onClick={() => window.location.assign("/admin/products/import")}>Import another file</button>
        </div>
      </Card>
    );
  }

  if (state.stage === "preview" && state.rows) {
    const rows = state.rows;
    const count = (a: string) => rows.filter((r) => r.action === a).length;
    const errors = count("error");
    return (
      <div className="space-y-4">
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <Notice tone={errors ? "error" : "info"}>
          {rows.length} rows: {count("create")} new, {count("update")} to update, {count("skip")} to skip
          {errors ? `, ${errors} with errors. Fix them in your file and upload again — nothing is imported while errors remain.` : ". Nothing has been saved yet."}
        </Notice>
        <div className="max-h-[60vh] overflow-auto rounded-2xl border border-champagne bg-cream">
          <table className="w-full min-w-[720px]">
            <thead className="sticky top-0 border-b border-champagne bg-cream">
              <tr><th className={th}>Line</th><th className={th}>SKU</th><th className={th}>Name</th><th className={th}>Category</th><th className={th}>Price ₹</th><th className={th}>Result</th></tr>
            </thead>
            <tbody className="divide-y divide-champagne/70">
              {rows.map((r) => (
                <tr key={r.line} className={r.action === "error" ? "bg-blush/30" : ""}>
                  <td className={`${td} text-taupe`}>{r.line}</td>
                  <td className={td}>{r.sku}</td>
                  <td className={td}>{r.name}</td>
                  <td className={td}>{r.category}</td>
                  <td className={td}>{r.price}</td>
                  <td className={td}>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${actionTone[r.action]}`}>{actionLabel[r.action]}</span>
                    {r.errors.map((e) => <span key={e} className="mt-1 block text-xs text-rose">{e}</span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3">
          {!errors && (
            <form action={action}>
              <input type="hidden" name="step" value="import" />
              <input type="hidden" name="csv" value={state.csv} />
              <input type="hidden" name="update_existing" value={String(state.updateExisting)} />
              <SubmitButton pendingText="Importing…">Import {count("create") + count("update")} products</SubmitButton>
            </form>
          )}
          {/* A fresh page load clears the preview instantly, no server round-trip needed. */}
          <button type="button" className={btnSecondary} onClick={() => window.location.assign("/admin/products/import")}>Start over</button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      {state.error && <div className="mb-4"><Notice tone="error">{state.error}</Notice></div>}
      <form action={action} className="space-y-5">
        <input type="hidden" name="step" value="preview" />
        <label className="block text-sm font-medium">CSV file
          <input type="file" name="file" accept=".csv,text/csv" required className="mt-2 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-cocoa file:px-4 file:py-2 file:text-cream" />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="update_existing" className="mt-0.5 size-4 accent-cocoa" />
          <span>Update products whose SKU already exists<span className="block text-xs text-taupe">Updates price, MRP and stock only. Otherwise those rows are skipped.</span></span>
        </label>
        <SubmitButton pendingText="Checking…">Check file</SubmitButton>
      </form>
    </Card>
  );
}
