"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Banner } from "@/lib/types";

/** Image banners: swipeable, auto-advancing (paused on hover/focus and for reduced motion). */
export function BannerSlider({ banners, intervalSeconds }: { banners: Banner[]; intervalSeconds: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<number | null>(null);
  const n = banners.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);

  useEffect(() => {
    if (n < 2 || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => go(1), intervalSeconds * 1000);
    return () => clearInterval(t);
  }, [n, paused, go, intervalSeconds]);

  return (
    <section aria-roledescription="carousel" aria-label="Featured offers" className="mx-auto max-w-7xl px-4 sm:px-6"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
      <div className="relative overflow-hidden rounded-[2rem] bg-cream"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); touch.current = null; }}>
        <div className="flex transition-transform duration-700 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${i * 100}%)` }}>
          {banners.map((b, idx) => {
            const light = b.text_color === "light";
            const inner = (
              <div className="relative aspect-[4/5] w-full sm:aspect-[21/9]">
                <picture>
                  {b.mobile_image_url && <source media="(max-width: 639px)" srcSet={b.mobile_image_url} />}
                  <Image src={b.image_url} alt={b.alt || b.title || "Offer"} fill priority={idx === 0} sizes="(min-width:1280px) 1232px, 100vw" className="object-cover" unoptimized />
                </picture>
                {(b.title || b.subtitle || b.cta_label) && (
                  <div className={`absolute inset-0 flex items-end p-6 sm:items-center sm:p-12 ${light ? "bg-gradient-to-t from-cocoa/60 via-cocoa/10 to-transparent sm:bg-gradient-to-r sm:from-cocoa/55 sm:via-cocoa/15" : "bg-gradient-to-t from-ivory/80 via-ivory/10 to-transparent sm:bg-gradient-to-r sm:from-ivory/85 sm:via-ivory/30"}`}>
                    <div className={`max-w-md ${light ? "text-cream" : "text-cocoa"}`}>
                      {b.title && <p className="font-display text-3xl font-medium leading-tight sm:text-5xl">{b.title}</p>}
                      {b.subtitle && <p className={`mt-3 text-sm sm:text-base ${light ? "text-cream/90" : "text-taupe"}`}>{b.subtitle}</p>}
                      {b.cta_label && b.link && (
                        <span className={`mt-5 inline-flex min-h-11 items-center rounded-full px-6 text-sm font-medium ${light ? "bg-cream text-cocoa" : "bg-cocoa text-cream"}`}>{b.cta_label}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
            return (
              <div key={b.id} className="w-full shrink-0" role="group" aria-roledescription="slide" aria-label={`${idx + 1} of ${n}`} aria-hidden={idx !== i}>
                {b.link ? <Link href={b.link} tabIndex={idx === i ? 0 : -1} className="block">{inner}</Link> : inner}
              </div>
            );
          })}
        </div>
        {n > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous banner" className="absolute left-3 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-cream/90 text-cocoa shadow-sm hover:bg-cream sm:grid"><ChevronLeft className="size-5" /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next banner" className="absolute right-3 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-cream/90 text-cocoa shadow-sm hover:bg-cream sm:grid"><ChevronRight className="size-5" /></button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {banners.map((b, idx) => (
                <button key={b.id} type="button" onClick={() => setI(idx)} aria-label={`Show banner ${idx + 1}`} aria-current={idx === i}
                  className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-cocoa" : "w-1.5 bg-cocoa/35"}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
