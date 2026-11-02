// Shared building blocks for admin screens — one look for every form and table.
import Link from "next/link";

export const inputCls =
  "mt-1.5 h-11 w-full rounded-xl border border-champagne bg-ivory px-3.5 text-sm text-cocoa placeholder:text-taupe/70 focus:border-cocoa/50 focus:outline-none disabled:opacity-60";
export const textareaCls =
  "mt-1.5 w-full rounded-xl border border-champagne bg-ivory px-3.5 py-2.5 text-sm text-cocoa focus:border-cocoa/50 focus:outline-none";
export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-cocoa px-5 text-sm font-medium text-cream hover:bg-cocoa-soft disabled:opacity-60";
export const btnSecondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-cocoa/25 bg-cream px-5 text-sm text-cocoa hover:border-cocoa disabled:opacity-60";
export const btnDanger =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-rose/40 bg-cream px-5 text-sm text-rose hover:bg-rose hover:text-cream disabled:opacity-60";
export const btnSmall =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-champagne bg-cream px-3 text-xs text-cocoa hover:border-cocoa/50 disabled:opacity-40";

export function PageHeader({ title, back, actions, children }: {
  title: string; back?: { href: string; label: string }; actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      {back && <Link href={back.href} className="text-sm text-taupe hover:text-cocoa">← {back.label}</Link>}
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-medium text-cocoa">{title}</h1>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-2 text-sm text-taupe">{children}</div>}
    </div>
  );
}

export function Card({ title, description, children, className = "" }: {
  title?: string; description?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-champagne bg-cream p-5 sm:p-6 ${className}`}>
      {title && <h2 className="text-xl font-medium text-cocoa">{title}</h2>}
      {description && <p className="mt-1 text-sm text-taupe">{description}</p>}
      <div className={title || description ? "mt-5" : ""}>{children}</div>
    </section>
  );
}

export function Field({ label, htmlFor, hint, error, children, className = "" }: {
  label: string; htmlFor?: string; hint?: string; error?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-cocoa">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-rose">{error}</p> : hint ? <p className="mt-1 text-xs text-taupe">{hint}</p> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "error"; children: React.ReactNode }) {
  const cls = { info: "bg-lavender/70", success: "bg-sage", error: "bg-blush" }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm text-cocoa ${cls}`}>{children}</div>;
}

const statusTone: Record<string, string> = {
  active: "bg-sage text-sage-deep", draft: "bg-champagne/70 text-cocoa-soft", archived: "bg-blush text-rose",
  ok: "bg-sage text-sage-deep", low: "bg-peach text-cocoa", out: "bg-blush text-rose", untracked: "bg-lavender text-cocoa-soft",
  hidden: "bg-champagne/70 text-cocoa-soft", visible: "bg-sage text-sage-deep",
};
const statusLabel: Record<string, string> = {
  active: "Live", draft: "Draft", archived: "Archived", ok: "In stock", low: "Low stock", out: "Out of stock",
  untracked: "Not tracked", hidden: "Hidden", visible: "Visible",
};
export function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusTone[status] ?? "bg-champagne"}`}>
      {statusLabel[status] ?? status}
    </span>
  );
}

export function EmptyRow({ cols, children }: { cols: number; children: React.ReactNode }) {
  return <tr><td colSpan={cols} className="px-4 py-10 text-center text-sm text-taupe">{children}</td></tr>;
}

export const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-taupe";
export const td = "px-4 py-3 align-middle text-sm text-cocoa";

export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-2 text-sm">
      {page > 1 && <Link className={btnSmall} href={hrefFor(page - 1)}>← Previous</Link>}
      <span className="px-2 text-taupe">Page {page} of {pages}</span>
      {page < pages && <Link className={btnSmall} href={hrefFor(page + 1)}>Next →</Link>}
    </nav>
  );
}
