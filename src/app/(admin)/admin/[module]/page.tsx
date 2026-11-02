import { notFound } from "next/navigation";
import { allModules } from "@/components/admin/modules";
import { requireStaff, type Permission } from "@/server/auth";

type Props = { params: Promise<{ module: string }> };

export default async function AdminModulePage({ params }: Props) {
  const { module } = await params;
  const m = allModules.find((x) => x.slug === module);
  if (!m) notFound();
  const ctx = await requireStaff(`/admin/${module}`);
  const Icon = m.icon;
  const allowed = ctx.preview || !m.perm || ctx.permissions.has(m.perm as Permission);
  return (
    <div className="max-w-3xl">
      <h1 className="flex items-center gap-3 text-4xl font-medium"><Icon className="size-7" strokeWidth={1.4} /> {m.label}</h1>
      <div className="mt-8 rounded-3xl border border-dashed border-champagne bg-cream p-8">
        {allowed ? (
          <>
            <p className="text-cocoa">This module is scheduled for <strong>Phase {m.phase}</strong>.</p>
            <p className="mt-2 text-sm text-taupe">The database tables and security rules are ready; the screens arrive in that phase.</p>
          </>
        ) : (
          <p className="text-cocoa">Your role doesn&apos;t include access to {m.label}. Ask a Super Admin if you need it.</p>
        )}
      </div>
    </div>
  );
}
