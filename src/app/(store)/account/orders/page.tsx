import Link from "next/link";
import { PageShell } from "@/components/store/ListingPage";
import { getStoreSettings } from "@/server/catalog";
import { getUser } from "@/server/auth";
import { myOrders } from "@/server/orders";
import { ButtonLink } from "@/components/ui/primitives";
import { formatINR, whatsappLink } from "@/lib/money";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";

export const metadata = { title: "My Orders", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [s, user] = await Promise.all([getStoreSettings(), getUser()]);
  const orders = user ? await myOrders() : [];
  return (
    <PageShell crumbs={[{ label: "Account", href: "/account" }, { label: "Orders" }]} title="My orders">
      {!user ? (
        <div className="max-w-lg rounded-3xl border border-champagne bg-cream p-8">
          <p className="text-taupe">Sign in to see your orders. Ordered as a guest? Open the order link from your order page, or message us with your order number.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/login?next=/account/orders">Sign in</ButtonLink>
            {s.whatsapp && <ButtonLink variant="outline" href={whatsappLink(s.whatsapp, "Hi, I'd like to check my order status.")}>Ask on WhatsApp</ButtonLink>}
          </div>
        </div>
      ) : orders.length === 0 ? (
        <div className="max-w-lg rounded-3xl border border-champagne bg-cream p-8">
          <p className="text-taupe">No orders yet.</p>
          <ButtonLink href="/products" className="mt-6">Start shopping</ButtonLink>
        </div>
      ) : (
        <ul className="max-w-3xl divide-y divide-champagne rounded-3xl border border-champagne bg-cream">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/order/${o.order_number}`} className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-ivory">
                <span>
                  <span className="font-medium">{o.order_number}</span>
                  <span className="block text-sm text-taupe">{new Date(o.created_at).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })} · {o.payment_method === "cod" ? "Cash on Delivery" : "Online"}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[o.status as OrderStatus]}`}>{STATUS_LABEL[o.status as OrderStatus]}</span>
                  <span className="font-semibold">{formatINR(o.total)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
