import { notFound } from "next/navigation";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { OfferForm } from "../OfferForm";

export const metadata = { title: "Offer" };
export const dynamic = "force-dynamic";
const ymd = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "");

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await canUse("promotions.write"))) return <NoAccess what="offers" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { id } = await params;
  let v = { title: "", description: "", starts: "", ends: "", is_active: true } as { id?: string; title: string; description: string; starts: string; ends: string; is_active: boolean };
  if (id !== "new") {
    if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
    const s = await supabaseForUser();
    const { data: o } = await s.from("promotions").select("*").eq("id", id).maybeSingle();
    if (!o) notFound();
    v = { id: o.id, title: o.title, description: o.description ?? "", starts: ymd(o.starts_at), ends: ymd(o.ends_at), is_active: o.is_active };
  }
  return (
    <div className="max-w-3xl">
      <PageHeader title={id === "new" ? "New offer" : "Edit offer"} back={{ href: "/admin/offers", label: "Offers" }} />
      <OfferForm v={v} />
    </div>
  );
}
