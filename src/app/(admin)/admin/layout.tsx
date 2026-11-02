import Link from "next/link";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { requireStaff } from "@/server/auth";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Signed-out visitors go to /login; signed-in customers without a staff role are turned away.
  const ctx = await requireStaff("/admin");
  const visible = ctx.preview ? null : [...ctx.permissions];

  return (
    <div className="min-h-screen bg-ivory lg:grid lg:grid-cols-[260px_1fr]">
      <AdminSidebar permissions={visible} />
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-4 border-b border-champagne bg-cream/70 px-5 py-4 lg:px-8">
          <p className="truncate text-sm text-taupe">
            {ctx.preview ? "Design preview (no database connected)" : `Signed in as ${ctx.user.email}`}
          </p>
          <div className="flex shrink-0 items-center gap-4 text-sm">
            <Link href="/" className="text-cocoa underline-offset-4 hover:underline">View store</Link>
            {!ctx.preview && (
              <form action="/auth/signout" method="post"><button className="text-taupe hover:text-cocoa">Sign out</button></form>
            )}
          </div>
        </header>
        <main className="px-5 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
