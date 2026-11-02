"use client";

import { useEffect, useState } from "react";
import type { ProductCardData } from "@/lib/types";
import { useWishlist } from "@/components/store/cart-store";
import { ProductGrid } from "@/components/store/ProductCard";
import { EmptyStateClient } from "../cart/EmptyStateClient";

export function WishlistView() {
  const { ids } = useWishlist();
  const [products, setProducts] = useState<ProductCardData[] | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    if (!key) { setProducts([]); return; }
    let live = true;
    fetch(`/api/products?ids=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => live && setProducts(d.products))
      .catch(() => live && setProducts([]));
    return () => { live = false; };
  }, [key]);

  if (products === null) return <p className="text-taupe">Loading your wishlist…</p>;
  if (!products.length) return <EmptyStateClient title="Your wishlist is empty" body="Tap the heart on any product to save it here." />;
  return <ProductGrid products={products} />;
}
