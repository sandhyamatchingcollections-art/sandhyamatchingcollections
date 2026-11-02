"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A slim bar at the top that starts the moment a link is tapped and finishes when the new page
 * is on screen, so every tap gets instant feedback even on a slow connection.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [width, setWidth] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setWidth(12);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => setWidth((w) => (w < 85 ? w + (90 - w) * 0.12 : w)), 200);
    }
    function onSubmit(e: SubmitEvent) {
      const f = e.target as HTMLFormElement;
      if ((f.method || "get").toLowerCase() === "get" && !e.defaultPrevented) { setWidth(12); }
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("submit", onSubmit, true); };
  }, []);

  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    setWidth((w) => (w > 0 ? 100 : 0));
    const t = setTimeout(() => setWidth(0), 250);
    return () => clearTimeout(t);
  }, [pathname, search]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div className="h-full bg-rose transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${width}%`, opacity: width > 0 && width < 100 ? 1 : width === 100 ? 0.6 : 0 }} />
    </div>
  );
}
