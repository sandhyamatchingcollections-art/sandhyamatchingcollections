import { PageShell } from "@/components/store/ListingPage";
import { WishlistView } from "./WishlistView";

export const metadata = { title: "Wishlist", robots: { index: false } };

export default function WishlistPage() {
  return (
    <PageShell crumbs={[{ label: "Wishlist" }]} title="Your Wishlist">
      <WishlistView />
    </PageShell>
  );
}
