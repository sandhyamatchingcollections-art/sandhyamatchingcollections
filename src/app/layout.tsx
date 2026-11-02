import type { Metadata, Viewport } from "next";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource-variable/inter";
import "./globals.css";
import { Suspense } from "react";
import { getStoreSettings } from "@/server/catalog";
import { NavProgress } from "@/components/NavProgress";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getStoreSettings();
  const description = s.seoDescription ?? s.description;
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: { default: s.seoTitle ?? `${s.name} — ${s.tagline}`, template: `%s | ${s.name}` },
    description,
    openGraph: { siteName: s.name, type: "website", locale: "en_IN", description, ...(s.ogImageUrl ? { images: [{ url: s.ogImageUrl, width: 1200, height: 630 }] } : {}) },
    twitter: { card: s.ogImageUrl ? "summary_large_image" : "summary", description, ...(s.ogImageUrl ? { images: [s.ogImageUrl] } : {}) },
    icons: { icon: "/logo.png" },
  };
}

export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: "#fbf7f2" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className="antialiased">
        <Suspense fallback={null}><NavProgress /></Suspense>
        {children}
      </body>
    </html>
  );
}
