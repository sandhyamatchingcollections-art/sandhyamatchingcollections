import Link from "next/link";
import { getCategoryTree } from "@/server/catalog";
import { PageShell } from "@/components/store/ListingPage";
import { PhotoPlaceholder } from "@/components/ui/primitives";
import type { Tone } from "@/lib/types";

export const metadata = { title: "All Categories" };
const tones: Tone[] = ["blush", "peach", "lavender", "sage", "champagne"];

export default async function AllCategories() {
  const tree = await getCategoryTree();
  return (
    <PageShell crumbs={[{ label: "All Categories" }]} title="Shop by Category" intro="Everything for her, under one roof.">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {tree.map((c, i) => (
          <li key={c.id}>
            <Link href={`/c/${c.slug}`} className="group block">
              <PhotoPlaceholder tone={tones[i % tones.length]} label={c.name} className="aspect-[4/5] rounded-3xl" />
              <span className="font-display mt-3 block text-2xl text-cocoa group-hover:underline">{c.name}</span>
              {!!c.children?.length && <span className="text-[13px] text-taupe">{c.children.map((s) => s.name).join(" · ")}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
