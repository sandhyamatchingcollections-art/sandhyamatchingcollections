import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { adminCategoryTree } from "@/server/admin/catalog";
import { PageHeader } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { CategoryForm } from "../CategoryForm";
import { parentOptions } from "../parent-options";

export const metadata = { title: "New category" };

export default async function NewCategory({ searchParams }: { searchParams: Promise<{ parent?: string }> }) {
  if (!(await canUse("catalog.write"))) return <NoAccess what="categories" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { parent } = await searchParams;
  const { tree, flat } = await adminCategoryTree();
  const parentCat = flat.find((c) => c.id === parent);
  return (
    <div className="max-w-3xl">
      <PageHeader title={parentCat ? `New subcategory of ${parentCat.name}` : "New category"} back={{ href: "/admin/categories", label: "Categories" }} />
      <CategoryForm
        initial={{ name: "", slug: "", parent_id: parentCat?.id ?? null, description: null, is_active: true, seo_title: null, seo_description: null }}
        parents={parentOptions(tree)}
      />
      <p className="mt-6 text-sm text-taupe">You can add a photo, banner and filters after creating it.</p>
    </div>
  );
}
