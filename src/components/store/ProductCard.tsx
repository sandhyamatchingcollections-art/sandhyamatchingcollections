"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Heart, ShoppingBag, Check } from "lucide-react";
import type { ProductCardData } from "@/lib/types";
import { discountPercent, formatINR, unitSuffix } from "@/lib/money";
import { PhotoPlaceholder } from "@/components/ui/primitives";
import { useCart, useWishlist } from "./cart-store";

export function ProductCard({ product }: { product: ProductCardData }) {
  const { add } = useCart();
  const wish = useWishlist();
  const [added, setAdded] = useState(false);
  const off = discountPercent(product.price, product.mrp);
  const href = `/p/${product.slug}`;
  const wished = wish.has(product.id);

  return (
    <article className="group flex flex-col">
      <div className="relative overflow-hidden rounded-2xl border border-champagne/70 bg-cream">
        <Link href={href} aria-label={product.name} className="block">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.imageAlt}
              width={600}
              height={750}
              sizes="(min-width:1024px) 22vw, (min-width:640px) 30vw, 46vw"
              className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <PhotoPlaceholder tone={product.tone} label={product.imageAlt} className="aspect-[4/5] w-full" />
          )}
        </Link>
        {off && (
          <span className="absolute left-3 top-3 rounded-full bg-cream/95 px-2.5 py-1 text-[11px] font-semibold text-rose">
            {off}% off
          </span>
        )}
        <button
          type="button"
          onClick={() => wish.toggle(product.id)}
          aria-pressed={wished}
          aria-label={wished ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          className="absolute right-2.5 top-2.5 grid size-10 place-items-center rounded-full bg-cream/90 text-cocoa transition hover:bg-cream"
        >
          <Heart className={`size-[18px] ${wished ? "fill-rose text-rose" : ""}`} strokeWidth={1.6} />
        </button>
      </div>

      <div className="flex flex-1 flex-col pt-3">
        <p className="text-[11px] uppercase tracking-[0.14em] text-taupe">{product.categoryName}</p>
        <Link href={href} className="mt-1 line-clamp-2 text-[15px] leading-snug text-cocoa hover:underline underline-offset-4">
          {product.name}
        </Link>
                <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {off && product.mrp && !product.quoteOnly && <s className="rounded-md bg-mrp-bg px-2 py-0.5 text-sm text-mrp">{formatINR(product.mrp)}</s>}
          <span className={product.quoteOnly ? "font-semibold text-cocoa" : "rounded-md bg-sale-bg px-2 py-0.5 font-semibold text-sale"}>
            {product.quoteOnly ? "Price on request" : formatINR(product.price)}
            {!product.quoteOnly && <span className="ml-0.5 text-xs font-normal">{unitSuffix(product.unit)}</span>}
          </span>
        </p>
        {product.quoteOnly ? (
          <Link href={href} className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full border border-cocoa/25 text-[13px] font-medium text-cocoa transition hover:border-cocoa">
            Price on request
          </Link>
        ) : (product.variantCount ?? 1) > 1 ? (
          // Several colours/sizes: the shopper chooses on the product page.
          <Link href={href} className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full border border-cocoa/25 text-[13px] font-medium text-cocoa transition hover:border-cocoa hover:bg-cocoa hover:text-cream">
            {product.inStock ? "Choose options" : "Out of stock"}
          </Link>
        ) : (
          <button
            type="button"
            disabled={!(product.defaultInStock ?? product.inStock) || !product.variantId}
            onClick={() => {
              add({ variantId: product.variantId!, slug: product.slug, name: product.name }, product.minQty ?? 1);
              setAdded(true);
              setTimeout(() => setAdded(false), 1600);
            }}
            className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-cocoa/25 text-[13px] font-medium text-cocoa transition hover:border-cocoa hover:bg-cocoa hover:text-cream disabled:opacity-50"
          >
            {added ? <Check className="size-4" /> : <ShoppingBag className="size-4" strokeWidth={1.6} />}
            {!(product.defaultInStock ?? product.inStock) ? "Out of stock" : added ? "Added" : "Add to Cart"}
          </button>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
