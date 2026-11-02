import { getActivePromotions } from "@/server/catalog";
import { EmptyState, PageShell } from "@/components/store/ListingPage";

export const metadata = { title: "Offers" };

export default async function OffersPage() {
  const promos = await getActivePromotions();
  return (
    <PageShell crumbs={[{ label: "Offers" }]} title="Current Offers">
      {promos.length ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {promos.map((p) => <li key={p.id} className="rounded-3xl bg-lavender p-6 text-lg">{p.title}</li>)}
        </ul>
      ) : (
        <EmptyState title="No offers running right now" body="Our festive and seasonal offers appear here as soon as they go live." />
      )}
    </PageShell>
  );
}
