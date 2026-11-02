"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { PhotoPlaceholder } from "@/components/ui/primitives";
import type { Tone } from "@/lib/types";

/** Product photos: thumbnails, hover-zoom on desktop, full-screen view on tap. */
export function Gallery({ images, name, tone }: { images: { url: string; alt: string }[]; name: string; tone: Tone }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [full, setFull] = useState(false);
  const n = images.length;
  const go = (d: number) => setI((x) => (x + d + n) % n);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  if (!n) return <PhotoPlaceholder tone={tone} label={name} className="aspect-[4/5] rounded-3xl" />;
  const img = images[i];

  return (
    <div>
      <button type="button" onClick={() => setFull(true)} aria-label={`Open photo ${i + 1} of ${n} full screen`}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-3xl bg-cream"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}
        onMouseLeave={() => setZoom(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.url} alt={img.alt} className="aspect-[4/5] w-full object-cover transition-transform duration-200"
          style={zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined} />
        <span className="pointer-events-none absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-cream/90 text-cocoa"><ZoomIn className="size-4" /></span>
      </button>
      {n > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="More photos">
          {images.map((im, k) => (
            <li key={im.url} className="shrink-0">
              <button type="button" onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`} aria-current={k === i}
                className={`block overflow-hidden rounded-xl border-2 ${k === i ? "border-cocoa" : "border-transparent"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt="" className="size-16 object-cover sm:size-20" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {full && (
        <div role="dialog" aria-modal="true" aria-label={`${name} photos`} className="fixed inset-0 z-50 flex items-center justify-center bg-cocoa/95 p-4">
          <button type="button" aria-label="Close" onClick={() => setFull(false)} className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-cream text-cocoa"><X className="size-5" /></button>
          {n > 1 && <button type="button" aria-label="Previous photo" onClick={() => go(-1)} className="absolute left-3 grid size-11 place-items-center rounded-full bg-cream text-cocoa"><ChevronLeft className="size-5" /></button>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt={img.alt} className="max-h-[88vh] max-w-full rounded-xl object-contain" />
          {n > 1 && <button type="button" aria-label="Next photo" onClick={() => go(1)} className="absolute right-3 grid size-11 place-items-center rounded-full bg-cream text-cocoa"><ChevronRight className="size-5" /></button>}
          <p className="absolute bottom-4 text-sm text-cream">{i + 1} / {n}</p>
        </div>
      )}
    </div>
  );
}
