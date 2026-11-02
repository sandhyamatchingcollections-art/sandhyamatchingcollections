import { descendantIds, flattenTree, type AdminCategory } from "@/server/admin/catalog";
import type { ParentOption } from "./CategoryForm";

/** Parent choices: indented by level; excludes the category itself, its subcategories and anything at the depth limit. */
export function parentOptions(tree: AdminCategory[], editing?: AdminCategory): ParentOption[] {
  const blocked = editing ? descendantIds(editing) : new Set<string>();
  if (editing) blocked.add(editing.id);
  return flattenTree(tree).map(({ cat, level }) => ({
    id: cat.id,
    label: `${"— ".repeat(level)}${cat.name}${cat.is_active ? "" : " (hidden)"}`,
    disabled: blocked.has(cat.id) || level >= 3,
  }));
}
