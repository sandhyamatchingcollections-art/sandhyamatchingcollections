import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { getStoreSettings } from "@/server/catalog";
import { PageHeader } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { ShippingForm } from "./ShippingForm";

export const metadata = { title: "Shipping" };
export const dynamic = "force-dynamic";
const r = (p: number | null) => (p == null ? "" : String(p / 100));

export default async function ShippingPage() {
  if (!(await canUse("settings.store"))) return <NoAccess what="shipping settings" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const s = await getStoreSettings();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Shipping">Delivery charges and Cash on Delivery rules used at checkout.</PageHeader>
      <ShippingForm v={{ shipping_fee: r(s.shippingFee), free_shipping_min: r(s.freeShippingMin), cod_enabled: s.codEnabled, cod_fee: r(s.codFee),
        cod_max_total: r(s.codMaxTotal), delivery_min_days: s.deliveryMinDays, delivery_max_days: s.deliveryMaxDays }} />
    </div>
  );
}
