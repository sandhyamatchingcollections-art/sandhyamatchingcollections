"use client";

import { useEffect, useRef } from "react";
import { cartActions, cartSnapshot, subscribeStore, useWishlist, type CartLine } from "./cart-store";
import type { CartQuote } from "@/lib/types";

const toWire = (lines: CartLine[]) => lines.map((l) => ({ variant_id: l.variantId, qty: l.qty }));
const fromQuote = (q: CartQuote): CartLine[] =>
  q.lines.filter((l) => l.status !== "removed" && l.qty > 0 && l.slug)
    .map((l) => ({ variantId: l.variant_id, qty: l.qty, slug: l.slug!, name: l.name! }));

/**
 * Keeps a signed-in customer's cart saved to their account:
 * on arrival it merges the account cart with this device's cart (keeping the
 * larger quantity of each item), then saves every change. After sign-out it
 * clears this device's cart and wishlist.
 */
export function CartSync({ signedIn }: { signedIn: boolean }) {
  const wish = useWishlist();
  const ready = useRef(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("signedout") === "1") {
      cartActions.clear();
      wish.clear();
      url.searchParams.delete("signedout");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fetch("/api/cart", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines: toWire(cartSnapshot()) }) }).catch(() => {});
      }, 700);
    };

    (async () => {
      try {
        const res = await fetch("/api/cart", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const server = fromQuote((await res.json()) as CartQuote);
        const merged = new Map<string, CartLine>();
        for (const l of [...server, ...cartSnapshot()]) {
          const prev = merged.get(l.variantId);
          merged.set(l.variantId, prev ? { ...l, qty: Math.max(prev.qty, l.qty) } : l);
        }
        const q = await fetch("/api/cart/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines: toWire([...merged.values()]) }) });
        if (q.ok && !cancelled) cartActions.replace(fromQuote((await q.json()) as CartQuote));
      } finally {
        if (!cancelled) { ready.current = true; save(); }
      }
    })();

    const unsub = subscribeStore(() => { if (ready.current) save(); });
    return () => { cancelled = true; clearTimeout(timer); unsub(); };
  }, [signedIn]);

  return null;
}
