import { notFound } from "next/navigation";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { SECTION_LABEL } from "../labels";
import { SectionEditor } from "./SectionEditor";

export const metadata = { title: "Edit homepage section" };
export const dynamic = "force-dynamic";

export default async function EditSection({ params }: { params: Promise<{ id: string }> }) {
  if (!(await canUse("content.write"))) return <NoAccess what="the homepage" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { id } = await params;
  const s = await supabaseForUser();
  const { data: row } = await s.from("homepage_sections").select("id, type, is_enabled, config").eq("id", id).maybeSingle();
  if (!row) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title={SECTION_LABEL[row.type] ?? row.type} back={{ href: "/admin/homepage", label: "Homepage" }} />
      <SectionEditor id={row.id} type={row.type} initial={row.config} enabled={row.is_enabled} />
    </div>
  );
}
