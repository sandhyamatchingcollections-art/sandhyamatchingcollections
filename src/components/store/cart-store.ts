"use client";

/**
 * Cart and wishlist on this device (localStorage), shared by every component.
 * The cart holds only variant ids and quantities: prices, stock and quantity
 * rules always come from the server (POST /api/cart/quote). For signed-in
 * customers CartSync also saves it to their account.
 */
import { useSyncExternalStore } from "react";

export type CartLine = { variantId: string; qty: number; slug: string; name: string };

const CART_KEY = "smc.cart.v2";
const WISH_KEY = "smc.wishlist.v1";
const EVT = "smc:store";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: cart lives for this page only */
  }
  window.dispatchEvent(new Event(EVT));
}

export function subscribeStore(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

// Snapshots must be referentially stable between changes.
let cartCache = { raw: "", value: [] as CartLine[] };
let wishCache = { raw: "", value: [] as string[] };
function sanitize(lines: unknown): CartLine[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .filter((l): l is CartLine => !!l && typeof l.variantId === "string" && typeof l.qty === "number" && l.qty > 0)
    .slice(0, 100);
}
export function cartSnapshot(): CartLine[] {
  let raw = "[]";
  try { raw = localStorage.getItem(CART_KEY) ?? "[]"; } catch {}
  if (raw !== cartCache.raw) cartCache = { raw, value: sanitize(read<unknown>(CART_KEY, [])) };
  return cartCache.value;
}
function wishSnapshot(): string[] {
  let raw = "[]";
  try { raw = localStorage.getItem(WISH_KEY) ?? "[]"; } catch {}
  if (raw !== wishCache.raw) wishCache = { raw, value: read<string[]>(WISH_KEY, []) };
  return wishCache.value;
}
const EMPTY_CART: CartLine[] = [];
const EMPTY_WISH: string[] = [];

export const cartActions = {
  add(line: Omit<CartLine, "qty">, qty: number) {
    const cur = cartSnapshot();
    const found = cur.find((l) => l.variantId === line.variantId);
    const q = Math.round(qty * 1000) / 1000;
    write(CART_KEY, found
      ? cur.map((l) => (l === found ? { ...l, qty: Math.round((l.qty + q) * 1000) / 1000 } : l))
      : [...cur, { ...line, qty: q }]);
  },
  setQty(variantId: string, qty: number) {
    write(CART_KEY, cartSnapshot().map((l) => (l.variantId === variantId ? { ...l, qty: Math.round(qty * 1000) / 1000 } : l)));
  },
  remove(variantId: string) {
    write(CART_KEY, cartSnapshot().filter((l) => l.variantId !== variantId));
  },
  replace(lines: CartLine[]) {
    write(CART_KEY, sanitize(lines));
  },
  clear() {
    write(CART_KEY, []);
  },
};

export function useCart() {
  const lines = useSyncExternalStore(subscribeStore, cartSnapshot, () => EMPTY_CART);
  return { lines, count: lines.length, ...cartActions };
}

export function useWishlist() {
  const ids = useSyncExternalStore(subscribeStore, wishSnapshot, () => EMPTY_WISH);
  return {
    ids,
    has: (id: string) => ids.includes(id),
    toggle(id: string) {
      const cur = read<string[]>(WISH_KEY, []);
      write(WISH_KEY, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    },
    clear() { write(WISH_KEY, []); },
  };
}
