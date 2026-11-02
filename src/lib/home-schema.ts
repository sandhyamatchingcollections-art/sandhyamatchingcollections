import { z } from "zod";
import type { HomeSection } from "./types";

// Validates homepage_sections.config per section type, so a bad edit in the admin
// hides one section instead of breaking the page.
const href = z.string().regex(/^\/[A-Za-z0-9\-_/?=&.]*$/, "Links must be site paths like /c/sarees");
const cta = z.object({ label: z.string().min(1).max(40), href });
const tone = z.enum(["blush", "peach", "lavender", "sage", "champagne"]);
const imageUrl = z.string().url().nullable().default(null);

export const homeConfigSchemas = {
  hero: z.object({
    eyebrow: z.string().max(60), heading: z.string().min(1).max(90), body: z.string().max(300),
    primary: cta, secondary: cta, imageUrl, imageAlt: z.string().max(160),
  }),
  budget: z.object({
    heading: z.string().min(1).max(90), body: z.string().max(200),
    ranges: z.array(z.object({
      key: z.string().regex(/^[a-z0-9-]+$/), label: z.string().max(30),
      maxPrice: z.number().int().positive().nullable(), collectionSlug: z.string().optional(),
      tone, enabled: z.boolean(),
    })).max(8),
  }),
  feature: z.object({
    variant: z.enum(["bridal", "kurta"]), heading: z.string().min(1).max(90), body: z.string().max(300),
    cta, imageUrl, imageAlt: z.string().max(160), collectionSlug: z.string(),
    imageSide: z.enum(["left", "right"]), tone,
  }),
  productRail: z.object({
    source: z.enum(["new-arrivals", "bestsellers", "collection"]), collectionSlug: z.string().optional(),
    heading: z.string().min(1).max(90), body: z.string().max(200), cta, limit: z.number().int().min(2).max(12),
  }),
  promo: z.object({ heading: z.string().min(1).max(90), body: z.string().max(200), cta }),
  banners: z.object({ intervalSeconds: z.number().int().min(3).max(15).default(6) }),
  bridalShowcase: z.object({
    eyebrow: z.string().max(60), heading: z.string().min(1).max(90), body: z.string().max(300),
    imageUrl, imageAlt: z.string().max(160), cta,
    items: z.array(z.object({ label: z.string().min(1).max(40), note: z.string().max(60), href })).min(1).max(10),
  }),
  owner: z.object({
    eyebrow: z.string().max(60), heading: z.string().min(1).max(90), name: z.string().max(60), role: z.string().max(80),
    quote: z.string().max(240), body: z.string().max(900), imageUrl, imageAlt: z.string().max(160),
  }),
} as const;

export function parseHomeSection(row: { id: string; type: string; config: unknown }): HomeSection | null {
  const schema = homeConfigSchemas[row.type as keyof typeof homeConfigSchemas];
  if (!schema) return null;
  const parsed = schema.safeParse(row.config);
  if (!parsed.success) {
    console.error(`homepage section "${row.id}" has invalid settings and is hidden:`, parsed.error.issues[0]);
    return null;
  }
  return { ...parsed.data, id: row.id, type: row.type } as HomeSection;
}
