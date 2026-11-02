import type { MetadataRoute } from "next";
import { SITE_URL, supabaseConfigured } from "@/lib/supabase/env";
import { getSitemapEntries } from "@/server/catalog";

export const dynamic = "force-dynamic";

/** Every public page search engines should know about: categories, collections, products, policies. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/c`, changeFrequency: "weekly", priority: 0.6 },
  ];
  if (!supabaseConfigured) return base;
  const e = await getSitemapEntries();
  return [
    ...base,
    ...e.categories.map((c) => ({ url: `${SITE_URL}/c/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...e.collections.map((c) => ({ url: `${SITE_URL}/collections/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...e.products.map((p) => ({ url: `${SITE_URL}/p/${p.slug}`, lastModified: p.published_at ?? undefined, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...e.pages.map((p) => ({ url: `${SITE_URL}/pages/${p.slug}`, lastModified: p.updated_at, changeFrequency: "monthly" as const, priority: 0.3 })),
  ];
}
