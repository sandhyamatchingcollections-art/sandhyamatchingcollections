"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-10 rounded-full bg-cocoa px-5 text-sm font-medium text-cream hover:bg-cocoa-soft">
      Print / Save as PDF
    </button>
  );
}
