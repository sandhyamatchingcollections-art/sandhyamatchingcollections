import "server-only";
import type { Banner, BrowseQuery, CartLineIn, CartQuote, Category, Facets, HomeSection, ProductCardData, ProductDetail, Promotion, QuotedLine, Review, ReviewSummary, SellingUnit, StoreSettings, Tone } from "@/lib/types";
import { supabasePublic } from "@/lib/supabase/server";
import { storageUrl } from "@/lib/supabase/env";
import { parseHomeSection } from "@/lib/home-schema";

// All reads here run with visitor rights; Row Level Security hides drafts, hidden
// categories, expired offers and stock numbers.

const db = () => supabasePublic();

type CardRow = {
  id: string; slug: string; name: string; price: number; mrp: number | null; unit: SellingUnit;
  category_name: string | null; image_path: string | null; image_alt: string; in_stock: boolean; quote_only: boolean; min_qty: number; qty_step: number;
  variant_id: string; variant_count: number; default_in_stock: boolean;
};
const CARD_COLS = "id, slug, name, price, mrp, unit, category_name, image_path, image_alt, in_stock, quote_only, min_qty, qty_step, variant_id, variant_count, default_in_stock";

const tones: Tone[] = ["blush", "peach", "lavender", "sage", "champagne"];
const toneFor = (id: string) => tones[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % tones.length];

function toCard(r: CardRow): ProductCardData {
  return {
    id: r.id, slug: r.slug, name: r.name, price: Number(r.price), mrp: r.mrp == null ? null : Number(r.mrp),
    unit: r.unit, categoryName: r.category_name ?? "", imageUrl: storageUrl("product-images", r.image_path),
    imageAlt: r.image_alt, tone: toneFor(r.id), inStock: r.in_stock, quoteOnly: r.quote_only, minQty: Number(r.min_qty), qtyStep: Number(r.qty_step),
    variantId: r.variant_id, variantCount: Number(r.variant_count ?? 1), defaultInStock: r.default_in_stock ?? r.in_stock,
  };
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`Could not load ${what}: ${error?.message ?? "unknown error"}`);
}

async function cardsByIds(ids: string[], limit: number, keepOrder = true): Promise<ProductCardData[]> {
  if (!ids.length) return [];
  const { data, error } = await db().from("product_cards").select(CARD_COLS).in("id", ids.slice(0, 200)).eq("in_stock", true);
  if (error) fail("products", error);
  const cards = (data as CardRow[]).map(toCard);
  if (keepOrder) cards.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return cards.slice(0, limit);
}

export async function getStoreSettings(): Promise<StoreSettings> {
  const { data, error } = await db().from("store_settings").select("*").single();
  if (error || !data) fail("store settings", error);
  return {
    name: data.name, tagline: data.tagline, description: data.description, shippingNote: data.shipping_note,
    whatsapp: data.whatsapp, instagramUrl: data.instagram_url, instagramHandle: data.instagram_handle,
    facebookUrl: data.facebook_url, email: data.email, phone: data.phone, address: data.address,
    paymentMethods: data.payment_methods ?? [],
    deliveryMinDays: data.delivery_min_days ?? 4, deliveryMaxDays: data.delivery_max_days ?? 8, returnsNote: data.returns_note ?? "",
    shippingFee: Number(data.shipping_fee ?? 0), freeShippingMin: data.free_shipping_min == null ? null : Number(data.free_shipping_min),
    codEnabled: data.cod_enabled ?? false, codFee: Number(data.cod_fee ?? 0),
    codMaxTotal: data.cod_max_total == null ? null : Number(data.cod_max_total), onlinePaymentsEnabled: data.online_payments_enabled ?? false,
    announcement: data.announcement ?? null, seoTitle: data.seo_title ?? null, seoDescription: data.seo_description ?? null, ogImageUrl: data.og_image_url ?? null,
  };
}

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await db().from("categories")
    .select("id, parent_id, name, slug, sort_order, is_active").order("sort_order");
  if (error) fail("categories", error);
  return data.map((c) => ({ id: c.id, parentId: c.parent_id, name: c.name, slug: c.slug, sortOrder: c.sort_order, isActive: c.is_active }));
}

export async function getHomeSections(): Promise<HomeSection[]> {
  const { data, error } = await db().from("homepage_sections").select("id, type, config").order("sort_order");
  if (error) fail("homepage", error);
  return data.map(parseHomeSection).filter((s): s is HomeSection => s !== null);
}

export async function getActivePromotions(): Promise<Promotion[]> {
  const { data, error } = await db().from("promotions").select("id, title, starts_at, ends_at, is_active").order("starts_at");
  if (error) fail("offers", error);
  return data.map((p) => ({ id: p.id, title: p.title, startsAt: p.starts_at, endsAt: p.ends_at, isActive: p.is_active }));
}

export async function getNewArrivals(limit: number): Promise<ProductCardData[]> {
  const { new_arrival_days } = (await db().from("store_settings").select("new_arrival_days").single()).data ?? { new_arrival_days: 30 };
  const since = new Date(Date.now() - new_arrival_days * 86_400_000).toISOString();
  const { data, error } = await db().from("product_cards").select(CARD_COLS)
    .eq("in_stock", true).gte("published_at", since).order("published_at", { ascending: false }).limit(limit);
  if (error) fail("new arrivals", error);
  return (data as CardRow[]).map(toCard);
}

export async function getCollectionProducts(slug: string, limit: number): Promise<ProductCardData[]> {
  const { data: col, error } = await db().from("collections").select("id").eq("slug", slug).maybeSingle();
  if (error) fail("collection", error);
  if (!col) return [];
  const { data: links, error: e2 } = await db().from("collection_products")
    .select("product_id").eq("collection_id", col.id).order("sort_order").limit(200);
  if (e2) fail("collection", e2);
  return cardsByIds(links.map((l) => l.product_id), limit);
}

/** Until online orders exist, bestsellers are the store's own picks (the "bestsellers" collection). */
/** Real bestsellers once there are enough sales (last 90 days); until then the hand-picked collection. */
export async function getBestsellers(limit: number): Promise<ProductCardData[]> {
  const { data } = await db().rpc("bestseller_ids", { p_limit: limit, p_days: 90 });
  const ids = ((data ?? []) as string[]).filter(Boolean);
  if (ids.length >= 4) {
    const cards = await cardsByIds(ids, limit);
    if (cards.length >= 4) return cards;
  }
  return getCollectionProducts("bestsellers", limit);
}

export async function getProductBySlug(slug: string): Promise<ProductCardData | null> {
  const { data, error } = await db().from("product_cards").select(CARD_COLS).eq("slug", slug).maybeSingle();
  if (error) fail("product", error);
  return data ? toCard(data as CardRow) : null;
}

export async function getProductsByIds(ids: string[]): Promise<ProductCardData[]> {
  if (!ids.length) return [];
  const { data, error } = await db().from("product_cards").select(CARD_COLS).in("id", ids);
  if (error) fail("products", error);
  return (data as CardRow[]).map(toCard);
}

// ---------------------------------------------------------------- Phase 5: browsing, search, product page, cart

export async function browse(q: BrowseQuery): Promise<{ items: ProductCardData[]; total: number }> {
  const per = Math.min(Math.max(q.perPage ?? 24, 1), 96);
  const page = Math.max(q.page ?? 1, 1);
  const { data, error } = await db().rpc("browse_products", {
    p_category: q.category ?? null, p_collection: q.collection ?? null, p_q: q.q?.trim() || null,
    p_min: q.min ?? null, p_max: q.max ?? null, p_in_stock: q.inStock ?? false, p_attrs: q.attrs ?? {},
    p_sort: q.sort ?? "featured", p_limit: per, p_offset: (page - 1) * per,
  });
  if (error) fail("products", error);
  const rows = (data ?? []) as (CardRow & { total: number })[];
  return { items: rows.map(toCard), total: Number(rows[0]?.total ?? 0) };
}

export async function facets(q: Pick<BrowseQuery, "category" | "collection" | "q">): Promise<Facets> {
  const { data, error } = await db().rpc("listing_facets", {
    p_category: q.category ?? null, p_collection: q.collection ?? null, p_q: q.q?.trim() || null,
  });
  if (error) fail("filters", error);
  const f = data as Facets;
  return { ...f, price: { min: f.price?.min == null ? null : Number(f.price.min), max: f.price?.max == null ? null : Number(f.price.max) } };
}

export type Suggestions = {
  products: { slug: string; name: string; price: number; unit: SellingUnit; imageUrl: string | null; quoteOnly: boolean }[];
  categories: { slug: string; name: string }[];
};
export async function suggestions(term: string): Promise<Suggestions> {
  const { data, error } = await db().rpc("search_suggestions", { p_q: term });
  if (error) fail("suggestions", error);
  const d = data as { products: { slug: string; name: string; price: number; unit: SellingUnit; image_path: string | null; quote_only: boolean }[]; categories: Suggestions["categories"] };
  return {
    products: d.products.map((p) => ({ slug: p.slug, name: p.name, price: Number(p.price), unit: p.unit, imageUrl: storageUrl("product-images", p.image_path), quoteOnly: p.quote_only })),
    categories: d.categories,
  };
}

export async function productDetail(slug: string): Promise<ProductDetail | null> {
  const { data, error } = await db().rpc("product_detail", { p_slug: slug });
  if (error) fail("product", error);
  if (!data) return null;
  const d = data as Omit<ProductDetail, "images"> & { images: { path: string; alt: string }[] };
  return {
    ...d,
    variants: d.variants.map((v) => ({ ...v, price: Number(v.price), mrp: v.mrp == null ? null : Number(v.mrp), min_qty: Number(v.min_qty),
      qty_step: Number(v.qty_step), max_qty: v.max_qty == null ? null : Number(v.max_qty), available: v.available == null ? null : Number(v.available) })),
    images: d.images.map((i) => ({ url: storageUrl("product-images", i.path)!, alt: i.alt })),
  };
}

export async function relatedProducts(productId: string, limit = 8): Promise<ProductCardData[]> {
  const { data, error } = await db().rpc("related_products", { p_product: productId, p_limit: limit });
  if (error) fail("related products", error);
  return cardsByIds((data ?? []) as string[], limit);
}

export async function quoteCart(lines: CartLineIn[]): Promise<CartQuote> {
  const { data, error } = await db().rpc("quote_cart", { p_lines: lines });
  if (error) fail("cart", error);
  return mapQuote(data);
}

/** Turn the database's cart quote into numbers and photo URLs. */
export function mapQuote(data: unknown): CartQuote {
  const d = data as { lines: (QuotedLine & { image_path?: string | null })[]; subtotal: number };
  return {
    subtotal: Number(d.subtotal),
    lines: d.lines.map(({ image_path, ...l }) => ({
      ...l, qty: Number(l.qty), price: l.price == null ? undefined : Number(l.price), mrp: l.mrp == null ? null : Number(l.mrp),
      min_qty: l.min_qty == null ? undefined : Number(l.min_qty), qty_step: l.qty_step == null ? undefined : Number(l.qty_step),
      max_qty: l.max_qty == null ? null : Number(l.max_qty), available: l.available == null ? null : Number(l.available),
      line_total: l.line_total == null ? undefined : Number(l.line_total), image_url: storageUrl("product-images", image_path ?? null),
    })),
  };
}

export async function getBanners(): Promise<Banner[]> {
  const { data, error } = await db().from("banners")
    .select("id, title, subtitle, cta_label, link, image_url, mobile_image_url, alt, text_color").order("sort_order").order("created_at");
  if (error) fail("banners", error);
  return (data ?? []) as Banner[];
}

export async function getContentPage(slug: string): Promise<{ slug: string; title: string; body: string } | null> {
  const { data } = await db().from("content_pages").select("slug, title, body").eq("slug", slug).maybeSingle();
  return data;
}

export async function getProductReviews(productId: string): Promise<{ summary: ReviewSummary; reviews: Review[] }> {
  const [{ data: r }, { data: list }] = await Promise.all([
    db().rpc("product_rating", { p_product: productId }),
    db().from("product_reviews").select("id, author_name, rating, title, body, verified, created_at")
      .eq("product_id", productId).order("created_at", { ascending: false }).limit(30),
  ]);
  const s = (r ?? { average: 0, count: 0, stars: {} }) as ReviewSummary;
  return { summary: { average: Number(s.average ?? 0), count: Number(s.count ?? 0), stars: s.stars }, reviews: (list ?? []) as Review[] };
}

export async function getSitemapEntries() {
  const [cats, cols, prods, pages] = await Promise.all([
    db().from("categories").select("slug, updated_at:created_at").eq("is_active", true),
    db().from("collections").select("slug").eq("is_active", true),
    db().from("product_cards").select("slug, published_at"),
    db().from("content_pages").select("slug, updated_at"),
  ]);
  return {
    categories: (cats.data ?? []) as { slug: string }[],
    collections: (cols.data ?? []) as { slug: string }[],
    products: (prods.data ?? []) as { slug: string; published_at: string | null }[],
    pages: (pages.data ?? []) as { slug: string; updated_at: string }[],
  };
}
