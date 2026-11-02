"use client";

import Link from "next/link";

export function EmptyStateClient({ title = "Your cart is empty", body = "Browse our collections and add something you love." }: { title?: string; body?: string }) {
  return (
    <div className="weave rounded-3xl border border-champagne bg-cream px-6 py-16 text-center">
      <h2 className="text-3xl font-medium text-cocoa">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-taupe">{body}</p>
      <Link href="/c" className="mt-7 inline-flex min-h-11 items-center rounded-full bg-cocoa px-6 text-sm font-medium text-cream hover:bg-cocoa-soft">
        Start shopping
      </Link>
    </div>
  );
}
