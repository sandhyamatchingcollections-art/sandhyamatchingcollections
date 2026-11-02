import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus } from "lucide-react";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { adminCategoryTree, type AdminCategory } from "@/server/admin/catalog";
import { Badge, Notice, PageHeader, btnPrimary, btnSmall } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { moveCategory, toggleCategory } from "./actions";

export const metadata = { title: "Categories" };

type Props = { searchParams: Promise<{ deleted?: string; error?: string }> };

export default async function CategoriesPage({ searchParams }: Props) {
  if (!(await canUse("catalog.write"))) return <NoAccess what="categories" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { deleted, error } = await searchParams;
  const { tree, flat } = await adminCategoryTree();

  return (
    <div className="max-w-5xl">
      <PageHeader title="Categories" actions={<Link href="/admin/categories/new" className={btnPrimary}><Plus className="size-4" /> New category</Link>}>
        {flat.length} categories · hidden categories keep their products but don&apos;t appear on the store.
      </PageHeader>
      <div className="space-y-3">
        {deleted && <Notice tone="success">Deleted “{deleted}”.</Notice>}
        {error && <Notice tone="error">{error.slice(0, 200)}</Notice>}
      </div>
      {tree.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-champagne bg-cream p-10 text-center text-taupe">
          No categories yet. Create your first one, e.g. “Sarees”.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {tree.map((c, i) => <CategoryNode key={c.id} cat={c} first={i === 0} last={i === tree.length - 1} level={0} />)}
        </ul>
      )}
    </div>
  );
}

function CategoryNode({ cat, first, last, level }: { cat: AdminCategory; first: boolean; last: boolean; level: number }) {
  const row = (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${cat.is_active ? "" : "opacity-60"}`}>
      <div className="min-w-0 flex-1">
        <Link href={`/admin/categories/${cat.id}`} className="font-medium text-cocoa hover:underline">{cat.name}</Link>
        <span className="ml-2 text-xs text-taupe">/c/{cat.slug}</span>
        <p className="text-xs text-taupe">
          {cat.product_count} product{cat.product_count === 1 ? "" : "s"}
          {cat.children.length > 0 && ` · ${cat.children.length} subcategor${cat.children.length === 1 ? "y" : "ies"}`}
        </p>
      </div>
      <Badge status={cat.is_active ? "visible" : "hidden"} />
      <div className="flex items-center gap-1">
        <form action={moveCategory}>
          <input type="hidden" name="id" value={cat.id} /><input type="hidden" name="dir" value="up" />
          <button disabled={first} className={btnSmall} aria-label={`Move ${cat.name} up`}><ArrowUp className="size-3.5" /></button>
        </form>
        <form action={moveCategory}>
          <input type="hidden" name="id" value={cat.id} /><input type="hidden" name="dir" value="down" />
          <button disabled={last} className={btnSmall} aria-label={`Move ${cat.name} down`}><ArrowDown className="size-3.5" /></button>
        </form>
        <form action={toggleCategory}>
          <input type="hidden" name="id" value={cat.id} /><input type="hidden" name="active" value={String(!cat.is_active)} />
          <button className={btnSmall} aria-label={cat.is_active ? `Hide ${cat.name}` : `Show ${cat.name}`}>
            {cat.is_active ? <><EyeOff className="size-3.5" /> Hide</> : <><Eye className="size-3.5" /> Show</>}
          </button>
        </form>
        {level < 3 && (
          <Link href={`/admin/categories/new?parent=${cat.id}`} className={btnSmall}><Plus className="size-3.5" /> Sub</Link>
        )}
        <Link href={`/admin/categories/${cat.id}`} className={btnSmall}>Edit</Link>
      </div>
    </div>
  );
  if (level === 0) {
    return (
      <li className="overflow-hidden rounded-2xl border border-champagne bg-cream">
        {row}
        {cat.children.length > 0 && (
          <ul className="border-t border-champagne bg-ivory/60">
            {cat.children.map((k, i) => <CategoryNode key={k.id} cat={k} first={i === 0} last={i === cat.children.length - 1} level={1} />)}
          </ul>
        )}
      </li>
    );
  }
  return (
    <li className="border-b border-champagne/70 last:border-b-0" style={{ paddingLeft: `${(level - 1) * 24 + 16}px` }}>
      {row}
      {cat.children.length > 0 && (
        <ul>{cat.children.map((k, i) => <CategoryNode key={k.id} cat={k} first={i === 0} last={i === cat.children.length - 1} level={level + 1} />)}</ul>
      )}
    </li>
  );
}
