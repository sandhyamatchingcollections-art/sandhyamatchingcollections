"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Trash2 } from "lucide-react";
import { useCart } from "@/components/store/cart-store";
import { QtyStepper } from "@/components/store/QtyStepper";
import { PhotoPlaceholder } from "@/components/ui/primitives";
import { formatINR, unitSuffix, whatsappLink } from "@/lib/money";
import type { CartQuote, QuotedLine } from "@/lib/types";
import { EmptyStateClient } from "./EmptyStateClient";

function omit(o: Record<string, string>, k: string) { const c = { ...o }; delete c[k]; return c; }

/** The most that can be ordered: the per-order limit or the stock, whichever is lower (null = no limit). */
function maxFor(s: QuotedLine): number | null {
  const limits = [s.max_qty, s.available].filter((x): x is number => x != null);
  return limits.length ? Math.min(...limits) : null;
}

/**
 * The cart, always shown as the server prices it. When the server changes a
 * line (sold out, quantity limits, price changes) the device's cart is updated
 * to match and the reason is shown.
 */
export function CartView({ whatsapp, storeName }: { whatsapp: string | null; storeName: string }) {
  const { lines, setQty, remove, replace } = useCart();
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const key = JSON.stringify(lines.map((l) => [l.variantId, l.qty]));

  useEffect(() => {
    if (!lines.length) { setQuote({ lines: [], subtotal: 0 }); return; }
    let live = true;
    fetch("/api/cart/quote", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ lines: lines.map((l) => ({ variant_id: l.variantId, qty: l.qty })) }),
    })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? "Couldn't check the cart"); return r.json() as Promise<CartQuote>; })
      .then((q) => {
        if (!live) return;
        setError("");
        setQuote(q);
        // Bring the device's cart in line with what can actually be bought, keeping the reason visible.
        const msgs: Record<string, string> = {};
        let changed = false;
        const next = lines.flatMap((l) => {
          const s = q.lines.find((x) => x.variant_id === l.variantId);
          if (!s) return [l];
          if (s.message) msgs[l.variantId] = s.message;
          if (s.status === "removed") { changed = true; msgs[l.variantId] = `${s.name ?? l.name}: ${s.message}`; return []; }
          if (s.status === "adjusted" && s.qty !== l.qty) { changed = true; return [{ ...l, qty: s.qty }]; }
          return [l];
        });
        setNotes((n) => ({ ...n, ...msgs }));
        if (changed) replace(next);
      })
      .catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // A server note stays until the shopper changes that line themselves.
  const change = (id: string, n: number) => { setNotes((n) => omit(n, id)); setQty(id, n); };
  const buyable = useMemo(() => (quote?.lines ?? []).filter((l) => l.status === "ok" || l.status === "adjusted"), [quote]);
  const removedNotes = Object.entries(notes).filter(([id]) => !lines.some((l) => l.variantId === id)).map(([, m]) => m);

  if (!lines.length) {
    return (
      <>
        {removedNotes.map((m) => <p key={m} role="status" className="mb-4 rounded-xl bg-blush px-4 py-3 text-sm">{m}</p>)}
        <EmptyStateClient />
      </>
    );
  }

  const waText = [
    `Hi ${storeName}, I'd like to order:`,
    ...buyable.map((l) => `• ${l.qty}${l.unit === "metre" ? " m" : l.unit === "yard" ? " yd" : " ×"} ${l.name}${l.title && l.title !== "Default" ? ` (${l.title})` : ""} — ${formatINR(l.line_total ?? 0)} [${l.sku}]`),
    `Subtotal: ${formatINR(buyable.reduce((s, l) => s + (l.line_total ?? 0), 0))}`,
  ].join("\n");

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        {error && <p role="alert" className="mb-4 rounded-xl bg-blush px-4 py-3 text-sm">{error}</p>}
        {removedNotes.map((m) => <p key={m} role="status" className="mb-4 rounded-xl bg-blush px-4 py-3 text-sm">{m}</p>)}
        <ul className="divide-y divide-champagne rounded-3xl border border-champagne bg-cream">
          {lines.map((l) => {
            const s: QuotedLine | undefined = quote?.lines.find((x) => x.variant_id === l.variantId);
            const unavailable = s?.status === "unavailable";
            return (
              <li key={l.variantId} className="flex gap-4 p-4 sm:p-5">
                <Link href={`/p/${l.slug}`} className="shrink-0">
                  {s?.image_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={s.image_url} alt="" className="size-20 rounded-xl object-cover sm:size-24" />
                    : <PhotoPlaceholder tone="blush" motif="none" label="" className="size-20 rounded-xl sm:size-24" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/p/${l.slug}`} className="font-medium text-cocoa hover:underline">{s?.name ?? l.name}</Link>
                      {s?.title && s.title !== "Default" && <p className="text-sm text-taupe">{s.title}</p>}
                      {s?.price != null && (
                                                <p className="mt-0.5 text-sm text-taupe">
                          {s.mrp != null && s.mrp > s.price && <s className="mr-2 rounded-md bg-mrp-bg px-2 py-0.5 text-mrp">{formatINR(s.mrp)}</s>}
                          <span className="rounded-md bg-sale-bg px-2 py-0.5 font-medium text-sale">{formatINR(s.price)}{unitSuffix(s.unit ?? "piece") && ` ${unitSuffix(s.unit ?? "piece")}`}</span>
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 font-semibold">{s?.line_total != null && !unavailable ? formatINR(s.line_total) : ""}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {s && s.min_qty != null && !unavailable ? (
                      <QtyStepper size="sm" label={`quantity of ${s.name}`} value={l.qty} min={s.min_qty} step={s.qty_step ?? 1}
                        max={maxFor(s)} unit={s.unit} onChange={(n) => change(l.variantId, n)} />
                    ) : unavailable ? <span className="rounded-full bg-blush px-3 py-1 text-xs font-medium text-rose">Out of stock</span> : null}
                    <button type="button" onClick={() => { setNotes((n) => omit(n, l.variantId)); remove(l.variantId); }} className="inline-flex items-center gap-1 text-xs text-taupe hover:text-rose" aria-label={`Remove ${s?.name ?? l.name}`}>
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  </div>
                  {notes[l.variantId] && <p role="status" className="mt-2 text-xs text-rose">{notes[l.variantId]}</p>}
                </div>
              </li>
            );
          })}
        </ul>
        <Link href="/products" className="mt-4 inline-block text-sm text-taupe underline-offset-4 hover:underline">← Continue shopping</Link>
      </div>

      <aside className="h-fit rounded-3xl bg-blush/50 p-6 lg:sticky lg:top-40">
        <h2 className="text-2xl font-medium">Order summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt>Subtotal ({buyable.length} item{buyable.length === 1 ? "" : "s"})</dt><dd className="font-semibold">{quote ? formatINR(buyable.reduce((s, l) => s + (l.line_total ?? 0), 0)) : "…"}</dd></div>
          <div className="flex justify-between text-taupe"><dt>Shipping</dt><dd>At checkout</dd></div>
        </dl>
        <p className="mt-2 text-xs text-taupe">Prices include GST. Shipping is added at checkout.</p>
        <Link href="/checkout" aria-disabled={buyable.length === 0}
          className={`mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-cocoa text-sm font-medium text-cream hover:bg-cocoa-soft ${buyable.length === 0 ? "pointer-events-none opacity-40" : ""}`}>
          Checkout
        </Link>
        {whatsapp && buyable.length > 0 && (
          <a href={whatsappLink(whatsapp, waText)} target="_blank" rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-sage-deep text-sm font-medium text-cream">
            <MessageCircle className="size-4" /> Order on WhatsApp
          </a>
        )}
      </aside>
    </div>
  );
}
