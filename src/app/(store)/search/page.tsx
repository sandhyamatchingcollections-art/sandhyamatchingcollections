import Link from "next/link";
import { getCategoryTree, suggestions } from "@/server/catalog";
import { Browse } from "@/components/store/browse/Browse";
import { SORTS, type SP } from "@/components/store/browse/params";
import { SearchBox } from "@/components/store/SearchBox";

export const metadata = { title: "Search", robots: { index: false } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q ?? "").trim().slice(0, 80);
  const tree = await getCategoryTree();
  const box = (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 md:hidden">
      <SearchBox defaultValue={q} autoFocus={!q} />
    </div>
  );

  if (!q) {
    return (
      <>
        {box}
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <h1 className="text-4xl font-medium">What are you looking for?</h1>
          <p className="mt-3 text-taupe">Search by product name, fabric, colour or SKU — or start from a category:</p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {tree.map((c) => <li key={c.id}><Link href={`/c/${c.slug}`} className="inline-flex min-h-10 items-center rounded-full border border-champagne bg-cream px-4 text-sm hover:border-cocoa">{c.name}</Link></li>)}
          </ul>
        </div>
      </>
    );
  }

  const related = (await suggestions(q)).categories;
  return (
    <>
      {box}
      <Browse
        basePath="/search"
        base={{ q }}
        searchParams={sp}
        title={`Results for “${q}”`}
        crumbs={[{ label: "Search" }]}
        defaultSort="relevance"
        sorts={[{ key: "relevance", label: "Best match" }, ...SORTS.filter((s) => s.key !== "featured")]}
        showCategoryFacet
        above={related.length > 0 && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-taupe">Categories:
            {related.map((c) => <Link key={c.slug} href={`/c/${c.slug}`} className="rounded-full bg-cream px-3 py-1 text-cocoa underline-offset-4 hover:underline">{c.name}</Link>)}
          </p>
        )}
        empty={{
          title: "No matches yet",
          body: "Try a simpler word like “saree”, “blouse” or “bangles”. We may also have it in the shop — ask us on WhatsApp.",
          cta: { label: "Browse all products", href: "/products" },
        }}
      />
    </>
  );
}
