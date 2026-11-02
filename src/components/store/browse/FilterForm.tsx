"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { Facets } from "@/lib/types";

const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

/**
 * A plain GET form, so filtering works even before JavaScript loads and every
 * filtered page has a shareable link. On desktop changes apply immediately;
 * on phones the filters open in a panel with an Apply button.
 */
export function FilterForm({ action, facets, current, hidden, categoryLinks }: {
  action: string;
  facets: Facets;
  current: { attrs: Record<string, string[]>; min?: number; max?: number; inStock: boolean; sort: string };
  hidden: Record<string, string>;
  categoryLinks?: { slug: string; name: string; count: number; href: string }[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    document.addEventListener("filters:open", onOpen);
    return () => document.removeEventListener("filters:open", onOpen);
  }, []);
  const submitIfDesktop = () => { if (isDesktop()) form.current?.requestSubmit(); };

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [open]);

  const rupees = (p?: number | null) => (p == null ? "" : String(Math.floor(p / 100)));
  const hasAnything = facets.attributes.length > 0 || facets.count > 0;

  return (
    <>
      <form id="browse-form" ref={form} action={action} method="get"
        className={open
          ? "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ivory px-5 pb-28 pt-5 lg:static lg:z-auto lg:bg-transparent lg:p-0"
          : "hidden lg:block"}
        aria-label="Filters">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {current.sort && current.sort !== "featured" && <input type="hidden" name="sort" value={current.sort} />}

        <div className="mb-4 flex items-center justify-between lg:hidden">
          <h2 className="text-2xl font-medium">Filters</h2>
          <button type="button" aria-label="Close filters" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-full hover:bg-cream"><X className="size-5" /></button>
        </div>

        {categoryLinks && categoryLinks.length > 1 && (
          <fieldset className="border-b border-champagne pb-5">
            <legend className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-taupe">Category</legend>
            <ul className="space-y-2 text-sm">
              {categoryLinks.slice(0, 10).map((c) => (
                <li key={c.slug}><a href={c.href} className="flex justify-between hover:underline">{c.name}<span className="text-taupe">{c.count}</span></a></li>
              ))}
            </ul>
          </fieldset>
        )}

        <fieldset className="border-b border-champagne py-5 first:pt-0">
          <legend className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-taupe">Price (₹)</legend>
          <div className="flex items-center gap-2">
            <input name="min" inputMode="numeric" pattern="[0-9]*" aria-label="Minimum price in rupees" placeholder={rupees(facets.price.min) || "Min"}
              defaultValue={rupees(current.min)} onBlur={submitIfDesktop} onKeyDown={(e) => e.key === "Enter" && submitIfDesktop()}
              className="h-11 w-full rounded-xl border border-champagne bg-cream px-3 text-sm" />
            <span className="text-taupe">–</span>
            <input name="max" inputMode="numeric" pattern="[0-9]*" aria-label="Maximum price in rupees" placeholder={rupees(facets.price.max) || "Max"}
              defaultValue={rupees(current.max)} onBlur={submitIfDesktop} onKeyDown={(e) => e.key === "Enter" && submitIfDesktop()}
              className="h-11 w-full rounded-xl border border-champagne bg-cream px-3 text-sm" />
          </div>
        </fieldset>

        <fieldset className="border-b border-champagne py-5">
          <legend className="sr-only">Availability</legend>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" name="stock" value="1" defaultChecked={current.inStock} onChange={submitIfDesktop} className="size-4 accent-cocoa" />
            In stock only
          </label>
        </fieldset>

        {facets.attributes.map((a) => (
          <fieldset key={a.key} className="border-b border-champagne py-5">
            <legend className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-taupe">{a.label}</legend>
            <ul className="max-h-60 space-y-2 overflow-y-auto pr-1 text-sm">
              {a.values.map((v) => (
                <li key={v.value}>
                  <label className="flex items-center gap-2.5">
                    <input type="checkbox" name={`a.${a.key}`} value={v.value} onChange={submitIfDesktop}
                      defaultChecked={current.attrs[a.key]?.includes(v.value) ?? false} className="size-4 accent-cocoa" />
                    <span className="flex-1">{v.value}</span><span className="text-xs text-taupe">{v.count}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}

        {!hasAnything && <p className="py-5 text-sm text-taupe">No filters for this list yet.</p>}

        <noscript><button className="mt-5 min-h-11 w-full rounded-full bg-cocoa text-sm text-cream">Apply filters</button></noscript>

        <div className="fixed inset-x-0 bottom-0 flex gap-3 border-t border-champagne bg-ivory p-4 lg:hidden">
          <a href={action + (hidden.q ? `?q=${encodeURIComponent(hidden.q)}` : "")} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-cocoa/25 text-sm">Clear all</a>
          <button className="min-h-12 flex-[2] rounded-full bg-cocoa text-sm font-medium text-cream">Show results</button>
        </div>
      </form>
    </>
  );
}

/** Phone-only button that opens the filter panel. */
export function FilterToggle({ activeCount }: { activeCount: number }) {
  return (
    <button type="button" onClick={() => document.dispatchEvent(new Event("filters:open"))}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-cocoa/25 bg-cream px-4 text-sm lg:hidden">
      <SlidersHorizontal className="size-4" /> Filters{activeCount > 0 && <span className="rounded-full bg-cocoa px-1.5 text-[11px] text-cream">{activeCount}</span>}
    </button>
  );
}

/** Sort dropdown in the toolbar; submits the same filter form so filters are kept. */
export function SortSelect({ value, options }: { value: string; options: readonly { key: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-2 text-sm text-taupe">
      <span className="hidden sm:inline">Sort by</span>
      <select name="sort" form="browse-form" defaultValue={value} aria-label="Sort products"
        onChange={(e) => {
          const f = document.getElementById("browse-form") as HTMLFormElement | null;
          f?.querySelectorAll('input[type="hidden"][name="sort"]').forEach((n) => n.remove());
          if (f) f.requestSubmit(); else e.currentTarget.form?.requestSubmit();
        }}
        className="h-11 rounded-full border border-champagne bg-cream px-4 text-sm text-cocoa">
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </label>
  );
}
