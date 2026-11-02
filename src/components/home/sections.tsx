import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, MessageCircle } from "lucide-react";
import { InstagramIcon } from "@/components/store/Footer";
import type { HomeSection } from "@/lib/types";
import {
  getActivePromotions, getBanners, getBestsellers, getCategoryTree, getCollectionProducts, getNewArrivals, getStoreSettings,
} from "@/server/catalog";
import { BannerSlider } from "./BannerSlider";
import { ButtonLink, PhotoPlaceholder, SectionHeading, toneClass } from "@/components/ui/primitives";
import { ProductGrid } from "@/components/store/ProductCard";
import { formatINR, whatsappLink } from "@/lib/money";

type Of<T extends HomeSection["type"]> = Extract<HomeSection, { type: T }>;

export async function Hero({ s }: { s: Of<"hero"> }) {
  const tree = await getCategoryTree();
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-8 px-4 pb-12 pt-8 sm:px-6 md:grid-cols-[1.05fr_1fr] md:gap-12 md:pt-14 lg:gap-16 lg:pb-20">
      <div className="order-2 md:order-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-rose">{s.eyebrow}</p>
        <h1 className="mt-4 max-w-[14ch] text-[2.6rem] font-medium leading-[1.02] text-cocoa sm:text-5xl lg:text-[4.25rem]">
          {s.heading}
        </h1>
        <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-taupe sm:text-base">{s.body}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={s.primary.href}>{s.primary.label}</ButtonLink>
          <ButtonLink href={s.secondary.href} variant="outline">{s.secondary.label}</ButtonLink>
        </div>
        <ul className="mt-9 flex flex-wrap gap-x-5 gap-y-2 border-t border-champagne pt-5 text-[13px] text-taupe">
          {tree.slice(0, 7).map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.slug}`} className="hover:text-cocoa">{c.name}</Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative order-1 md:order-2">
        <div className="absolute -right-3 -top-3 hidden h-full w-full rounded-[2rem] border border-champagne md:block" aria-hidden />
        {s.imageUrl ? (
          <Image src={s.imageUrl} alt={s.imageAlt} width={900} height={1100} priority sizes="(min-width:768px) 48vw, 100vw"
            className="relative aspect-[4/3] w-full rounded-[2rem] object-cover md:aspect-[4/5]" />
        ) : (
          <PhotoPlaceholder tone="blush" motif="drape" label={s.imageAlt} className="relative aspect-[4/3] w-full rounded-[2rem] md:aspect-[4/5]" />
        )}
        <div className="absolute bottom-4 left-4 rounded-2xl bg-cream/95 px-4 py-3 text-[13px] text-cocoa shadow-sm">
          <span className="font-display block text-lg italic leading-none">One stop</span>
          <span className="text-taupe">for every ladies essential</span>
        </div>
      </div>
    </section>
  );
}

export function Budget({ s }: { s: Of<"budget"> }) {
  const ranges = s.ranges.filter((r) => r.enabled);
  if (!ranges.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:py-20">
      <SectionHeading title={s.heading} body={s.body} />
      <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
        {ranges.map((r, i) => (
          <li key={r.key} className={i === ranges.length - 1 && ranges.length % 2 ? "col-span-2 md:col-span-1" : ""}>
            <Link
              href={r.collectionSlug ? `/collections/${r.collectionSlug}` : `/budget/${r.key}`}
              className={`weave group flex h-full min-h-40 flex-col justify-between rounded-3xl border border-white/60 p-5 transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgb(62_44_37/0.45)] sm:min-h-48 ${toneClass(r.tone)}`}
            >
              <span className="text-[11px] uppercase tracking-[0.2em] text-cocoa/70">{r.maxPrice ? "Under" : "Curated"}</span>
              <span>
                <span className="font-display block text-[2.1rem] font-semibold leading-none text-cocoa sm:text-[2.5rem]">
                  {r.maxPrice ? formatINR(r.maxPrice) : "Premium"}
                </span>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-cocoa">
                  {r.maxPrice ? "Shop now" : "Premium Picks"} <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-center text-xs text-taupe">
        Ranges overlap — an item under ₹100 also appears in Under ₹200 and above. Prices include any current product discount.
      </p>
    </section>
  );
}

export async function Feature({ s }: { s: Of<"feature"> }) {
  const products = await getCollectionProducts(s.collectionSlug, 3);
  if (!products.length) return null; // never show an empty campaign
  const imgFirst = s.imageSide === "left";
  const isBridal = s.variant === "bridal";
  return (
    <section className={`${isBridal ? "bg-blush/45" : ""} py-14 lg:py-24`}>
      <div className={`mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 md:gap-14 ${isBridal ? "md:grid-cols-[1.15fr_1fr]" : "md:grid-cols-[1fr_1.05fr]"}`}>
        <div className={imgFirst ? "" : "md:order-2"}>
          {s.imageUrl ? (
            <Image src={s.imageUrl} alt={s.imageAlt} width={1000} height={1200} sizes="(min-width:768px) 50vw, 100vw"
              className={`w-full object-cover ${isBridal ? "aspect-[4/5] rounded-t-[12rem] rounded-b-3xl" : "aspect-[5/4] rounded-3xl"}`} />
          ) : (
            <PhotoPlaceholder tone={s.tone} motif={isBridal ? "paisley" : "drape"} label={s.imageAlt}
              className={isBridal ? "aspect-[4/5] rounded-t-[12rem] rounded-b-3xl" : "aspect-[5/4] rounded-3xl"} />
          )}
        </div>
        <div className={imgFirst ? "" : "md:order-1"}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-rose">
            {isBridal ? "The Bridal Edit" : "Kurta Collection"}
          </p>
          <h2 className="mt-4 text-4xl font-medium leading-[1.05] text-cocoa sm:text-5xl">{s.heading}</h2>
          <p className="mt-5 max-w-[48ch] leading-relaxed text-taupe">{s.body}</p>
          <ButtonLink href={s.cta.href} className="mt-8">{s.cta.label}</ButtonLink>
          <ul className="mt-10 grid grid-cols-3 gap-3">
            {products.map((p) => (
              <li key={p.id}>
                <Link href={`/p/${p.slug}`} className="group block">
                  {p.imageUrl ? (
                    <Image src={p.imageUrl} alt={p.imageAlt} width={300} height={300} sizes="(min-width:768px) 12vw, 30vw"
                      className="aspect-square w-full rounded-2xl border border-white/70 object-cover" />
                  ) : (
                    <PhotoPlaceholder tone={p.tone} motif="none" label={p.imageAlt} className="aspect-square rounded-2xl border border-white/70" />
                  )}
                  <span className="mt-2 line-clamp-1 block text-[12px] text-cocoa group-hover:underline">{p.name.replace(/^Sample · /, "")}</span>
                  <span className="text-[12px] font-semibold">{formatINR(p.price)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export async function ProductRail({ s }: { s: Of<"productRail"> }) {
  const products =
    s.source === "new-arrivals" ? await getNewArrivals(s.limit)
    : s.source === "bestsellers" ? await getBestsellers(s.limit)
    : await getCollectionProducts(s.collectionSlug ?? "", s.limit);
  if (!products.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:py-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading title={s.heading} body={s.body} align="left" />
        <ButtonLink href={s.cta.href} variant="outline" className="self-start sm:self-auto">
          {s.cta.label} <ArrowRight className="size-4" />
        </ButtonLink>
      </div>
      <div className="mt-10">
        <ProductGrid products={products} />
      </div>
    </section>
  );
}

export async function Promo({ s }: { s: Of<"promo"> }) {
  const promos = await getActivePromotions();
  if (!promos.length) return null; // hidden when no live offer exists
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="weave flex flex-col items-start gap-6 rounded-[2rem] bg-lavender px-7 py-12 sm:px-12 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-4xl font-medium text-cocoa">{s.heading}</h2>
          <p className="mt-3 max-w-[50ch] text-taupe">{s.body}</p>
          <ul className="mt-4 space-y-1 text-sm font-medium text-cocoa">
            {promos.slice(0, 3).map((p) => <li key={p.id}>· {p.title}</li>)}
          </ul>
        </div>
        <ButtonLink href={s.cta.href}>{s.cta.label}</ButtonLink>
      </div>
    </section>
  );
}


export async function Banners({ s }: { s: Of<"banners"> }) {
  const banners = await getBanners();
  if (!banners.length) return null; // shows once the owner adds a banner
  return <div className="pb-6 pt-2"><BannerSlider banners={banners} intervalSeconds={s.intervalSeconds} /></div>;
}

/** The complete bridal look: one arched bridal portrait framed by everything a bride needs. */
export function BridalShowcase({ s }: { s: Of<"bridalShowcase"> }) {
  const half = Math.ceil(s.items.length / 2);
  const cols = [s.items.slice(0, half), s.items.slice(half)];
  const Item = ({ it, n, align }: { it: Of<"bridalShowcase">["items"][number]; n: number; align: "left" | "right" }) => (
    <li>
      <Link href={it.href} className={`group flex items-start gap-4 border-b border-cocoa/10 py-4 ${align === "right" ? "lg:flex-row-reverse lg:text-right" : ""}`}>
        <span className="font-display w-9 shrink-0 text-2xl italic leading-none text-rose/80">{String(n).padStart(2, "0")}</span>
        <span className="min-w-0 flex-1">
          <span className="font-display block text-[1.45rem] leading-tight text-cocoa transition group-hover:text-rose">{it.label}</span>
          {it.note && <span className="mt-0.5 block text-[13px] text-taupe">{it.note}</span>}
        </span>
        <ArrowUpRight className="mt-1 size-4 shrink-0 text-cocoa/40 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-rose" />
      </Link>
    </li>
  );
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-ivory via-blush/40 to-ivory py-16 lg:py-28">
      <div className="weave pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-rose">{s.eyebrow}</p>
          <h2 className="mt-4 text-4xl font-medium leading-[1.05] text-cocoa sm:text-5xl lg:text-6xl">{s.heading}</h2>
          <p className="mx-auto mt-5 max-w-[52ch] leading-relaxed text-taupe">{s.body}</p>
        </header>

        <div className="mt-12 grid items-center gap-8 lg:mt-16 lg:grid-cols-[1fr_minmax(0,0.9fr)_1fr] lg:gap-12">
          <ol className="order-2 lg:order-1">{cols[0].map((it, k) => <Item key={it.href + k} it={it} n={k + 1} align="right" />)}</ol>
          <div className="relative order-1 mx-auto w-full max-w-sm lg:order-2 lg:max-w-none">
            <div className="absolute -inset-3 rounded-t-full rounded-b-[2.5rem] border border-champagne sm:-inset-4" aria-hidden />
            <div className="absolute -inset-6 hidden rounded-t-full rounded-b-[3rem] border border-champagne/60 sm:block" aria-hidden />
            {s.imageUrl ? (
              <Image src={s.imageUrl} alt={s.imageAlt} width={900} height={1200} sizes="(min-width:1024px) 30vw, 90vw"
                className="relative aspect-[3/4] w-full rounded-t-full rounded-b-[2rem] object-cover shadow-[0_30px_60px_-30px_rgb(62_44_37/0.45)]" />
            ) : (
              <PhotoPlaceholder tone="blush" motif="paisley" label={s.imageAlt} className="relative aspect-[3/4] w-full rounded-t-full rounded-b-[2rem]" />
            )}
            <div className="absolute -bottom-5 left-1/2 w-max -translate-x-1/2 rounded-full border border-champagne bg-cream px-5 py-2 text-center shadow-sm">
              <span className="font-display text-lg italic text-cocoa">Head to toe, perfectly matched</span>
            </div>
          </div>
          <ol className="order-3" start={half + 1}>{cols[1].map((it, k) => <Item key={it.href + k} it={it} n={half + k + 1} align="left" />)}</ol>
        </div>

        <div className="mt-14 text-center"><ButtonLink href={s.cta.href}>{s.cta.label}</ButtonLink></div>
      </div>
    </section>
  );
}

/** The person behind the store. */
export async function OwnerStory({ s }: { s: Of<"owner"> }) {
  const store = await getStoreSettings();
  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 md:grid-cols-[0.85fr_1fr] md:gap-16">
        <div className="relative mx-auto w-full max-w-sm md:max-w-none">
          <div className="absolute -bottom-4 -right-4 h-full w-full rounded-[2rem] bg-lavender/70" aria-hidden />
          <div className="absolute -left-4 -top-4 h-24 w-24 rounded-full border border-champagne" aria-hidden />
          {s.imageUrl ? (
            <Image src={s.imageUrl} alt={s.imageAlt} width={800} height={1000} sizes="(min-width:768px) 40vw, 90vw"
              className="relative aspect-[4/5] w-full rounded-[2rem] object-cover" />
          ) : (
            <PhotoPlaceholder tone="champagne" motif="drape" label={s.imageAlt} className="relative aspect-[4/5] w-full rounded-[2rem]" />
          )}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-rose">{s.eyebrow}</p>
          <h2 className="mt-4 text-4xl font-medium leading-[1.05] text-cocoa sm:text-5xl">{s.heading}</h2>
          {s.quote && (
            <blockquote className="relative mt-8 border-l-2 border-rose/40 pl-6">
              <span className="font-display absolute -left-1 -top-6 text-6xl leading-none text-rose/30" aria-hidden>&ldquo;</span>
              <p className="font-display text-2xl italic leading-snug text-cocoa sm:text-[1.7rem]">{s.quote}</p>
            </blockquote>
          )}
          <p className="mt-6 max-w-[56ch] leading-relaxed text-taupe">{s.body}</p>
          <div className="mt-8 border-t border-champagne pt-5">
            {s.name && <p className="font-display text-3xl italic text-cocoa">{s.name}</p>}
            <p className="text-[13px] uppercase tracking-[0.2em] text-taupe">{s.role}</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {store.whatsapp && (
              <a href={whatsappLink(store.whatsapp, "Hi! I'd like some help choosing.")} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-sage-deep px-5 text-sm font-medium text-cream"><MessageCircle className="size-4" /> Chat with us</a>
            )}
            {store.instagramUrl && (
              <a href={store.instagramUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-cocoa/25 px-5 text-sm font-medium text-cocoa hover:border-cocoa"><InstagramIcon className="size-4" /> Follow on Instagram</a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeSectionRenderer({ section }: { section: HomeSection }) {
  switch (section.type) {
    case "hero": return <Hero s={section} />;
    case "budget": return <Budget s={section} />;
    case "feature": return <Feature s={section} />;
    case "productRail": return <ProductRail s={section} />;
    case "promo": return <Promo s={section} />;
    case "banners": return <Banners s={section} />;
    case "bridalShowcase": return <BridalShowcase s={section} />;
    case "owner": return <OwnerStory s={section} />;
  }
}
