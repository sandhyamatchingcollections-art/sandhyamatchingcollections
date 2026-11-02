import { notFound } from "next/navigation";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { CouponForm, type CouponValues } from "../CouponForm";

export const metadata = { title: "Coupon" };
export const dynamic = "force-dynamic";
const r = (p: number | null) => (p == null ? "" : String(p / 100));
const ymd = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "");

export default async function CouponPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await canUse("promotions.write"))) return <NoAccess what="coupons" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { id } = await params;
  let initial: CouponValues = { code: "", description: "", kind: "percent", value: "10", min_subtotal: "", max_discount: "", starts: "", ends: "",
    usage_limit: "", per_customer_limit: "1", first_order_only: false, is_active: true };
  if (id !== "new") {
    if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
    const s = await supabaseForUser();
    const { data: c } = await s.from("coupons").select("*").eq("id", id).maybeSingle();
    if (!c) notFound();
    initial = { id: c.id, code: c.code, description: c.description ?? "", kind: c.kind, value: c.kind === "percent" ? String(c.value) : c.kind === "flat" ? r(Number(c.value)) : "0",
      min_subtotal: c.min_subtotal ? r(Number(c.min_subtotal)) : "", max_discount: r(c.max_discount == null ? null : Number(c.max_discount)), starts: ymd(c.starts_at), ends: ymd(c.ends_at),
      usage_limit: c.usage_limit == null ? "" : String(c.usage_limit), per_customer_limit: c.per_customer_limit == null ? "" : String(c.per_customer_limit),
      first_order_only: c.first_order_only, is_active: c.is_active };
  }
  return (
    <div className="max-w-3xl">
      <PageHeader title={id === "new" ? "New coupon" : `Coupon ${initial.code}`} back={{ href: "/admin/coupons", label: "Coupons" }} />
      <CouponForm initial={initial} />
    </div>
  );
}
