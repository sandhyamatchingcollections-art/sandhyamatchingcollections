import { Header } from "@/components/store/Header";
import { Footer, WhatsAppFloat } from "@/components/store/Footer";
import { CartSync } from "@/components/store/CartSync";
import { getUser } from "@/server/auth";

// Catalogue, prices and stock come from the database on every request.
export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-cocoa focus:px-4 focus:py-2 focus:text-cream">
        Skip to content
      </a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <WhatsAppFloat />
      <CartSync signedIn={Boolean(user)} />
    </>
  );
}
