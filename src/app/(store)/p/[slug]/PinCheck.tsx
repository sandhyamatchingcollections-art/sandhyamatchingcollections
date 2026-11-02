"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";

const KEY = "smc.pincode.v1";

/** PIN code delivery estimate. Courier-level serviceability arrives with checkout (Phase 7). */
export function PinCheck({ minDays, maxDays }: { minDays: number; maxDays: number }) {
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function check(p: string) {
    if (!/^[1-9][0-9]{5}$/.test(p)) { setResult({ ok: false, text: "Enter a valid 6-digit PIN code." }); return; }
    const d = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
    setResult({ ok: true, text: `Delivery to ${p} in ${minDays}–${maxDays} days (around ${d(minDays)} – ${d(maxDays)}).` });
    try { localStorage.setItem(KEY, p); } catch {}
  }

  useEffect(() => {
    try { const saved = localStorage.getItem(KEY); if (saved) { setPin(saved); check(saved); } } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-champagne bg-cream p-4">
      <form onSubmit={(e) => { e.preventDefault(); check(pin); }} className="flex items-center gap-2">
        <MapPin className="size-4 shrink-0 text-taupe" />
        <label htmlFor="pin" className="sr-only">Delivery PIN code</label>
        <input id="pin" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Enter PIN code"
          className="h-10 min-w-0 flex-1 rounded-full border border-champagne bg-ivory px-4 text-sm" />
        <button className="h-10 rounded-full border border-cocoa/30 px-4 text-sm hover:border-cocoa">Check</button>
      </form>
      {result && <p role="status" className={`mt-2 text-sm ${result.ok ? "text-sage-deep" : "text-rose"}`}>{result.text}</p>}
    </div>
  );
}
