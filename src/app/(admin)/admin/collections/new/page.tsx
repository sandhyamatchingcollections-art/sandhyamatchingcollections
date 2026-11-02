import { canUse } from "@/server/auth";
import { PageHeader, Card } from "@/components/admin/ui";
import { NoAccess } from "@/components/admin/NoAccess";
import { CollectionForm } from "../CollectionForm";

export const metadata = { title: "New collection" };

export default async function NewCollection() {
  if (!(await canUse("catalog.write"))) return <NoAccess what="collections" />;
  return (
    <div className="max-w-3xl">
      <PageHeader title="New collection" back={{ href: "/admin/collections", label: "Collections" }} />
      <Card><CollectionForm initial={{ title: "", slug: "", description: null, is_active: true }} /></Card>
    </div>
  );
}
