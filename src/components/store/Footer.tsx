import Link from "next/link";
import { MessageCircle, Truck } from "lucide-react";
import { getCategoryTree, getStoreSettings } from "@/server/catalog";
import { formatIndianPhone, whatsappLink } from "@/lib/money";
import { Logo } from "./Header";

export function InstagramIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

const support = [
  { label: "Contact Us", href: "/pages/contact" },
  { label: "Frequently Asked Questions", href: "/pages/faq" },
  { label: "Shipping Information", href: "/pages/shipping-policy" },
 
  { label: "Order Tracking", href: "/account/orders" },
];
const policies = [
  { label: "Privacy Policy", href: "/pages/privacy-policy" },
  { label: "Terms and Conditions", href: "/pages/terms" },
  { label: "Shipping Policy", href: "/pages/shipping-policy" },
   { label: "No Return & Refund Policy", href: "/pages/return-refund-policy" },
];

function Col({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-cocoa">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="text-sm text-taupe hover:text-cocoa">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function Footer() {
  const [s, tree] = await Promise.all([getStoreSettings(), getCategoryTree()]);
  const shop = [
    { label: "All Products", href: "/products" },
    { label: "Bridal Collection", href: "/collections/bridal" },
    ...tree.slice(0, 6).map((c) => ({ label: c.name, href: `/c/${c.slug}` })),
    { label: "New Arrivals", href: "/collections/new-arrivals" },
  ];

  return (
    <footer className="mt-24 border-t border-champagne bg-blush/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo name={s.name} compact />
          <p className="mt-5 text-sm leading-relaxed text-taupe">{s.description}</p>
          <p className="mt-4 flex items-center gap-2 text-sm text-cocoa">
            <Truck className="size-4" strokeWidth={1.6} /> {s.shippingNote}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {s.instagramUrl && (
              <a href={s.instagramUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-cocoa/20 bg-cream px-4 text-[13px] hover:border-cocoa">
                <InstagramIcon /> @{s.instagramHandle}
              </a>
            )}
            {s.whatsapp && (
              <a href={whatsappLink(s.whatsapp)} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-cocoa/20 bg-cream px-4 text-[13px] hover:border-cocoa">
                <MessageCircle className="size-4" strokeWidth={1.6} /> {formatIndianPhone(s.whatsapp)}
              </a>
            )}
            {s.facebookUrl && (
              <a href={s.facebookUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-full border border-cocoa/20 bg-cream px-4 text-[13px]">Facebook</a>
            )}
          </div>
          {(s.email || s.phone || s.address) && (
            <address className="mt-5 space-y-1 text-sm not-italic text-taupe">
              {s.address && <p>{s.address}</p>}
              {s.phone && <p>{s.phone}</p>}
              {s.email && <p><a href={`mailto:${s.email}`}>{s.email}</a></p>}
            </address>
          )}
        </div>
        <Col title="Shop" links={shop} />
        <Col title="Customer Support" links={support} />
        <Col title="Policies" links={policies} />
      </div>
      <div className="border-t border-champagne/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-taupe sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} {s.name}. All rights reserved.</p>
          {s.paymentMethods.length > 0 && <p>We accept {s.paymentMethods.join(" · ")}</p>}
        </div>
      </div>
    </footer>
  );
}

export async function WhatsAppFloat() {
  const s = await getStoreSettings();
  if (!s.whatsapp) return null;
  return (
    <a
      href={whatsappLink(s.whatsapp, `Hi ${s.name}, I have a question about a product.`)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-5 right-5 z-30 grid size-14 place-items-center rounded-full bg-sage-deep text-cream shadow-[0_10px_30px_-10px_rgb(62_44_37/0.5)] transition hover:scale-105"
    >
      <MessageCircle className="size-6" strokeWidth={1.8} />
    </a>
  );
}
