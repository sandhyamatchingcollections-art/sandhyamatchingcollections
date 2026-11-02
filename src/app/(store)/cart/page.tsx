import { PageShell } from "@/components/store/ListingPage";
import { getStoreSettings } from "@/server/catalog";
import { CartView } from "./CartView";

export const metadata = { title: "Your Cart", robots: { index: false } };

export default async function CartPage() {
  const s = await getStoreSettings();
  return (
    <PageShell crumbs={[{ label: "Cart" }]} title="Your Cart">
      <CartView whatsapp={s.whatsapp} storeName={s.name} />
    </PageShell>
  );
}
