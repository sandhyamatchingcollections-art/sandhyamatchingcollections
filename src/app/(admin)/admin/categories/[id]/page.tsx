import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import { canUse } from "@/server/auth";
import { storageUrl, supabaseConfigured } from "@/lib/supabase/env";
import { adminCategory, adminCategoryTree } from "@/server/admin/catalog";
import { Card, Notice, PageHeader, btnDanger, btnSecondary, btnSmall } from "@/components/admin/ui";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { CategoryForm } from "../CategoryForm";
import { AttributesEditor } from "../AttributesEditor";
import { parentOptions } from "../parent-options";
import { removeCategoryImage, uploadCategoryImage } from "../actions";

export const metadata = { title: "Edit category" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> };

export default async function EditCategory({ params, searchParams }: Props) {
  if (!(await canUse("catalog.write"))) return <NoAccess what="categories" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { created } = await searchParams;
  const [{ category, attributes }, { tree, flat }] = await Promise.all([adminCategory(id), adminCategoryTree()]);
  if (!category) notFound();
  const node = flat.find((c) => c.id === id)!;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={category.name}
        back={{ href: "/admin/categories", label: "Categories" }}
        actions={<>
          <Link href={`/c/${category.slug}`} target="_blank" className={btnSecondary}><ExternalLink className="size-4" /> Preview</Link>
          <Link href={`/admin/categories/${id}/delete`} className={btnDanger}><Trash2 className="size-4" /> Delete</Link>
        </>}
      >
        {node.product_count} products · {node.children.length} subcategories
      </PageHeader>
      {created && <div className="mb-6"><Notice tone="success">Category created. Add a photo or filters below, or add products to it.</Notice></div>}

      <CategoryForm initial={category} parents={parentOptions(tree, node)} />

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {(["image", "banner"] as const).map((kind) => {
          const url = storageUrl("product-images", kind === "image" ? category.image_path : category.banner_path);
          return (
            <Card key={kind} title={kind === "image" ? "Category photo" : "Page banner"}
              description={kind === "image" ? "Shown on the category tiles." : "Wide image at the top of the category page."}>
              {url ? (
                <div className="mb-4">
                  <Image src={url} alt="" width={400} height={kind === "image" ? 400 : 160} unoptimized
                    className={`w-full rounded-xl border border-champagne object-cover ${kind === "image" ? "aspect-square" : "aspect-[5/2]"}`} />
                  <form action={removeCategoryImage} className="mt-2">
                    <input type="hidden" name="id" value={id} /><input type="hidden" name="kind" value={kind} />
                    <button className={btnSmall}>Remove</button>
                  </form>
                </div>
              ) : null}
              <ImageUpload action={uploadCategoryImage} fields={{ id, kind }} label={url ? "Replace" : "Upload"} />
            </Card>
          );
        })}
      </div>

      <Card title="Filters" description="What shoppers can filter by in this category, e.g. Fabric or Colour." className="mt-6">
        <AttributesEditor categoryId={id} initial={attributes} />
      </Card>
    </div>
  );
}
