import { PageShell } from "@/components/store/ListingPage";
import { getStoreSettings } from "@/server/catalog";
import { getUser } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { myAddresses } from "@/server/orders";
import { onlinePaymentsReady } from "@/server/razorpay";
import { CheckoutForm } from "./CheckoutForm";

export const metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [store, user] = await Promise.all([getStoreSettings(), getUser()]);
  let profile: { full_name: string | null; phone: string | null } | null = null;
  let addresses: Awaited<ReturnType<typeof myAddresses>> = [];
  if (user) {
    const s = await supabaseForUser();
    [{ data: profile }, addresses] = await Promise.all([
      s.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
      myAddresses(),
    ]);
  }
  return (
    <PageShell crumbs={[{ label: "Cart", href: "/cart" }, { label: "Checkout" }]} title="Checkout">
      <CheckoutForm
        signedIn={Boolean(user)}
        defaults={{ email: user?.email ?? "", name: profile?.full_name ?? "", phone: profile?.phone ?? "" }}
        addresses={addresses}
        onlineReady={onlinePaymentsReady && store.onlinePaymentsEnabled}
        whatsapp={store.whatsapp}
        delivery={`${store.deliveryMinDays}–${store.deliveryMaxDays} days`}
      />
    </PageShell>
  );
}
