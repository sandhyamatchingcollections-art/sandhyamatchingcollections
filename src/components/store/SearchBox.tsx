"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Search, X } from "lucide-react";
import { formatINR, unitSuffix } from "@/lib/money";
import type { SellingUnit } from "@/lib/types";

type Suggest = {
  products: { slug: string; name: string; price: number; unit: SellingUnit; imageUrl: string | null; quoteOnly: boolean }[];
  categories: { slug: string; name: string }[];
};
const RECENT_KEY = "smc.recent-searches.v1";

function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]; } catch { return []; }
}
export function rememberSearch(q: string) {
  const t = q.trim();
  if (!t) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([t, ...readRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6))); } catch {}
}

/** Search field with suggestions (products + categories) and recent searches. Works as a plain form without JS. */
export function SearchBox({ defaultValue = "", autoFocus = false, compact = false }: { defaultValue?: string; autoFocus?: boolean; compact?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggest>({ products: [], categories: [] });
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setData({ products: [], categories: [] }); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search/suggest?q=${encodeURIComponent(t)}`, { signal: ctrl.signal })
        .then((r) => r.json()).then((d: Suggest) => { setData(d); setActive(-1); }).catch(() => {});
    }, 180);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showRecent = q.trim().length < 2 && recent.length > 0;
  const items: { href: string; label: string; kind: "recent" | "product" | "category" }[] = showRecent
    ? recent.map((r) => ({ href: `/search?q=${encodeURIComponent(r)}`, label: r, kind: "recent" }))
    : [
        ...data.products.map((p) => ({ href: `/p/${p.slug}`, label: p.name, kind: "product" as const })),
        ...data.categories.map((c) => ({ href: `/c/${c.slug}`, label: c.name, kind: "category" as const })),
      ];

  function go(href: string, term?: string) {
    if (term) rememberSearch(term);
    setOpen(false);
    router.push(href);
  }

  return (
    <div ref={box} className="relative w-full">
      <form action="/search" role="search" onSubmit={(e) => {
        e.preventDefault();
        if (active >= 0 && items[active]) return go(items[active].href, items[active].kind === "recent" ? items[active].label : undefined);
        if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`, q);
      }}>
        <label htmlFor={`${id}-q`} className="sr-only">Search products</label>
        <input
          id={`${id}-q`} name="q" type="search" value={q} autoFocus={autoFocus} autoComplete="off" maxLength={80}
          placeholder="Search sarees, fabrics, jewellery…"
          role="combobox" aria-expanded={open && items.length > 0} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          onFocus={() => { setRecent(readRecent()); setOpen(true); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
            else if (e.key === "Escape") setOpen(false);
          }}
          className={`w-full rounded-full border border-champagne bg-cream pl-11 pr-10 text-sm text-cocoa placeholder:text-taupe/80 focus:border-cocoa/40 focus:outline-none ${compact ? "h-11" : "h-12 text-[15px]"}`}
        />
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-taupe" />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => { setQ(""); setActive(-1); }}
            className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-taupe hover:bg-ivory"><X className="size-4" /></button>
        )}
      </form>

      {open && items.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-champagne bg-cream py-2 shadow-[0_18px_40px_-20px_rgb(62_44_37/0.35)]">
          {showRecent && <li className="px-4 pb-1 pt-1 text-[11px] uppercase tracking-wide text-taupe" role="presentation">Recent searches</li>}
          {items.map((it, i) => {
            const prod = it.kind === "product" ? data.products[i] : undefined;
            return (
              <li key={`${it.kind}-${it.href}`} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(it.href, it.kind === "recent" ? it.label : undefined)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === active ? "bg-blush/60" : "hover:bg-ivory"}`}>
                  {it.kind === "recent" && <Clock className="size-4 text-taupe" />}
                  {it.kind === "product" && (prod?.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={prod.imageUrl} alt="" className="size-9 rounded-lg object-cover" />
                    : <span className="size-9 shrink-0 rounded-lg bg-blush" />)}
                  {it.kind === "category" && <span className="rounded-full bg-lavender px-2 py-0.5 text-[10px] uppercase tracking-wide">Category</span>}
                  <span className="flex-1 truncate">{it.label}</span>
                  {prod && <span className="text-xs text-taupe">{prod.quoteOnly ? "On request" : `${formatINR(prod.price)}${unitSuffix(prod.unit) ? ` ${unitSuffix(prod.unit)}` : ""}`}</span>}
                </button>
              </li>
            );
          })}
          {!showRecent && q.trim().length >= 2 && (
            <li role="presentation" className="border-t border-champagne/70 px-4 pt-2">
              <button type="button" onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`, q)} className="text-sm text-cocoa underline-offset-4 hover:underline">
                See all results for “{q.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
