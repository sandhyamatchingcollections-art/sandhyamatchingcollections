import Link from "next/link";
import { Download, Plus, Upload } from "lucide-react";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { adminCategoryTree, adminProducts, flattenTree } from "@/server/admin/catalog";
import { Notice, PageHeader, Pagination, btnPrimary, btnSecondary, inputCls } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { ProductTable } from "./ProductTable";

export const metadata = { title: "Products" };

type SP = { q?: string; status?: string; category?: string; page?: string; notice?: string; error?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await canUse("catalog.write"))) return <NoAccess what="products" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total, pages }, { tree }] = await Promise.all([
    adminProducts({ q: sp.q, status: sp.status, category: sp.category, page }),
    adminCategoryTree(),
  ]);
  const cats = flattenTree(tree).map(({ cat, level }) => ({ id: cat.id, label: `${"— ".repeat(level)}${cat.name}` }));
  const qs = (patch: Partial<SP>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, status: sp.status, category: sp.category, ...patch })) if (v) u.set(k, String(v));
    const s = u.toString();
    return `/admin/products${s ? `?${s}` : ""}`;
  };
  const filtered = Boolean(sp.q || sp.status || sp.category);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Products"
        actions={<>
          <Link href="/admin/products/import" className={btnSecondary}><Upload className="size-4" /> Import CSV</Link>
          {/* A file download, not a page: a plain link is correct here. */}
          <a href="/admin/products/export" download className={btnSecondary}><Download className="size-4" /> Export CSV</a>
          <Link href="/admin/products/new" className={btnPrimary}><Plus className="size-4" /> New product</Link>
        </>}
      >
        {total} product{total === 1 ? "" : "s"}{filtered ? " match" : ""}
      </PageHeader>

      <div className="mb-4 space-y-3">
        {sp.notice && <Notice tone="success">{sp.notice.slice(0, 200)}</Notice>}
        {sp.error && <Notice tone="error">{sp.error.slice(0, 200)}</Notice>}
      </div>

      <form className="mb-5 grid gap-3 rounded-2xl border border-champagne bg-cream p-4 sm:grid-cols-[2fr_1fr_1.5fr_auto]" role="search">
        <label className="text-xs text-taupe">Search
          <input name="q" defaultValue={sp.q} placeholder="Name or SKU" className={inputCls} />
        </label>
        <label className="text-xs text-taupe">Status
          <select name="status" defaultValue={sp.status ?? ""} className={inputCls}>
            <option value="">All</option><option value="active">Live</option><option value="draft">Draft</option><option value="archived">Archived</option>
          </select>
        </label>
        <label className="text-xs text-taupe">Category
          <select name="category" defaultValue={sp.category ?? ""} className={inputCls}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className={btnSecondary}>Filter</button>
          {filtered && <Link href="/admin/products" className="pb-3 text-xs text-taupe underline">Clear</Link>}
        </div>
      </form>

      <ProductTable rows={rows} categories={cats} back={qs({ page: page > 1 ? String(page) : undefined })} empty={
        filtered ? "No products match these filters." : "No products yet. Add your first one, or import a CSV."
      } />
      <Pagination page={page} pages={pages} hrefFor={(n) => qs({ page: String(n) })} />
    </div>
  );
}
