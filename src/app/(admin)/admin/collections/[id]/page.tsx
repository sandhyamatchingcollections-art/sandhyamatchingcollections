import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, X } from "lucide-react";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";
import { Badge, Card, Notice, PageHeader, btnSecondary, btnSmall, inputCls } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { CollectionForm } from "../CollectionForm";
import { collectionProduct } from "../actions";

export const metadata = { title: "Edit collection" };

export default async function EditCollection({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  if (!(await canUse("catalog.write"))) return <NoAccess what="collections" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { error } = await searchParams;
  const s = await supabaseForUser();
  const [{ data: col }, { data: links }, { data: all }] = await Promise.all([
    s.from("collections").select("*").eq("id", id).maybeSingle(),
    s.from("collection_products").select("product_id, sort_order, products(name, status)").eq("collection_id", id).order("sort_order"),
    s.from("products").select("id, name, status").neq("status", "archived").order("name").limit(1000),
  ]);
  if (!col) notFound();
  type Link_ = { product_id: string; products: { name: string; status: string } | { name: string; status: string }[] | null };
  const items = ((links ?? []) as Link_[]).map((l) => ({ id: l.product_id, ...(Array.isArray(l.products) ? l.products[0] : l.products) }));
  const inIds = new Set(items.map((i) => i.id));
  const addable = (all ?? []).filter((p) => !inIds.has(p.id));

  return (
    <div className="max-w-3xl">
      <PageHeader title={col.title} back={{ href: "/admin/collections", label: "Collections" }}
        actions={<Link href={`/collections/${col.slug}`} target="_blank" className={btnSecondary}><ExternalLink className="size-4" /> Preview</Link>} />
      {error && <div className="mb-4"><Notice tone="error">{error.slice(0, 200)}</Notice></div>}
      <Card><CollectionForm initial={col} /></Card>

      <Card title={`Products (${items.length})`} description="Shown in this order. Only Live, in-stock products appear on the store." className="mt-6">
        <form action={collectionProduct} className="mb-5 flex flex-wrap items-end gap-2">
          <input type="hidden" name="collection_id" value={id} /><input type="hidden" name="op" value="add" />
          <label className="min-w-0 flex-1 text-sm">Add a product
            <select name="product_id" className={inputCls} defaultValue="" required>
              <option value="" disabled>Choose…</option>
              {addable.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status === "draft" ? " (draft)" : ""}</option>)}
            </select>
          </label>
          <SubmitButton pendingText="Adding…">Add</SubmitButton>
        </form>
        {items.length === 0 ? <p className="text-sm text-taupe">No products yet.</p> : (
          <ol className="divide-y divide-champagne/70 rounded-xl border border-champagne">
            {items.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                <span className="w-6 text-taupe">{i + 1}.</span>
                <Link href={`/admin/products/${p.id}`} className="flex-1 hover:underline">{p.name}</Link>
                {p.status !== "active" && <Badge status={p.status ?? "draft"} />}
                {(["up", "down", "remove"] as const).map((op) => (
                  <form key={op} action={collectionProduct}>
                    <input type="hidden" name="collection_id" value={id} /><input type="hidden" name="product_id" value={p.id} />
                    <input type="hidden" name="op" value={op} />
                    <button className={btnSmall} disabled={(op === "up" && i === 0) || (op === "down" && i === items.length - 1)}
                      aria-label={`${op === "remove" ? "Remove" : `Move ${op}`} ${p.name}`}>
                      {op === "up" ? <ArrowUp className="size-3.5" /> : op === "down" ? <ArrowDown className="size-3.5" /> : <X className="size-3.5" />}
                    </button>
                  </form>
                ))}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
