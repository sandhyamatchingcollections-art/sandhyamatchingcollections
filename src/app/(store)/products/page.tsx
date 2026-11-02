import { Browse } from "@/components/store/browse/Browse";
import type { SP } from "@/components/store/browse/params";

export const metadata = { title: "All Products" };

export default async function AllProducts({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Browse basePath="/products" base={{}} searchParams={await searchParams} title="All Products"
      crumbs={[{ label: "All Products" }]} showCategoryFacet
      empty={{ title: "Our online shelves are being stocked", body: "Check back soon, or message us on WhatsApp for what's in the shop today." }} />
  );
}
