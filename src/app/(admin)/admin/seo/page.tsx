import { canUse } from "@/server/auth";
import { SITE_URL, supabaseConfigured } from "@/lib/supabase/env";
import { getStoreSettings } from "@/server/catalog";
import { PageHeader } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { SeoForm } from "./SeoForm";

export const metadata = { title: "SEO Settings" };
export const dynamic = "force-dynamic";

export default async function SeoPage() {
  if (!(await canUse("content.write"))) return <NoAccess what="SEO settings" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const s = await getStoreSettings();
  return (
    <div className="max-w-3xl">
      <PageHeader title="SEO Settings">Help customers find you on Google and make shared links look good.</PageHeader>
      <SeoForm v={{ seo_title: s.seoTitle ?? "", seo_description: s.seoDescription ?? "", og_image_url: s.ogImageUrl ?? "" }}
        fallbackTitle={`${s.name} — ${s.tagline}`} fallbackDescription={s.description} site={SITE_URL} />
    </div>
  );
}
