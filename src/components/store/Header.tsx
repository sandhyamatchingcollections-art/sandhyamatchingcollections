import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { Search, User } from "lucide-react";
import { getActivePromotions, getCategoryTree, getStoreSettings } from "@/server/catalog";
import { DesktopNav, MobileNav, HeaderActions } from "./HeaderClient";
import { SearchBox } from "./SearchBox";

// The owner drops their logo at public/logo.png; until then the wordmark shows alone.
const hasLogo = true;

export function Logo({ name, compact = false }: { name: string; compact?: boolean }) {
  const [first, ...rest] = name.split(" ");
  return (
    <Link href="/" className="flex items-center gap-3" aria-label={`${name} — home`}>
      {hasLogo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/logo.png" alt="" className={compact ? "h-10 w-auto" : "h-11 w-auto sm:h-12"} />
      )}
      <span className="leading-none">
        <span className="font-display block text-[22px] font-semibold text-cocoa sm:text-[26px]">{first}</span>
        <span className="mt-0.5 block text-[9.5px] uppercase tracking-[0.32em] text-taupe sm:text-[10px]">{rest.join(" ")}</span>
      </span>
    </Link>
  );
}

export async function Header() {
  const [settings, tree, promos] = await Promise.all([getStoreSettings(), getCategoryTree(), getActivePromotions()]);
  // Owner's announcement first, then a live offer, then the tagline.
  const announcement = settings.announcement ?? promos[0]?.title ?? `${settings.tagline} · ${settings.shippingNote}`;

  return (
    <header className="sticky top-0 z-40 border-b border-champagne/70 bg-ivory/95 backdrop-blur supports-[backdrop-filter]:bg-ivory/85">
      <div className="bg-blush/70 px-4 py-2 text-center text-[12px] tracking-wide text-cocoa">
        <Link href={!settings.announcement && promos[0] ? "/offers" : "/c"} className="hover:underline underline-offset-4">
          {announcement}
        </Link>
      </div>

      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:gap-8 lg:py-4">
        <MobileNav tree={tree} settings={settings} />
        <Logo name={settings.name} />

        <div className="ml-auto hidden max-w-md flex-1 md:block">
          <SearchBox compact />
        </div>

        <div className="ml-auto flex items-center gap-0.5 md:ml-0">
          <Link href="/search" aria-label="Search" className="grid size-11 place-items-center rounded-full hover:bg-cream md:hidden">
            <Search className="size-5" strokeWidth={1.6} />
          </Link>
          <Link href="/account" aria-label="Account" className="hidden size-11 place-items-center rounded-full hover:bg-cream sm:grid">
            <User className="size-5" strokeWidth={1.6} />
          </Link>
          <HeaderActions />
        </div>
      </div>

      <DesktopNav tree={tree} />
    </header>
  );
}
