import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ProductCardData } from "@/lib/types";
import { ProductGrid } from "./ProductCard";
import { ButtonLink } from "@/components/ui/primitives";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[12px] text-taupe">
      <ol className="flex flex-wrap items-center gap-1">
        <li><Link href="/" className="hover:text-cocoa">Home</Link></li>
        {items.map((c) => (
          <li key={c.label} className="flex items-center gap-1">
            <ChevronRight className="size-3" />
            {c.href ? <Link href={c.href} className="hover:text-cocoa">{c.label}</Link> : <span aria-current="page" className="text-cocoa">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageShell({ crumbs, title, intro, children }: { crumbs: Crumb[]; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <Breadcrumbs items={crumbs} />
      <header className="mt-5 max-w-2xl">
        <h1 className="text-4xl font-medium text-cocoa sm:text-5xl">{title}</h1>
        {intro && <p className="mt-3 leading-relaxed text-taupe">{intro}</p>}
      </header>
      <div className="mt-10">{children}</div>
    </div>
  );
}

export function EmptyState({ title, body, cta = { label: "Explore all categories", href: "/c" } }: { title: string; body: string; cta?: { label: string; href: string } }) {
  return (
    <div className="weave rounded-3xl border border-champagne bg-cream px-6 py-16 text-center">
      <h2 className="text-3xl font-medium text-cocoa">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-taupe">{body}</p>
      <ButtonLink href={cta.href} className="mt-7">{cta.label}</ButtonLink>
    </div>
  );
}

export function ListingPage({ crumbs, title, intro, products, emptyTitle, emptyBody }: {
  crumbs: Crumb[]; title: string; intro?: string; products: ProductCardData[]; emptyTitle: string; emptyBody: string;
}) {
  return (
    <PageShell crumbs={crumbs} title={title} intro={intro}>
      {products.length ? (
        <>
          <p className="mb-6 text-sm text-taupe">{products.length} {products.length === 1 ? "item" : "items"}</p>
          <ProductGrid products={products} />
        </>
      ) : (
        <EmptyState title={emptyTitle} body={emptyBody} />
      )}
    </PageShell>
  );
}
