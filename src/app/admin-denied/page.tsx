import Link from "next/link";

export const metadata = { title: "No access", robots: { index: false } };

export default function AdminDenied() {
  return (
    <div className="grid min-h-screen place-items-center bg-ivory px-6 text-center">
      <div className="max-w-md">
        <p className="text-[11px] uppercase tracking-[0.3em] text-rose">Staff only</p>
        <h1 className="mt-4 text-4xl font-medium text-cocoa">This area is for store staff</h1>
        <p className="mt-4 text-taupe">Your account doesn&apos;t have admin access. If you work at the store, ask the owner to add you from Admin → Staff.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-full bg-cocoa px-6 text-sm text-cream">Back to the store</Link>
          <form action="/auth/signout" method="post"><button className="min-h-11 rounded-full border border-cocoa/25 px-6 text-sm">Sign out</button></form>
        </div>
      </div>
    </div>
  );
}
