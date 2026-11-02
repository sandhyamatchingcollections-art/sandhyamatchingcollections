import Link from "next/link";
import { Plus } from "lucide-react";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { adminCollections } from "@/server/admin/catalog";
import { Badge, PageHeader, btnPrimary } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  if (!(await canUse("catalog.write"))) return <NoAccess what="collections" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const cols = await adminCollections();
  return (
    <div className="max-w-4xl">
      <PageHeader title="Featured collections" actions={<Link href="/admin/collections/new" className={btnPrimary}><Plus className="size-4" /> New collection</Link>}>
        Hand-picked groups of products for the homepage — Bridal, Kurtas, Premium Picks and Bestsellers.
      </PageHeader>
      <ul className="divide-y divide-champagne rounded-2xl border border-champagne bg-cream">
        {cols.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <Link href={`/admin/collections/${c.id}`} className="font-medium hover:underline">{c.title}</Link>
              <p className="text-xs text-taupe">/collections/{c.slug} · {c.product_count} product{c.product_count === 1 ? "" : "s"}</p>
            </div>
            <Badge status={c.is_active ? "visible" : "hidden"} />
          </li>
        ))}
      </ul>
    </div>
  );
}
