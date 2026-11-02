import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryBySlug, getCategoryTree } from "@/server/catalog";
import { Browse } from "@/components/store/browse/Browse";
import type { SP } from "@/components/store/browse/params";
import type { Category } from "@/lib/types";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const c = await getCategoryBySlug(slug);
  return { title: c?.name ?? "Category", alternates: { canonical: `/c/${slug}` } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) notFound();
  const tree = await getCategoryTree();
  const pathTo = (nodes: Category[], trail: Category[]): Category[] | null => {
    for (const n of nodes) {
      if (n.id === cat.id) return [...trail, n];
      const hit = pathTo(n.children ?? [], [...trail, n]);
      if (hit) return hit;
    }
    return null;
  };
  const trail = pathTo(tree, []) ?? [cat];
  const kids = trail[trail.length - 1].children ?? [];

  return (
    <Browse
      basePath={`/c/${slug}`}
      base={{ category: slug }}
      searchParams={await searchParams}
      title={cat.name}
      crumbs={[{ label: "All Categories", href: "/c" }, ...trail.slice(0, -1).map((a) => ({ label: a.name, href: `/c/${a.slug}` })), { label: cat.name }]}
      empty={{ title: "New pieces are on their way", body: `We're adding ${cat.name.toLowerCase()} to the online store. Message us on WhatsApp to ask what's in the shop today.` }}
      above={kids.length > 0 && (
        <ul className="mt-6 flex gap-2 overflow-x-auto pb-1" aria-label="Subcategories">
          {kids.map((k) => (
            <li key={k.id} className="shrink-0">
              <Link href={`/c/${k.slug}`} className="inline-flex min-h-10 items-center rounded-full border border-champagne bg-cream px-4 text-[13px] hover:border-cocoa">{k.name}</Link>
            </li>
          ))}
        </ul>
      )}
    />
  );
}
