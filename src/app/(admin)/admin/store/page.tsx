import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { StoreForm } from "./StoreForm";

export const metadata = { title: "Store Settings" };
export const dynamic = "force-dynamic";

export default async function StorePage() {
  if (!(await canUse("settings.store"))) return <NoAccess what="store settings" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const s = await supabaseForUser();
  const { data: d } = await s.from("store_settings").select("*").single();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Store Settings">Name, contact details and short texts used across the whole store.</PageHeader>
      <StoreForm v={{ name: d?.name ?? "", tagline: d?.tagline ?? "", description: d?.description ?? "", announcement: d?.announcement ?? "",
        shipping_note: d?.shipping_note ?? "", returns_note: d?.returns_note ?? "", whatsapp: d?.whatsapp ?? "", instagram_url: d?.instagram_url ?? "",
        instagram_handle: d?.instagram_handle ?? "", facebook_url: d?.facebook_url ?? "", email: d?.email ?? "", phone: d?.phone ?? "",
        address: d?.address ?? "", new_arrival_days: d?.new_arrival_days ?? 30 }} />
    </div>
  );
}
