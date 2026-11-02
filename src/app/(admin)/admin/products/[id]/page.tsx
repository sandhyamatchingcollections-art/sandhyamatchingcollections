import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Copy, ExternalLink, Trash2 } from "lucide-react";
import { canUse } from "@/server/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { adminProduct } from "@/server/admin/catalog";
import { Badge, Card, Notice, PageHeader, btnSecondary, btnSmall, inputCls } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ProductForm } from "../ProductForm";
import { productFormData } from "../form-data";
import { duplicateProduct, imageAction, uploadProductImage } from "../actions";

export const metadata = { title: "Edit product" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; photo_errors?: string; duplicated?: string; saved?: string; error?: string }> };

const rupees = (paise: number | null) => (paise == null ? "" : String(paise / 100));

export default async function EditProduct({ params, searchParams }: Props) {
  if (!(await canUse("catalog.write"))) return <NoAccess what="products" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sp = await searchParams;
  const [product, data] = await Promise.all([adminProduct(id), productFormData()]);
  if (!product) notFound();

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={product.name}
        back={{ href: "/admin/products", label: "Products" }}
        actions={<>
          {product.status === "active" && <Link href={`/p/${product.slug}`} target="_blank" className={btnSecondary}><ExternalLink className="size-4" /> View on store</Link>}
          <form action={duplicateProduct}><input type="hidden" name="id" value={id} />
            <SubmitButton className={btnSecondary} pendingText="Copying…"><Copy className="size-4" /> Duplicate</SubmitButton></form>
        </>}
      >
        <Badge status={product.status} />
      </PageHeader>
      <div className="mb-6 space-y-3">
        {sp.created && <Notice tone="success">Product created{product.images.length ? ` with ${product.images.length} photo${product.images.length === 1 ? "" : "s"}` : ". Add photos below"}{product.status === "draft" ? ", then set it Live when you're ready" : ""}.</Notice>}
        {sp.photo_errors && <Notice tone="error">{Number(sp.photo_errors) || 1} photo(s) couldn&apos;t be uploaded (not a JPEG/PNG/WebP, too small, or unreadable). Add them again below.</Notice>}
        {sp.duplicated && <Notice tone="success">This is a copy, saved as a Draft with new SKUs. Edit it and set it Live when ready.</Notice>}
        {sp.saved && <Notice tone="success">Saved.</Notice>}
        {sp.error && <Notice tone="error">{sp.error.slice(0, 200)}</Notice>}
      </div>

      <Card title="Photos" description="The first photo is the main one. Use the arrows to reorder." className="mb-6">
        {product.images.length > 0 && (
          <ul className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {product.images.map((img, i) => (
              <li key={img.id} className="rounded-xl border border-champagne bg-ivory p-2">
                <Image src={img.url} alt={img.alt} width={300} height={375} unoptimized className="aspect-[4/5] w-full rounded-lg object-cover" />
                {i === 0 && <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-wide text-rose">Main photo</p>}
                <form action={imageAction} className="mt-2">
                  <input type="hidden" name="image_id" value={img.id} /><input type="hidden" name="op" value="alt" />
                  <label className="text-[11px] text-taupe">Description (for screen readers)
                    <input name="alt" defaultValue={img.alt} maxLength={200} className={`${inputCls} h-9 text-xs`} />
                  </label>
                  <button className={`${btnSmall} mt-1 w-full`}>Save description</button>
                </form>
                <div className="mt-2 flex justify-between gap-1">
                  {(["left", "right"] as const).map((op) => (
                    <form key={op} action={imageAction}>
                      <input type="hidden" name="image_id" value={img.id} /><input type="hidden" name="op" value={op} />
                      <button disabled={op === "left" ? i === 0 : i === product.images.length - 1} className={btnSmall} aria-label={`Move photo ${i + 1} ${op}`}>
                        {op === "left" ? <ArrowLeft className="size-3.5" /> : <ArrowRight className="size-3.5" />}
                      </button>
                    </form>
                  ))}
                  <form action={imageAction}>
                    <input type="hidden" name="image_id" value={img.id} /><input type="hidden" name="op" value="delete" />
                    <SubmitButton className={btnSmall} pendingText="…" confirm="Delete this photo?"><Trash2 className="size-3.5" /><span className="sr-only">Delete photo {i + 1}</span></SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <ImageUpload action={uploadProductImage} fields={{ id }} label="Add photos" multiple />
      </Card>

      <ProductForm
        key={`${product.updated_at}-${sp.saved ?? ""}`}
        {...data}
        initial={{
          id: product.id, name: product.name, slug: product.slug, status: product.status, brand: product.brand ?? "",
          description: product.description ?? "", is_featured: product.is_featured, quote_only: product.quote_only,
          seo_title: product.seo_title ?? "", seo_description: product.seo_description ?? "",
          gst_rate: product.gst_rate == null ? "" : String(Number(product.gst_rate)), hsn: product.hsn ?? "",
          categories: product.categories, collections: product.collections, attributes: product.attributes,
          variants: product.variants.map((v) => ({
            id: v.id, sku: v.sku, title: v.title, color: v.options.color ?? "", size: v.options.size ?? "",
            price: rupees(v.price), mrp: rupees(v.mrp), unit: v.unit, min_qty: String(v.min_qty), qty_step: String(v.qty_step),
            max_qty: v.max_qty == null ? "" : String(v.max_qty), track_inventory: v.track_inventory,
            weight_grams: v.weight_grams == null ? "" : String(v.weight_grams), is_active: v.is_active, initial_stock: "", on_hand: v.on_hand - v.reserved,
          })),
        }}
      />
    </div>
  );
}
