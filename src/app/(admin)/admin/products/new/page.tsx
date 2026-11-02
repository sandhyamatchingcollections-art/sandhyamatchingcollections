import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { PageHeader } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { ProductForm } from "../ProductForm";
import { blankVariant } from "../product-draft";
import { productFormData } from "../form-data";

export const metadata = { title: "New product" };

export default async function NewProduct({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  if (!(await canUse("catalog.write"))) return <NoAccess what="products" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { category } = await searchParams;
  const data = await productFormData();
  const preset = data.categories.find((c) => c.id === category);
  return (
    <div className="max-w-6xl">
      <PageHeader title="New product" back={{ href: "/admin/products", label: "Products" }}>
        Fill in the details and add photos — everything is saved together.
      </PageHeader>
      <ProductForm
        {...data}
        initial={{
          name: "", slug: "", status: "draft", brand: "", description: "", is_featured: false, quote_only: false,
          seo_title: "", seo_description: "", gst_rate: "", hsn: "", categories: preset ? [{ id: preset.id, primary: true }] : [], collections: [],
          attributes: {}, variants: [blankVariant()],
        }}
      />
    </div>
  );
}
