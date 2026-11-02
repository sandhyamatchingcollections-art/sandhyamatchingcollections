import "server-only";
import { adminCategoryTree, adminCollections, attributesByCategory, flattenTree } from "@/server/admin/catalog";

/** Everything the product form needs besides the product itself. */
export async function productFormData() {
  const [{ tree, flat }, collections] = await Promise.all([adminCategoryTree(), adminCollections()]);
  return {
    categories: flattenTree(tree).map(({ cat, level }) => ({ id: cat.id, label: cat.name, level, hidden: !cat.is_active })),
    collections: collections.map((c) => ({ id: c.id, title: c.title })),
    attrMap: await attributesByCategory(flat),
  };
}
