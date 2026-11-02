import { notFound } from "next/navigation";
import { supabasePublic } from "@/lib/supabase/server";
import { Browse } from "@/components/store/browse/Browse";
import { SORTS, type SP } from "@/components/store/browse/params";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

async function getCollection(slug: string) {
  if (slug === "new-arrivals") return { title: "New Arrivals", description: "The latest additions to the store.", slug };
  const { data } = await supabasePublic().from("collections").select("slug, title, description").eq("slug", slug).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props) {
  const c = await getCollection((await params).slug);
  return { title: c?.title ?? "Collection" };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const col = await getCollection(slug);
  if (!col) notFound();
  const isNew = slug === "new-arrivals";
  return (
    <Browse
      basePath={`/collections/${slug}`}
      base={isNew ? {} : { collection: slug }}
      searchParams={await searchParams}
      title={col.title}
      intro={col.description ?? undefined}
      crumbs={[{ label: col.title }]}
      defaultSort={isNew ? "newest" : "collection"}
      sorts={isNew ? SORTS : [{ key: "collection", label: "Our picks" }, ...SORTS.filter((s) => s.key !== "featured")]}
      empty={{ title: "This collection is being curated", body: "Check back soon, or explore our categories in the meantime.", cta: { label: "Explore categories", href: "/c" } }}
    />
  );
}
