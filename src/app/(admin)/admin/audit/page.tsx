import Link from "next/link";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { EmptyRow, PageHeader, Pagination, td, th } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";

export const metadata = { title: "Audit Log" };
export const dynamic = "force-dynamic";
const PER = 40;
const ENTITY: Record<string, string> = {
  products: "Product", product_variants: "Variant", categories: "Category", collections: "Collection", store_settings: "Store settings",
  homepage_sections: "Homepage", promotions: "Offer", user_roles: "Staff role", coupons: "Coupon", banners: "Banner", refunds: "Refund",
  product_reviews: "Review", content_pages: "Page",
};
const IGNORE = new Set(["updated_at", "created_at"]);

function changes(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  if (!before && after) return String(after.name ?? after.title ?? after.code ?? after.sku ?? after.slug ?? after.role ?? "");
  if (before && !after) return String(before.name ?? before.title ?? before.code ?? before.sku ?? before.slug ?? before.role ?? "");
  const keys = Object.keys(after ?? {}).filter((k) => !IGNORE.has(k) && JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
  const label = String(after?.name ?? after?.title ?? after?.code ?? after?.sku ?? after?.slug ?? "");
  const shown = keys.slice(0, 4).map((k) => {
    const v = (x: unknown) => (x == null ? "—" : typeof x === "object" ? "…" : String(x).slice(0, 40));
    return `${k.replace(/_/g, " ")}: ${v(before?.[k])} → ${v(after?.[k])}`;
  });
  return [label, shown.join(" · "), keys.length > 4 ? `+${keys.length - 4} more` : ""].filter(Boolean).join(" — ");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; page?: string }> }) {
  if (!(await canUse("audit.view"))) return <NoAccess what="the audit log" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const s = await supabaseForUser();
  let q = s.from("audit_logs").select("id, actor_id, action, entity, entity_id, before, after, created_at", { count: "exact" })
    .order("created_at", { ascending: false }).range((page - 1) * PER, page * PER - 1);
  if (sp.entity && ENTITY[sp.entity]) q = q.eq("entity", sp.entity);
  const [{ data, count }, { data: staff }] = await Promise.all([q, s.rpc("list_staff")]);
  const who = new Map(((staff ?? []) as { user_id: string; email: string }[]).map((x) => [x.user_id, x.email]));
  const rows = (data ?? []) as { id: number; actor_id: string | null; action: string; entity: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; created_at: string }[];
  return (
    <div className="max-w-6xl">
      <PageHeader title="Audit Log">Who changed what, and when. Kept automatically; nobody can edit it.</PageHeader>
      <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/admin/audit" className={`rounded-full px-3 py-1.5 text-xs ${!sp.entity ? "bg-cocoa text-cream" : "border border-champagne bg-cream"}`}>All</Link>
        {Object.entries(ENTITY).map(([k, l]) => (
          <Link key={k} href={`/admin/audit?entity=${k}`} className={`rounded-full px-3 py-1.5 text-xs ${sp.entity === k ? "bg-cocoa text-cream" : "border border-champagne bg-cream"}`}>{l}</Link>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-2xl border border-champagne bg-cream">
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-champagne"><tr><th className={th}>When</th><th className={th}>Who</th><th className={th}>What</th><th className={th}>Details</th></tr></thead>
          <tbody className="divide-y divide-champagne/70">
            {rows.length === 0 && <EmptyRow cols={4}>Nothing recorded yet.</EmptyRow>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={`${td} whitespace-nowrap text-xs`}>{new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</td>
                <td className={`${td} text-xs`}>{r.actor_id ? who.get(r.actor_id) ?? "Former staff" : "System"}</td>
                <td className={td}>{ENTITY[r.entity] ?? r.entity} <span className="text-taupe">{r.action === "insert" ? "added" : r.action === "delete" ? "deleted" : "changed"}</span></td>
                <td className={`${td} text-xs text-taupe`}>{changes(r.before, r.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={Math.max(1, Math.ceil((count ?? 0) / PER))} hrefFor={(n) => `/admin/audit?${new URLSearchParams({ ...(sp.entity ? { entity: sp.entity } : {}), page: String(n) })}`} />
    </div>
  );
}
