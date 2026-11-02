import { notFound } from "next/navigation";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { BannerForm, type BannerValues } from "../BannerForm";

export const metadata = { title: "Banner" };
export const dynamic = "force-dynamic";
const ymd = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "");

export default async function BannerPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await canUse("content.write"))) return <NoAccess what="banners" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { id } = await params;
  let v: BannerValues = { image_url: "", mobile_image_url: "", alt: "", title: "", subtitle: "", cta_label: "", link: "", text_color: "dark", starts: "", ends: "", is_active: true };
  if (id !== "new") {
    if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
    const s = await supabaseForUser();
    const { data: b } = await s.from("banners").select("*").eq("id", id).maybeSingle();
    if (!b) notFound();
    v = { id: b.id, image_url: b.image_url, mobile_image_url: b.mobile_image_url ?? "", alt: b.alt, title: b.title ?? "", subtitle: b.subtitle ?? "",
      cta_label: b.cta_label ?? "", link: b.link ?? "", text_color: b.text_color, starts: ymd(b.starts_at), ends: ymd(b.ends_at), is_active: b.is_active };
  }
  return (
    <div className="max-w-4xl">
      <PageHeader title={id === "new" ? "New banner" : "Edit banner"} back={{ href: "/admin/banners", label: "Banners" }} />
      <BannerForm v={v} />
    </div>
  );
}
