import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { TaxForm } from "./TaxForm";

export const metadata = { title: "Tax" };
export const dynamic = "force-dynamic";

export default async function TaxPage() {
  if (!(await canUse("settings.store"))) return <NoAccess what="tax settings" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const s = await supabaseForUser();
  const { data: t } = await s.from("store_settings").select("gstin, legal_name, gst_state, address, default_gst_rate, shipping_gst_rate, invoice_prefix").single();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Tax">GST details and rates used on invoices. An invoice is created when an order is marked shipped.</PageHeader>
      <TaxForm v={{ gstin: t?.gstin ?? "", legal_name: t?.legal_name ?? "", gst_state: t?.gst_state ?? "", address: t?.address ?? "",
        default_gst_rate: Number(t?.default_gst_rate ?? 5), shipping_gst_rate: Number(t?.shipping_gst_rate ?? 18), invoice_prefix: t?.invoice_prefix ?? "SMC" }} />
    </div>
  );
}
