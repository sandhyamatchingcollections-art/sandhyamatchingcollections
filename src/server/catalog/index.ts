/**
 * Catalogue read API used by every storefront page. All reads come from the
 * database with visitor rights (Row Level Security hides drafts, hidden
 * categories, expired offers and stock numbers).
 */
import "server-only";
import { unstable_cache } from "next/cache";
import type { Category } from "@/lib/types";
import { supabaseConfigured } from "@/lib/supabase/env";
import * as live from "./supabase-source";

function ensureDb() {
  if (!supabaseConfigured) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.");
  }
}

// Shared storefront data (settings, menu, homepage, product lists) is the same for every visitor,
// so it is kept for a short time instead of being fetched from Supabase on every tap. Any admin
// save clears it at once (see server/revalidate.ts). Carts, checkout and orders are never cached.
const TTL = Number(process.env.STORE_CACHE_SECONDS ?? 60);
const STOCK_TTL = Math.min(TTL, 30); // product pages show stock, so refresh those a little sooner
function cached<A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>, ttl = TTL): (...a: A) => Promise<R> {
  if (!(ttl > 0)) return fn;
  const c = unstable_cache(fn, ["store", name], { revalidate: ttl, tags: ["store"] });
  return (...a: A) => c(...a);
}

function buildTree(all: Category[]): Category[] {
  const active = all.filter((c) => c.isActive);
  const byParent = new Map<string | null, Category[]>();
  for (const c of active) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  const build = (parentId: string | null): Category[] =>
    (byParent.get(parentId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ ...c, children: build(c.id) }));
  return build(null);
}

const live_getCategories = cached("categories", () => (ensureDb(), live.getCategories()));

export const getStoreSettings = cached("settings", () => (ensureDb(), live.getStoreSettings()));
export const getHomeSections = cached("home", () => (ensureDb(), live.getHomeSections()));
export const getActivePromotions = cached("promotions", () => (ensureDb(), live.getActivePromotions()));
export const getNewArrivals = cached("new", (limit: number) => (ensureDb(), live.getNewArrivals(limit)), STOCK_TTL);
export const getBestsellers = cached("best", (limit: number) => (ensureDb(), live.getBestsellers(limit)), STOCK_TTL);
export const getProductBySlug = (slug: string) => (ensureDb(), live.getProductBySlug(slug));
export const getProductsByIds = (ids: string[]) => (ensureDb(), live.getProductsByIds(ids));
export const browse = cached("browse", (...a: Parameters<typeof live.browse>) => (ensureDb(), live.browse(...a)), STOCK_TTL);
export const facets = cached("facets", (...a: Parameters<typeof live.facets>) => (ensureDb(), live.facets(...a)), STOCK_TTL);
export const suggestions = cached("suggest", (term: string) => (ensureDb(), live.suggestions(term)), STOCK_TTL);
export const productDetail = cached("product", (slug: string) => (ensureDb(), live.productDetail(slug)), STOCK_TTL);
export const relatedProducts = cached("related", (id: string, limit?: number) => (ensureDb(), live.relatedProducts(id, limit)), STOCK_TTL);
export const quoteCart = (...a: Parameters<typeof live.quoteCart>) => (ensureDb(), live.quoteCart(...a)); // always live

const collectionProducts = cached("collection", (slug: string, limit: number) => (ensureDb(), live.getCollectionProducts(slug, limit)), STOCK_TTL);
export async function getCollectionProducts(slug: string, limit = 48) {
  if (slug === "new-arrivals") return getNewArrivals(limit);
  return collectionProducts(slug, limit);
}

/** Active categories as a sorted tree. */
export async function getCategoryTree(): Promise<Category[]> {
  return buildTree(await live_getCategories());
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return (await live_getCategories()).find((c) => c.slug === slug && c.isActive) ?? null;
}
export const getBanners = cached("banners", () => (ensureDb(), live.getBanners()));
export const getContentPage = cached("page", (slug: string) => (ensureDb(), live.getContentPage(slug)));
export const getProductReviews = cached("reviews", (id: string) => (ensureDb(), live.getProductReviews(id)));
export const getSitemapEntries = cached("sitemap", () => (ensureDb(), live.getSitemapEntries()));
