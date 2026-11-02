"use client";

import { useEffect, useState } from "react";
import type { ProductCardData } from "@/lib/types";
import { ProductGrid } from "@/components/store/ProductCard";

const KEY = "smc.recently-viewed.v1";

/** Remembers this product on this device and shows the others viewed recently. */
export function RecentlyViewed({ productId }: { productId: string }) {
  const [items, setItems] = useState<ProductCardData[]>([]);
  useEffect(() => {
    let list: string[] = [];
    try { list = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch {}
    const others = list.filter((x) => x !== productId).slice(0, 4);
    try { localStorage.setItem(KEY, JSON.stringify([productId, ...list.filter((x) => x !== productId)].slice(0, 12))); } catch {}
    if (!others.length) return;
    fetch(`/api/products?ids=${others.join(",")}`).then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d: { products: ProductCardData[] }) => setItems(others.map((id) => d.products.find((p) => p.id === id)).filter(Boolean) as ProductCardData[]))
      .catch(() => {});
  }, [productId]);
  if (!items.length) return null;
  return (
    <section className="mt-16">
      <h2 className="text-3xl font-medium">Recently viewed</h2>
      <div className="mt-6"><ProductGrid products={items} /></div>
    </section>
  );
}
