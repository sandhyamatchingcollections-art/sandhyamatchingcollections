"use client";

import { Minus, Plus } from "lucide-react";

const unitWord = (u?: string) => (u === "metre" ? "m" : u === "yard" ? "yd" : "");
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** Quantity control that only offers allowed amounts: from the minimum, in steps, up to the limit. */
export function QtyStepper({ value, min, step, max, unit, onChange, label, size = "md" }: {
  value: number; min: number; step: number; max: number | null; unit?: string;
  onChange: (n: number) => void; label: string; size?: "sm" | "md";
}) {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const canDec = value - step >= min - 1e-9;
  const canInc = max == null || value + step <= max + 1e-9;
  const cls = size === "sm" ? "size-9" : "size-11";
  return (
    <div className="inline-flex items-center rounded-full border border-champagne bg-cream" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={!canDec} onClick={() => onChange(round(value - step))}
        className={`grid ${cls} place-items-center rounded-full disabled:opacity-30`}><Minus className="size-4" /></button>
      <span aria-live="polite" className="min-w-14 text-center text-sm font-medium">{fmt(value)}{unitWord(unit) && ` ${unitWord(unit)}`}</span>
      <button type="button" aria-label={`Increase ${label}`} disabled={!canInc} onClick={() => onChange(round(value + step))}
        className={`grid ${cls} place-items-center rounded-full disabled:opacity-30`}><Plus className="size-4" /></button>
    </div>
  );
}
