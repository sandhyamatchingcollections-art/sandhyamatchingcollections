"use client";

import { useActionState } from "react";
import { inputCls, btnSmall } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { adjustStock, setThreshold, type StockState } from "./actions";

export function StockForm({ variantId, label, compact = false }: { variantId: string; label: string; compact?: boolean }) {
  const [state, action] = useActionState<StockState, FormData>(adjustStock, {});
  return (
    <form action={action} className={compact ? "flex flex-wrap items-center gap-1.5" : "grid gap-3 sm:grid-cols-[140px_120px_1fr_auto] sm:items-end"}>
      <input type="hidden" name="variant_id" value={variantId} />
      <select name="mode" aria-label={`How to change stock for ${label}`} className={`${inputCls} ${compact ? "mt-0 h-9 w-28 text-xs" : ""}`} defaultValue="add">
        <option value="add">Add</option><option value="remove">Remove</option><option value="set">Set to</option>
      </select>
      <input name="amount" inputMode="decimal" required aria-label={`Amount for ${label}`} placeholder="0"
        className={`${inputCls} ${compact ? "mt-0 h-9 w-20 text-xs" : ""}`} />
      {!compact && <input name="note" maxLength={200} placeholder="Note (optional), e.g. new stock arrived" aria-label="Note" className={inputCls} />}
      <SubmitButton className={compact ? `${btnSmall} h-9` : undefined} pendingText="…">Update</SubmitButton>
      <span role="status" className={`w-full text-xs ${state.error ? "text-rose" : "text-sage-deep"}`}>{state.error ?? state.ok ?? ""}</span>
    </form>
  );
}

export function ThresholdForm({ variantId, value }: { variantId: string; value: number }) {
  const [state, action] = useActionState<StockState, FormData>(setThreshold, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="variant_id" value={variantId} />
      <label className="text-sm">Warn me when stock falls to
        <input name="threshold" inputMode="decimal" defaultValue={String(value)} className={`${inputCls} w-32`} />
      </label>
      <SubmitButton>Save</SubmitButton>
      <span role="status" className={`w-full text-xs ${state.error ? "text-rose" : "text-sage-deep"}`}>{state.error ?? state.ok ?? ""}</span>
    </form>
  );
}
