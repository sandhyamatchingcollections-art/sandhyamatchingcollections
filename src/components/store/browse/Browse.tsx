import Link from "next/link";
import { X } from "lucide-react";
import { browse, facets as getFacets } from "@/server/catalog";
import { ProductGrid } from "@/components/store/ProductCard";
import { Breadcrumbs, EmptyState, type Crumb } from "@/components/store/ListingPage";
import { formatINR } from "@/lib/money";
import { FilterForm, FilterToggle, SortSelect } from "./FilterForm";
import { SORTS, hrefWith, parseBrowse, type SP } from "./params";

const PER_PAGE = 24;

type Base = { category?: string; collection?: string; q?: string };

/**
 * A filterable, sortable, paged product listing. Used by category, search,
 * collection, budget and "all products" pages. Everything is in the URL.
 */
export async function Browse({
  basePath, base, searchParams, title, intro, crumbs, defaultSort = "featured", fixed, sorts = SORTS, empty, above, showCategoryFacet,
}: {
  basePath: string;
  base: Base;
  searchParams: SP;
  title: string;
  intro?: string;
  crumbs: Crumb[];
  defaultSort?: "featured" | "newest" | "price_asc" | "relevance" | "collection";
  fixed?: { max?: number };               // e.g. budget pages: a ceiling the shopper can't widen
  sorts?: readonly { key: string; label: string }[];
  empty: { title: string; body: string; cta?: { label: string; href: string } };
  above?: React.ReactNode;                // e.g. subcategory chips
  showCategoryFacet?: boolean;
}) {
  const p = parseBrowse(searchParams, defaultSort);
  const max = fixed?.max != null ? Math.min(p.max ?? Infinity, fixed.max) : p.max;
  const [{ items, total }, facets] = await Promise.all([
    browse({ ...base, min: p.min, max, inStock: p.inStock, attrs: p.attrs, sort: p.sort, page: p.page, perPage: PER_PAGE }),
    getFacets(base),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const link = (patch: Parameters<typeof hrefWith>[2]) => hrefWith(basePath, p, { page: 1, ...patch }, defaultSort);

  // Chips for every active filter, each with its own remove link.
  const chips: { label: string; href: string }[] = [];
  if (p.min != null) chips.push({ label: `From ${formatINR(p.min)}`, href: link({ min: undefined }) });
  if (p.max != null) chips.push({ label: `Up to ${formatINR(p.max)}`, href: link({ max: undefined }) });
  if (p.inStock) chips.push({ label: "In stock", href: link({ inStock: false }) });
  for (const [k, vals] of Object.entries(p.attrs)) {
    const label = facets.attributes.find((a) => a.key === k)?.label ?? k;
    for (const v of vals) chips.push({ label: `${label}: ${v}`, href: link({ removeAttr: [k, v] }) });
  }
  const clearHref = hrefWith(basePath, { ...p, min: undefined, max: undefined, inStock: false, attrs: {}, page: 1 }, {}, defaultSort);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <Breadcrumbs items={crumbs} />
      <header className="mt-5 max-w-2xl">
        <h1 className="text-4xl font-medium text-cocoa sm:text-5xl">{title}</h1>
        {intro && <p className="mt-3 leading-relaxed text-taupe">{intro}</p>}
      </header>
      {above}

      <div className="mt-8 lg:grid lg:grid-cols-[230px_1fr] lg:gap-10">
        <div>
          <FilterForm
            action={basePath.split("?")[0]}
            facets={fixed?.max != null ? { ...facets, price: { min: facets.price.min, max: Math.min(facets.price.max ?? fixed.max, fixed.max) } } : facets}
            current={{ attrs: p.attrs, min: p.min, max: p.max, inStock: p.inStock, sort: p.sort }}
            hidden={base.q ? { q: base.q } : {}}
            categoryLinks={showCategoryFacet ? facets.categories.map((c) => ({ ...c, href: `/c/${c.slug}` })) : undefined}
          />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-taupe" aria-live="polite">{total} {total === 1 ? "item" : "items"}</p>
            <div className="flex items-center gap-2">
              <FilterToggle activeCount={chips.length} />
              <SortSelect value={p.sort} options={sorts} />
            </div>
          </div>
          {chips.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.label}>
                  <Link href={c.href} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-lavender px-3 text-xs hover:bg-blush" aria-label={`Remove filter ${c.label}`}>
                    {c.label} <X className="size-3" />
                  </Link>
                </li>
              ))}
              <li><Link href={clearHref} className="inline-flex min-h-9 items-center px-2 text-xs underline">Clear all</Link></li>
            </ul>
          )}
          <div className="mt-6">
            {items.length ? (
              <>
                <ProductGrid products={items} />
                {pages > 1 && (
                  <nav aria-label="Pages" className="mt-10 flex flex-wrap items-center justify-center gap-2 text-sm">
                    {p.page > 1 && <Link className="rounded-full border border-champagne bg-cream px-4 py-2" href={hrefWith(basePath, p, { page: p.page - 1 }, defaultSort)}>← Previous</Link>}
                    {Array.from({ length: pages }, (_, i) => i + 1)
                      .filter((n) => n === 1 || n === pages || Math.abs(n - p.page) <= 2)
                      .map((n, i, arr) => (
                        <span key={n} className="flex items-center gap-2">
                          {i > 0 && n - arr[i - 1] > 1 && <span className="text-taupe">…</span>}
                          <Link href={hrefWith(basePath, p, { page: n }, defaultSort)} aria-current={n === p.page ? "page" : undefined}
                            className={`grid size-10 place-items-center rounded-full ${n === p.page ? "bg-cocoa text-cream" : "border border-champagne bg-cream"}`}>{n}</Link>
                        </span>
                      ))}
                    {p.page < pages && <Link className="rounded-full border border-champagne bg-cream px-4 py-2" href={hrefWith(basePath, p, { page: p.page + 1 }, defaultSort)}>Next →</Link>}
                  </nav>
                )}
              </>
            ) : chips.length ? (
              <EmptyState title="Nothing matches these filters" body="Try removing a filter or widening the price range." cta={{ label: "Clear filters", href: clearHref }} />
            ) : (
              <EmptyState title={empty.title} body={empty.body} cta={empty.cta} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
