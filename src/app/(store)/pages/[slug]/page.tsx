import { notFound } from "next/navigation";
import { PageShell } from "@/components/store/ListingPage";
import { RichText } from "@/components/store/RichText";
import { getContentPage, getStoreSettings } from "@/server/catalog";
import { formatIndianPhone, whatsappLink } from "@/lib/money";

// Built-in page names (the owner writes and publishes the text in Admin → Pages & Policies).
const pages: Record<string, string> = {
  contact: "Contact Us",
  faq: "Frequently Asked Questions",
  "shipping-policy": "Shipping Policy",
    "return-refund-policy": "No Return & Refund Policy",
  "privacy-policy": "Privacy Policy",
  terms: "Terms and Conditions",
};

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const p = await getContentPage(slug);
  return { title: p?.title ?? pages[slug] ?? "Page", alternates: { canonical: `/pages/${slug}` } };
}

export default async function InfoPage({ params }: Props) {
  const { slug } = await params;
  if (!pages[slug]) notFound();
  const [page, s] = await Promise.all([getContentPage(slug), getStoreSettings()]);
  const title = page?.title ?? pages[slug];
  return (
    <PageShell crumbs={[{ label: title }]} title={title}>
      <div className="max-w-2xl space-y-6">
        {page ? <RichText text={page.body} /> : slug !== "contact" && (
          <p className="rounded-2xl border border-dashed border-champagne bg-cream p-5 text-taupe">
            This page is being finalised and will appear here soon. For any question, message us on WhatsApp.
          </p>
        )}
        {slug === "contact" && (
          <div className="space-y-2 rounded-3xl border border-champagne bg-cream p-6 leading-relaxed text-cocoa-soft">
            {!page && <p>We&apos;d love to help you find the right saree, fabric or finishing touch.</p>}
            {s.whatsapp && <p>WhatsApp: <a className="underline" href={whatsappLink(s.whatsapp)}>{formatIndianPhone(s.whatsapp)}</a></p>}
            {s.phone && <p>Phone: <a className="underline" href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a></p>}
            {s.email && <p>Email: <a className="underline" href={`mailto:${s.email}`}>{s.email}</a></p>}
            {s.instagramUrl && <p>Instagram: <a className="underline" href={s.instagramUrl}>@{s.instagramHandle}</a></p>}
            {s.address && <p className="whitespace-pre-line">Address: {s.address}</p>}
            {s.shippingNote && <p>{s.shippingNote}.</p>}
          </div>
        )}
      </div>
    </PageShell>
  );
}
