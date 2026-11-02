import { notFound } from "next/navigation";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { adminCategoryTree, descendantIds, flattenTree } from "@/server/admin/catalog";
import { PageHeader } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { DeleteCategoryForm } from "./DeleteCategoryForm";

export const metadata = { title: "Delete category" };

export default async function DeleteCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await canUse("catalog.write"))) return <NoAccess what="categories" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { id } = await params;
  const { tree, flat } = await adminCategoryTree();
  const cat = flat.find((c) => c.id === id);
  if (!cat) notFound();
  const blocked = descendantIds(cat); blocked.add(cat.id);
  const targets = flattenTree(tree).filter(({ cat: c }) => !blocked.has(c.id))
    .map(({ cat: c, level }) => ({ id: c.id, label: `${"— ".repeat(level)}${c.name}` }));

  return (
    <div className="max-w-2xl">
      <PageHeader title={`Delete “${cat.name}”?`} back={{ href: `/admin/categories/${id}`, label: cat.name }} />
      <DeleteCategoryForm id={id} name={cat.name} products={cat.product_count} childCount={cat.children.length} targets={targets} />
    </div>
  );
}
