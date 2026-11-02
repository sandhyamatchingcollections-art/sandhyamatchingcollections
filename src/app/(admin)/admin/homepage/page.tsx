import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { Notice, PageHeader, btnSecondary } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { moveSection, toggleSection } from "./actions";
import { SECTION_LABEL } from "./labels";

export const metadata = { title: "Homepage" };
export const dynamic = "force-dynamic";



type Row = { id: string; type: string; is_enabled: boolean; sort_order: number; config: { heading?: string; imageUrl?: string | null } };

export default async function HomepageAdmin({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  if (!(await canUse("content.write"))) return <NoAccess what="the homepage" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const sp = await searchParams;
  const s = await supabaseForUser();
  const { data } = await s.from("homepage_sections").select("id, type, is_enabled, sort_order, config").order("sort_order");
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => r.id);
  const swap = (i: number, j: number) => { const o = [...ids]; [o[i], o[j]] = [o[j], o[i]]; return JSON.stringify(o); };

  return (
    <div className="max-w-4xl">
      <PageHeader title="Homepage" actions={<Link href="/" target="_blank" className={btnSecondary}>View homepage</Link>}>
        Edit text and photos, show or hide sections, and change their order. Changes go live straight away.
      </PageHeader>
      {sp.notice && <div className="mb-4"><Notice tone="success">{sp.notice.slice(0, 200)}</Notice></div>}
      <ol className="divide-y divide-champagne rounded-2xl border border-champagne bg-cream">
        {rows.map((r, i) => (
          <li key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${r.is_enabled ? "" : "opacity-60"}`}>
            <div className="flex flex-col">
              <form action={moveSection}><input type="hidden" name="order" value={i > 0 ? swap(i, i - 1) : JSON.stringify(ids)} />
                <button disabled={i === 0} aria-label={`Move ${SECTION_LABEL[r.type]} up`} className="grid size-7 place-items-center rounded-full hover:bg-ivory disabled:opacity-25"><ArrowUp className="size-4" /></button></form>
              <form action={moveSection}><input type="hidden" name="order" value={i < rows.length - 1 ? swap(i, i + 1) : JSON.stringify(ids)} />
                <button disabled={i === rows.length - 1} aria-label={`Move ${SECTION_LABEL[r.type]} down`} className="grid size-7 place-items-center rounded-full hover:bg-ivory disabled:opacity-25"><ArrowDown className="size-4" /></button></form>
            </div>
            {r.config.imageUrl !== undefined && (
              r.config.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={r.config.imageUrl} alt="" className="size-12 rounded-lg object-cover" />
                : <span className="grid size-12 place-items-center rounded-lg bg-blush text-[10px] text-taupe">no photo</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-taupe">{SECTION_LABEL[r.type] ?? r.type}</p>
              <Link href={`/admin/homepage/${r.id}`} className="font-medium hover:underline">{r.config.heading || SECTION_LABEL[r.type]}</Link>
            </div>
            <form action={toggleSection}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="on" value={r.is_enabled ? "0" : "1"} />
              <button className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-champagne px-3 text-xs hover:border-cocoa/40">
                {r.is_enabled ? <><Eye className="size-3.5" /> Showing</> : <><EyeOff className="size-3.5" /> Hidden</>}</button></form>
            <Link href={`/admin/homepage/${r.id}`} className="min-h-9 rounded-full bg-cocoa px-4 py-2 text-xs font-medium text-cream">Edit</Link>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-taupe">Product rows and feature sections hide themselves when they have no products, so customers never see an empty shelf.</p>
    </div>
  );
}
