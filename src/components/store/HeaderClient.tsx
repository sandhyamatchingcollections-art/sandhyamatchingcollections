"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Heart, Menu, ShoppingBag, X, MessageCircle } from "lucide-react";
import type { Category, StoreSettings } from "@/lib/types";
import { useCart, useWishlist } from "./cart-store";
import { whatsappLink } from "@/lib/money";

const catHref = (c: Category) => `/c/${c.slug}`;

export function HeaderActions() {
  const { count } = useCart();
  const { ids } = useWishlist();
  return (
    <>
      <Link href="/wishlist" aria-label={`Wishlist, ${ids.length} items`} className="relative grid size-11 place-items-center rounded-full hover:bg-cream">
        <Heart className="size-5" strokeWidth={1.6} />
        {ids.length > 0 && <Badge n={ids.length} />}
      </Link>
      <Link href="/cart" aria-label={`Cart, ${count} items`} className="relative grid size-11 place-items-center rounded-full hover:bg-cream">
        <ShoppingBag className="size-5" strokeWidth={1.6} />
        {count > 0 && <Badge n={count} />}
      </Link>
    </>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-cocoa px-1 text-[10px] font-semibold leading-[18px] text-cream">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Desktop category bar. Categories with children open a mega menu on hover or keyboard focus. */
export function DesktopNav({ tree }: { tree: Category[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(null), [pathname]);

  return (
    <nav aria-label="Categories" className="hidden border-t border-champagne/60 lg:block" onMouseLeave={() => setOpen(null)}>
      <ul className="mx-auto flex max-w-7xl items-center justify-center gap-1 px-6">
        <li>
          <Link href="/collections/bridal" className="block px-4 py-3 text-[13px] font-medium tracking-wide text-rose hover:text-cocoa">
            Bridal Collection
          </Link>
        </li>
        {tree.map((c) => {
          const hasKids = (c.children?.length ?? 0) > 0;
          const isOpen = open === c.id;
          return (
            <li key={c.id} className="relative" onMouseEnter={() => setOpen(hasKids ? c.id : null)}>
              <div className="flex items-center">
                <Link href={catHref(c)} className="block py-3 pl-4 pr-1 text-[13px] tracking-wide text-cocoa hover:text-rose">
                  {c.name}
                </Link>
                {hasKids ? (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={`Show ${c.name} subcategories`}
                    onClick={() => setOpen(isOpen ? null : c.id)}
                    className="grid size-7 place-items-center rounded-full text-taupe hover:text-cocoa"
                  >
                    <ChevronDown className={`size-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                ) : (
                  <span className="w-3" />
                )}
              </div>
              {hasKids && isOpen && (
                <div className="absolute left-1/2 top-full z-50 w-64 -translate-x-1/2 rounded-2xl border border-champagne bg-cream p-3 shadow-[0_18px_40px_-20px_rgb(62_44_37/0.35)]">
                  <Link href={catHref(c)} className="block rounded-lg px-3 py-2 text-[13px] font-semibold text-cocoa hover:bg-ivory">
                    All {c.name}
                  </Link>
                  {c.children!.map((s) => (
                    <Link key={s.id} href={catHref(s)} className="block rounded-lg px-3 py-2 text-[13px] text-cocoa-soft hover:bg-ivory hover:text-cocoa">
                      {s.name}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile drawer with expandable categories. */
export function MobileNav({ tree, settings }: { tree: Category[]; settings: StoreSettings }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-full hover:bg-cream lg:hidden">
        <Menu className="size-5" strokeWidth={1.6} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button aria-label="Close menu" className="absolute inset-0 bg-cocoa/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-ivory">
            <div className="flex items-center justify-between border-b border-champagne px-5 py-4">
              <span className="font-display text-xl font-semibold">Shop</span>
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-full hover:bg-cream">
                <X className="size-5" />
              </button>
            </div>
            <ul className="flex-1 px-3 py-2">
              <li>
                <Link href="/collections/bridal" className="block rounded-xl px-3 py-3.5 text-[15px] font-medium text-rose">Bridal Collection</Link>
              </li>
              {tree.map((c) => {
                const kids = c.children ?? [];
                const isOpen = expanded === c.id;
                return (
                  <li key={c.id} className="border-t border-champagne/60">
                    <div className="flex items-center">
                      <Link href={catHref(c)} className="flex-1 px-3 py-3.5 text-[15px] text-cocoa">{c.name}</Link>
                      {kids.length > 0 && (
                        <button
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Hide" : "Show"} ${c.name} subcategories`}
                          onClick={() => setExpanded(isOpen ? null : c.id)}
                          className="grid size-11 place-items-center text-taupe"
                        >
                          <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </button>
                      )}
                    </div>
                    {isOpen && (
                      <ul className="pb-2 pl-4">
                        {kids.map((s) => (
                          <li key={s.id}>
                            <Link href={catHref(s)} className="block px-3 py-2.5 text-[14px] text-cocoa-soft">{s.name}</Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="space-y-2 border-t border-champagne px-5 py-5 text-sm">
              <Link href="/account" className="block py-1.5">My account</Link>
              <Link href="/wishlist" className="block py-1.5">Wishlist</Link>
              {settings.whatsapp && (
                <a href={whatsappLink(settings.whatsapp)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-1.5">
                  <MessageCircle className="size-4" /> Chat on WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
