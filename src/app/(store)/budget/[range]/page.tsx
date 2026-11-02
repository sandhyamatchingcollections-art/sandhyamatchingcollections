import { notFound } from "next/navigation";
import { getHomeSections } from "@/server/catalog";
import { Browse } from "@/components/store/browse/Browse";
import type { SP } from "@/components/store/browse/params";
import { formatINR } from "@/lib/money";

type Props = { params: Promise<{ range: string }>; searchParams: Promise<SP> };

async function findRange(key: string) {
  const budget = (await getHomeSections()).find((s) => s.type === "budget");
  return budget?.type === "budget" ? budget.ranges.find((r) => r.key === key && r.maxPrice && r.enabled) : undefined;
}

export async function generateMetadata({ params }: Props) {
  const r = await findRange((await params).range);
  return { title: r ? r.label : "Shop by Budget" };
}

export default async function BudgetPage({ params, searchParams }: Props) {
  const { range } = await params;
  const r = await findRange(range);
  if (!r?.maxPrice) notFound();
  return (
    <Browse
      basePath={`/budget/${range}`}
      base={{}}
      fixed={{ max: r.maxPrice - 1 }}   // "Under ₹200" means strictly below ₹200
      defaultSort="price_asc"
      searchParams={await searchParams}
      showCategoryFacet
      title={`Beautiful finds ${r.label.toLowerCase()}`}
      intro={`Everything currently priced below ${formatINR(r.maxPrice)}. Lower price ranges are included here too.`}
      crumbs={[{ label: "Shop by Budget" }, { label: r.label }]}
      empty={{ title: `Nothing ${r.label.toLowerCase()} right now`, body: "New items arrive often. Try the next price range up, or browse by category.", cta: { label: "All products", href: "/products" } }}
    />
  );
}
