"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Heart, ShoppingBag } from "lucide-react";
import type { VariantDetail } from "@/lib/types";
import { discountPercent, formatINR, unitSuffix } from "@/lib/money";
import { useCart, useWishlist } from "@/components/store/cart-store";
import { QtyStepper } from "@/components/store/QtyStepper";

const OPTION_LABEL: Record<string, string> = { color: "Colour", size: "Size" };

/** Colour/size choice, price for the chosen variant, stock, quantity rules and Add to Cart / Buy now. */
export function BuyBox({ productId, slug, name, variants }: { productId: string; slug: string; name: string; variants: VariantDetail[] }) {
  const router = useRouter();
  const { add } = useCart();
  const wish = useWishlist();
  const keys = useMemo(() => [...new Set(variants.flatMap((v) => Object.keys(v.options ?? {})))].filter((k) => k in OPTION_LABEL), [variants]);
  const initial = variants.find((v) => v.is_default) ?? variants[0];
  const [sel, setSel] = useState<Record<string, string>>(initial?.options ?? {});
  const [variantId, setVariantId] = useState(initial?.id);
  const [added, setAdded] = useState(false);

  const variant = variants.find((v) => v.id === variantId) ?? initial;
  const inStock = (v: VariantDetail) => v.available == null || v.available >= v.min_qty;
  const maxQty = variant ? [variant.max_qty, variant.available].filter((x): x is number => x != null).reduce((a, b) => Math.min(a, b), Infinity) : Infinity;
  const [qty, setQty] = useState(initial?.min_qty ?? 1);

  if (!variant) return null;
  const off = discountPercent(variant.price, variant.mrp);
  const available = inStock(variant);
  const isLength = variant.unit === "metre" || variant.unit === "yard";

  function choose(key: string, value: string) {
    const next = { ...sel, [key]: value };
    // Prefer an exact match; otherwise the first variant with this value (keeps the choice valid).
    const match = variants.find((v) => keys.every((k) => v.options?.[k] === next[k])) ?? variants.find((v) => v.options?.[key] === value);
    if (match) { setSel(match.options ?? {}); setVariantId(match.id); setQty(match.min_qty); }
  }

  function addToCart(thenCart: boolean) {
    add({ variantId: variant.id, slug, name }, qty);
    if (thenCart) { router.push("/cart"); return; }
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div>
            <p className="mt-5 flex flex-wrap items-baseline gap-3">
        {off && variant.mrp && (
          <span className="text-sm text-taupe">Market price <s className="ml-1 rounded-lg bg-mrp-bg px-3 py-1 text-base text-mrp">{formatINR(variant.mrp)}</s></span>
        )}
        <span className="rounded-lg bg-sale-bg px-3 py-1 text-2xl font-semibold text-sale" data-testid="price">{formatINR(variant.price)}<span className="ml-1 text-sm font-normal">{unitSuffix(variant.unit)}</span></span>
        {off && variant.mrp && <span className="text-sm font-semibold text-sale">{off}% off</span>}
      </p>
      <p className="mt-1 text-xs text-taupe">Inclusive of all taxes</p>

      {keys.map((k) => {
        const values = [...new Set(variants.map((v) => v.options?.[k]).filter(Boolean) as string[])];
        return (
          <fieldset key={k} className="mt-6">
            <legend className="text-sm text-taupe">{OPTION_LABEL[k]}: <span className="font-medium text-cocoa">{sel[k]}</span></legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {values.map((val) => {
                const candidates = variants.filter((v) => v.options?.[k] === val && keys.every((o) => o === k || !sel[o] || v.options?.[o] === sel[o]));
                const anyStock = (candidates.length ? candidates : variants.filter((v) => v.options?.[k] === val)).some(inStock);
                const on = sel[k] === val;
                return (
                  <button key={val} type="button" onClick={() => choose(k, val)} aria-pressed={on}
                    className={`min-h-11 rounded-full border px-4 text-sm transition ${on ? "border-cocoa bg-cocoa text-cream" : "border-champagne bg-cream hover:border-cocoa/50"} ${anyStock ? "" : "text-taupe line-through decoration-1"}`}>
                    {val}{anyStock ? "" : <span className="sr-only"> (out of stock)</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      {keys.length === 0 && variants.length > 1 && (
        <fieldset className="mt-6">
          <legend className="text-sm text-taupe">Option</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {variants.map((v) => (
              <button key={v.id} type="button" aria-pressed={v.id === variant.id} onClick={() => { setVariantId(v.id); setQty(v.min_qty); }}
                className={`min-h-11 rounded-full border px-4 text-sm ${v.id === variant.id ? "border-cocoa bg-cocoa text-cream" : "border-champagne bg-cream"}`}>{v.title}</button>
            ))}
          </div>
        </fieldset>
      )}

      <p className={`mt-5 text-sm font-medium ${available ? "text-sage-deep" : "text-rose"}`} role="status">
        {!available ? "Out of stock" : variant.available != null && variant.available <= 5 ? `Only ${variant.available}${isLength ? (variant.unit === "metre" ? " m" : " yd") : ""} left` : "In stock"}
      </p>

      {available && (
        <div className="mt-4">
          <span className="text-sm text-taupe">Quantity{isLength ? ` (${variant.unit}s — from ${variant.min_qty}, in steps of ${variant.qty_step})` : ""}</span>
          <div className="mt-2"><QtyStepper label="quantity" value={qty} min={variant.min_qty} step={variant.qty_step} max={maxQty === Infinity ? null : maxQty} unit={variant.unit} onChange={setQty} /></div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={!available} onClick={() => addToCart(false)}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-cocoa px-5 sm:px-8 text-sm font-medium text-cream hover:bg-cocoa-soft disabled:opacity-40 sm:flex-none">
          {added ? <><Check className="size-4" /> Added to cart</> : <><ShoppingBag className="size-4" /> Add to Cart</>}
        </button>
        <button type="button" disabled={!available} onClick={() => addToCart(true)}
          className="inline-flex min-h-12 flex-1 items-center justify-center whitespace-nowrap rounded-full border border-cocoa px-5 sm:px-8 text-sm font-medium text-cocoa hover:bg-cream disabled:opacity-40 sm:flex-none">
          Buy now
        </button>
        <button type="button" aria-pressed={wish.has(productId)} onClick={() => wish.toggle(productId)} aria-label={wish.has(productId) ? "Remove from wishlist" : "Add to wishlist"}
          className="grid size-12 shrink-0 place-items-center rounded-full border border-champagne bg-cream">
          <Heart className={`size-5 ${wish.has(productId) ? "fill-rose text-rose" : ""}`} strokeWidth={1.6} />
        </button>
      </div>
      <p className="mt-2 text-xs text-taupe">SKU {variant.sku}</p>
    </div>
  );
}
