import Link from "next/link";
import { notFound } from "next/navigation";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { PageHeader, btnSecondary } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { PageForm } from "../PageForm";

export const metadata = { title: "Edit page" };
export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await canUse("content.write"))) return <NoAccess what="pages" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { slug } = await params;
  const s = await supabaseForUser();
  const { data: p } = await s.from("content_pages").select("slug, title, body, is_published").eq("slug", slug).maybeSingle();
  if (!p) notFound();
  return (
    <div className="max-w-6xl">
      <PageHeader title={p.title} back={{ href: "/admin/pages", label: "Pages & Policies" }} actions={<Link href={`/pages/${p.slug}`} target="_blank" className={btnSecondary}>View page</Link>} />
      <PageForm v={p} />
    </div>
  );
}
