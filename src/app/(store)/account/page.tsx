import Link from "next/link";
import { PageShell } from "@/components/store/ListingPage";
import { ButtonLink } from "@/components/ui/primitives";
import { getPermissions, getUser } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";
import { deleteAddress } from "./actions";
import { myAddresses } from "@/server/orders";

export const metadata = { title: "My Account", robots: { index: false } };

export default async function AccountPage() {
  const user = await getUser();

  if (!user) {
    return (
      <PageShell crumbs={[{ label: "Account" }]} title="My Account">
        <div className="max-w-lg rounded-3xl border border-champagne bg-cream p-8">
          <h2 className="text-2xl font-medium">Sign in to your account</h2>
          <p className="mt-3 text-taupe">See your details and orders. We&apos;ll email you a secure link — no password to remember.</p>
          <ButtonLink href="/login?next=/account" className="mt-6">Sign in</ButtonLink>
        </div>
      </PageShell>
    );
  }

  const supabase = await supabaseForUser();
  const [{ data: profile }, perms, addresses] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
    getPermissions(),
    myAddresses(),
  ]);

  return (
    <PageShell crumbs={[{ label: "Account" }]} title={profile?.full_name ? `Hello, ${profile.full_name.split(" ")[0]}` : "My Account"}>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-3xl border border-champagne bg-cream p-7">
          <h2 className="text-2xl font-medium">Your details</h2>
          <p className="mt-1 text-sm text-taupe">Signed in as {user.email}</p>
          <ProfileForm fullName={profile?.full_name ?? ""} phone={profile?.phone ?? ""} />
          <h2 className="mt-10 text-2xl font-medium">Saved addresses</h2>
          {addresses.length === 0 ? (
            <p className="mt-2 text-sm text-taupe">Addresses you save at checkout appear here.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {addresses.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-4 rounded-2xl border border-champagne bg-ivory p-4 text-sm">
                  <span><span className="font-medium">{a.full_name}</span> · {a.phone}{a.is_default && <span className="ml-2 rounded-full bg-lavender px-2 py-0.5 text-[11px]">Default</span>}<br />
                    <span className="text-taupe">{[a.line1, a.line2, a.landmark, a.city, a.state].filter(Boolean).join(", ")} – {a.pincode}</span></span>
                  <form action={deleteAddress}><input type="hidden" name="id" value={a.id} />
                    <button className="text-xs text-taupe hover:text-rose" aria-label={`Delete address ${a.line1}`}>Delete</button></form>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="space-y-3">
          <Link href="/account/orders" className="block rounded-2xl border border-champagne bg-cream p-5 hover:border-cocoa/40">
            <span className="font-medium">Orders</span>
            <span className="block text-sm text-taupe">Track orders and see past purchases.</span>
          </Link>
          <Link href="/wishlist" className="block rounded-2xl border border-champagne bg-cream p-5 hover:border-cocoa/40">
            <span className="font-medium">Wishlist</span>
          </Link>
          {perms.size > 0 && (
            <Link href="/admin" className="block rounded-2xl bg-lavender p-5">
              <span className="font-medium">Store admin</span>
              <span className="block text-sm text-cocoa-soft">Manage products, categories and the homepage.</span>
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <button className="min-h-11 w-full rounded-full border border-cocoa/25 text-sm hover:border-cocoa">Sign out</button>
          </form>
        </aside>
      </div>
    </PageShell>
  );
}
