"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { adminGroups } from "./modules";

/** `permissions` null = design preview (show everything); otherwise only modules this user may open. */
export function AdminSidebar({ permissions }: { permissions: string[] | null }) {
  const path = usePathname();
  const allowed = (perm: string | null) => perm === null || permissions === null || permissions.includes(perm);
  const groups = adminGroups
    .map((g) => ({ ...g, items: g.items.filter((m) => allowed(m.perm)) }))
    .filter((g) => g.items.length > 0);
  const [open, setOpen] = useState(false);
  const nav = (
    <nav aria-label="Admin" className="space-y-6 px-3 py-5">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-taupe">{g.title}</p>
          <ul className="mt-2 space-y-0.5">
            {g.items.map((m) => {
              const href = `/admin${m.slug ? `/${m.slug}` : ""}`;
              const active = path === href;
              const Icon = m.icon;
              return (
                <li key={m.slug}>
                  <Link href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] transition ${active ? "bg-blush text-cocoa font-medium" : "text-cocoa-soft hover:bg-cream"}`}>
                    <Icon className="size-4" strokeWidth={1.6} /> {m.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
  return (
    <>
      <div className="flex items-center justify-between border-b border-champagne bg-cream px-5 py-3 lg:hidden">
        <span className="font-display text-xl font-semibold">Sandhya · Admin</span>
        <button aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)} className="grid size-11 place-items-center">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && <div className="border-b border-champagne bg-cream lg:hidden">{nav}</div>}
      <aside className="sticky top-0 hidden h-screen overflow-y-auto border-r border-champagne bg-cream lg:block">
        <div className="border-b border-champagne px-6 py-5">
          <p className="font-display text-2xl font-semibold leading-none">Sandhya</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.28em] text-taupe">Store Admin</p>
        </div>
        {nav}
      </aside>
    </>
  );
}
