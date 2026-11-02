import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { Card, PageHeader, btnSecondary } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { ImportFlow } from "./ImportFlow";

export const metadata = { title: "Import products" };

export default async function ImportPage() {
  if (!(await canUse("catalog.write"))) return <NoAccess what="products" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  return (
    <div className="max-w-5xl">
      <PageHeader title="Import products" back={{ href: "/admin/products", label: "Products" }}>
        Add many products at once from a spreadsheet. You&apos;ll see a preview and any problems before anything is saved.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ImportFlow />
        <Card title="How to prepare the file">
          <ol className="list-decimal space-y-2 pl-4 text-sm text-cocoa-soft">
            <li><a href="/admin/products/import/template" download className="underline">Download the template</a> and open it in Excel or Google Sheets.</li>
            <li>One row per product. <strong>sku, name, category, price</strong> are required.</li>
            <li><strong>category</strong>: the category name or web address, e.g. “Silk Sarees”.</li>
            <li><strong>unit</strong>: piece, metre, yard or set. Fabrics: metre with qty_step 0.5.</li>
            <li>Prices in rupees, e.g. 450 or 450.50.</li>
            <li><strong>collections</strong> (optional): e.g. “Bridal Collection; Premium Picks”.</li>
            <li>Save as <strong>CSV UTF-8</strong>.</li>
          </ol>
          <p className="mt-4 text-xs text-taupe">Products with several colours or sizes: import one, then add variants on its page.</p>
          <a href="/admin/products/import/template" download className={`${btnSecondary} mt-4 w-full`}>Download template</a>
        </Card>
      </div>
    </div>
  );
}
