import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, RotateCcw, Truck } from "lucide-react";
import { getProductReviews, getStoreSettings, productDetail, relatedProducts } from "@/server/catalog";
import { getUser } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { Breadcrumbs } from "@/components/store/ListingPage";
import { ProductGrid } from "@/components/store/ProductCard";
import { SITE_URL } from "@/lib/supabase/env";
import { whatsappLink } from "@/lib/money";
import type { Tone } from "@/lib/types";
import { Gallery } from "./Gallery";
import { BuyBox } from "./BuyBox";
import { PinCheck } from "./PinCheck";
import { RecentlyViewed } from "./RecentlyViewed";
import { Reviews, Stars } from "./Reviews";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const p = await productDetail((await params).slug);
  if (!p) return { title: "Product not found" };
  const description = p.seo_description ?? p.description?.slice(0, 160) ?? undefined;
  return {
    title: p.seo_title ?? p.name,
    description,
    alternates: { canonical: `/p/${p.slug}` },
    openGraph: { title: p.name, description, images: p.images.slice(0, 1).map((i) => ({ url: i.url, alt: i.alt })) },
  };
}

const tones: Tone[] = ["blush", "peach", "lavender", "sage", "champagne"];

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [p, s] = await Promise.all([productDetail(slug), getStoreSettings()]);
  if (!p) notFound();
  const [related, { summary, reviews }, user] = await Promise.all([relatedProducts(p.id, 8), getProductReviews(p.id), getUser()]);
  const me = user ? ((await (await supabaseForUser()).rpc("my_review", { p_product: p.id })).data as Parameters<typeof Reviews>[0]["me"]) : null;
  const tone = tones[[...p.id].reduce((a, c) => a + c.charCodeAt(0), 0) % tones.length];
  const def = p.variants.find((v) => v.is_default) ?? p.variants[0];

  // Structured data so search engines can show price and availability.
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.description ?? undefined,
    image: p.images.map((i) => i.url), sku: def?.sku, brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
    aggregateRating: summary.count ? { "@type": "AggregateRating", ratingValue: summary.average, reviewCount: summary.count } : undefined,
    offers: p.quote_only ? undefined : p.variants.map((v) => ({
      "@type": "Offer", price: (v.price / 100).toFixed(2), priceCurrency: "INR", sku: v.sku, url: `${SITE_URL}/p/${p.slug}`,
      availability: v.available == null || v.available >= v.min_qty ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    })),
  };
  const crumbsLd = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [...p.breadcrumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE_URL}/c/${c.slug}` })),
      { "@type": "ListItem", position: p.breadcrumbs.length + 1, name: p.name }],
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbsLd).replace(/</g, "\\u003c") }} />
      <Breadcrumbs items={[...p.breadcrumbs.map((c) => ({ label: c.name, href: `/c/${c.slug}` })), { label: p.name }]} />

      <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-14 [&>*]:min-w-0">
        <Gallery images={p.images} name={p.name} tone={tone} />
        <div>
          {p.breadcrumbs.length > 0 && (
            <Link href={`/c/${p.breadcrumbs[p.breadcrumbs.length - 1].slug}`} className="text-[11px] uppercase tracking-[0.18em] text-taupe hover:text-cocoa">
              {p.breadcrumbs[p.breadcrumbs.length - 1].name}
            </Link>
          )}
          <h1 className="mt-2 break-words text-3xl font-medium leading-tight sm:text-5xl">{p.name}</h1>
          {p.brand && <p className="mt-1 text-sm text-taupe">by {p.brand}</p>}
          {summary.count > 0 && (
            <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-sm text-taupe hover:text-cocoa">
              <Stars value={summary.average} /> {summary.average.toFixed(1)} · {summary.count} review{summary.count === 1 ? "" : "s"}
            </a>
          )}

          {p.quote_only ? (
            <>
              <p className="mt-5 text-xl font-medium">Price on request</p>
              {s.whatsapp && (
                <a href={whatsappLink(s.whatsapp, `Hi, I'd like a quote for: ${p.name}`)} target="_blank" rel="noopener noreferrer"
                  className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-sage-deep px-8 text-sm font-medium text-cream">
                  <MessageCircle className="size-4" /> Enquire on WhatsApp
                </a>
              )}
            </>
          ) : (
            <BuyBox productId={p.id} slug={p.slug} name={p.name} variants={p.variants} />
          )}

          <div className="mt-8 space-y-4 border-t border-champagne pt-6 text-sm">
            <PinCheck minDays={s.deliveryMinDays} maxDays={s.deliveryMaxDays} />
            <p className="flex items-center gap-2"><Truck className="size-4" strokeWidth={1.6} /> {s.shippingNote}</p>
            <p className="flex items-start gap-2"><RotateCcw className="mt-0.5 size-4 shrink-0" strokeWidth={1.6} />
             <span>{s.returnsNote || "No returns, exchanges or refunds."} <Link href="/pages/return-refund-policy" className="underline underline-offset-4">Read the policy</Link></span></p>
            {s.whatsapp && (
              <a className="flex items-center gap-2 underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer"
                href={whatsappLink(s.whatsapp, `Hi, I'd like to know more about: ${p.name}`)}>
                <MessageCircle className="size-4" strokeWidth={1.6} /> Ask about this product on WhatsApp
              </a>
            )}
          </div>

          {(p.description || p.specs.length > 0) && (
            <div className="mt-8 space-y-6 border-t border-champagne pt-6">
              {p.description && (
                <section>
                  <h2 className="text-2xl font-medium">Details</h2>
                  <p className="mt-2 whitespace-pre-line leading-relaxed text-cocoa-soft">{p.description}</p>
                </section>
              )}
              {p.specs.length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                  {p.specs.map((sp) => (
                    <div key={sp.label} className="contents"><dt className="text-taupe">{sp.label}</dt><dd>{sp.values.join(", ")}</dd></div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </div>
      </div>

      <Reviews productId={p.id} slug={p.slug} summary={summary} reviews={reviews} me={me} signedIn={Boolean(user)} />

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-3xl font-medium">You may also like</h2>
          <div className="mt-6"><ProductGrid products={related.slice(0, 4)} /></div>
        </section>
      )}
      <RecentlyViewed productId={p.id} />
    </div>
  );
}
