import { ShieldCheck } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { removeRole } from "./actions";
import { AddStaffForm } from "./AddStaffForm";

export const metadata = { title: "Staff" };

const roleLabel: Record<string, string> = {
  super_admin: "Super Admin", store_manager: "Store Manager", product_manager: "Product Manager", order_manager: "Order Manager",
};
const roleHelp = [
  ["Super Admin", "Everything, including payments and staff."],
  ["Store Manager", "Products, orders, offers, homepage, reports. Not payments or staff."],
  ["Product Manager", "Products, categories and stock only."],
  ["Order Manager", "Orders and customer details only."],
];

type StaffRow = { user_id: string; email: string; roles: string[]; since: string };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: actionError } = await searchParams;
  const ctx = await requireStaff("/admin/staff");
  if (ctx.preview) {
    return <Shell><p className="text-taupe">Connect Supabase to manage staff.</p></Shell>;
  }
  if (!ctx.permissions.has("staff.manage")) {
    return <Shell><p className="text-cocoa">Only a Super Admin can manage staff.</p></Shell>;
  }

  const supabase = await supabaseForUser();
  const { data, error } = await supabase.rpc("list_staff");
  const staff = (data ?? []) as StaffRow[];

  return (
    <Shell>
      {actionError && <p role="alert" className="mb-4 rounded-xl bg-blush px-4 py-3 text-sm text-cocoa">{actionError.slice(0, 200)}</p>}
      {error && <p role="alert" className="rounded-xl bg-blush px-4 py-3 text-sm">Couldn&apos;t load staff: {error.message}</p>}
      <ul className="divide-y divide-champagne rounded-2xl border border-champagne bg-cream">
        {staff.map((s) => (
          <li key={s.user_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{s.email}{s.user_id === ctx.user?.id && <span className="ml-2 text-xs text-taupe">(you)</span>}</p>
              <p className="text-xs text-taupe">Since {new Date(s.since).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {s.roles.map((r) => (
                <form key={r} action={removeRole} className="flex items-center gap-1 rounded-full bg-lavender py-1 pl-3 pr-1 text-xs">
                  {roleLabel[r] ?? r}
                  <input type="hidden" name="user" value={s.user_id} />
                  <input type="hidden" name="role" value={r} />
                  <button aria-label={`Remove ${roleLabel[r]} from ${s.email}`} className="grid size-6 place-items-center rounded-full hover:bg-cream">×</button>
                </form>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-champagne bg-cream p-6">
          <h2 className="text-2xl font-medium">Add a staff member</h2>
          <p className="mt-1 text-sm text-taupe">They must sign in to the store once first, so their account exists.</p>
          <AddStaffForm />
        </div>
        <dl className="space-y-3 text-sm">
          {roleHelp.map(([r, d]) => (
            <div key={r}><dt className="font-medium">{r}</dt><dd className="text-taupe">{d}</dd></div>
          ))}
        </dl>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl">
      <h1 className="mb-8 flex items-center gap-3 text-4xl font-medium"><ShieldCheck className="size-7" strokeWidth={1.4} /> Staff & Roles</h1>
      {children}
    </div>
  );
}
