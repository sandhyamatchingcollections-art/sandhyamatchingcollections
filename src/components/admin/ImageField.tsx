"use client";

import { useState, useTransition } from "react";
import { ImagePlus, X } from "lucide-react";
import { shrinkImage } from "./ImageUpload";
import { btnSecondary } from "./ui";
import { uploadCampaignImage } from "@/app/(admin)/admin/_shared/upload";

/** Pick a photo → it's resized, uploaded, and its address is kept in the form (hidden input `name`). */
export function ImageField({ name, value, onChange, folder = "home", aspect = "aspect-[4/3]", hint }: {
  name?: string; value: string | null; onChange?: (url: string | null) => void; folder?: string; aspect?: string; hint?: string;
}) {
  const [url, setUrl] = useState<string | null>(value);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (u: string | null) => { setUrl(u); onChange?.(u); };
  return (
    <div>
      {name && <input type="hidden" name={name} value={url ?? ""} />}
      <div className={`relative w-full max-w-sm overflow-hidden rounded-2xl border border-champagne bg-ivory ${aspect}`}>
        {url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="" className="h-full w-full object-cover" />
          : <span className="absolute inset-0 grid place-items-center text-sm text-taupe">No photo yet — a soft placeholder shows</span>}
        {url && (
          <button type="button" onClick={() => set(null)} aria-label="Remove photo" className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-cream/90 text-cocoa hover:bg-cream"><X className="size-4" /></button>
        )}
      </div>
      <label className={`${btnSecondary} mt-3 cursor-pointer ${pending ? "pointer-events-none opacity-60" : ""}`}>
        <ImagePlus className="size-4" /> {pending ? "Uploading…" : url ? "Replace photo" : "Upload photo"}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (!f) return;
          setError("");
          start(async () => {
            const fd = new FormData(); fd.set("folder", folder); fd.set("file", await shrinkImage(f));
            const r = await uploadCampaignImage(null, fd);
            if (r.url) set(r.url); else setError(r.error ?? "Upload failed.");
          });
        }} />
      </label>
      {error && <p role="alert" className="mt-1 text-xs text-rose">{error}</p>}
      {hint && <p className="mt-1 text-xs text-taupe">{hint}</p>}
    </div>
  );
}
