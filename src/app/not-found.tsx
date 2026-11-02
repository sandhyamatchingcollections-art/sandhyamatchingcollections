import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[70vh] place-items-center bg-ivory px-6 text-center">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-rose">Page not found</p>
        <h1 className="mt-4 text-5xl font-medium text-cocoa">This page has wandered off</h1>
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center rounded-full bg-cocoa px-6 text-sm text-cream">Back to the store</Link>
      </div>
    </div>
  );
}
