"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { cartActions } from "@/components/store/cart-store";

/** The order went through: empty this device's cart (once). */
export function ClearCartOnce() {
  useEffect(() => { cartActions.clear(); }, []);
  return null;
}

/** While a payment is being confirmed, check again every 10 seconds. */
export function RefreshSoon() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => {
      const url = new URL(window.location.href); url.searchParams.delete("placed"); url.searchParams.delete("verify");
      try { await navigator.clipboard.writeText(url.toString()); setDone(true); setTimeout(() => setDone(false), 2000); } catch {}
    }} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-cocoa/30 px-4 text-sm hover:border-cocoa">
      {done ? <><Check className="size-4" /> Link copied</> : <><Copy className="size-4" /> Copy order link</>}
    </button>
  );
}
