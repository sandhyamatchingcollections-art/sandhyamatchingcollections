"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Lock, MessageCircle, Tag, X } from "lucide-react";
import { cartActions, useCart } from "@/components/store/cart-store";
import { PhotoPlaceholder } from "@/components/ui/primitives";
import { formatINR, whatsappLink } from "@/lib/money";
import { INDIAN_STATES } from "@/lib/orders";
import type { CheckoutQuote, PaymentMethod, SavedAddress } from "@/lib/types";

type RazorpayOptions = {
  key: string; order_id: string; amount: number; currency: string; name: string; description: string;
  prefill: Record<string, string>; theme?: { color: string };
  handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
};
declare global { interface Window { Razorpay?: new (o: RazorpayOptions) => { open: () => void } } }

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(Boolean(window.Razorpay));
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const field = "mt-1.5 h-12 w-full rounded-xl border border-champagne bg-ivory px-4 text-[15px] focus:border-cocoa/50 focus:outline-none";
const label = "text-sm font-medium text-cocoa";
const box = "rounded-3xl border border-champagne bg-cream p-6 sm:p-7";
const blankAddr = { full_name: "", line1: "", line2: "", landmark: "", city: "", state: "", pincode: "" };

export function CheckoutForm({ signedIn, defaults, addresses, onlineReady, whatsapp, delivery }: {
  signedIn: boolean;
  defaults: { email: string; name: string; phone: string };
  addresses: SavedAddress[];
  onlineReady: boolean;
  whatsapp: string | null;
  delivery: string;
}) {
  const router = useRouter();
  const { lines } = useCart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [contact, setContact] = useState(defaults);
  const [choice, setChoice] = useState<string>(addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? "new");
  const [addr, setAddr] = useState({ ...blankAddr, full_name: defaults.name });
  const [saveAddr, setSaveAddr] = useState(true);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PaymentMethod>(onlineReady ? "online" : "cod");
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState(""); // code currently applied (sent with every quote)

  const wire = useMemo(() => lines.map((l) => ({ variant_id: l.variantId, qty: l.qty })), [lines]);
  const key = JSON.stringify(wire) + method + coupon;

  useEffect(() => {
    if (!mounted || !wire.length) return;
    let live = true;
    fetch("/api/checkout/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines: wire, method, coupon }) })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error))))
      .then((q: CheckoutQuote) => {
        if (!live) return;
        setQuote(q);
        if (method === "cod" && !q.cod_allowed && onlineReady) setMethod("online");
      })
      .catch((e) => live && setError((e as Error).message || "Couldn't load the totals."));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mounted]);

  if (!mounted) return <p className="text-taupe">Loading your cart…</p>;
  if (!lines.length) {
    return (
      <div className={`${box} max-w-lg`}>
        <p className="text-cocoa">Your cart is empty.</p>
        <Link href="/products" className="mt-4 inline-block text-sm underline underline-offset-4">Continue shopping</Link>
      </div>
    );
  }

  const changed = quote?.lines.some((l) => l.status !== "ok");
  const saved = addresses.find((a) => a.id === choice);
  const codPossible = quote ? quote.cod_allowed : true;
  const noMethod = !onlineReady && !codPossible;
  const toFree = quote?.free_shipping_min != null && quote.shipping_fee > 0 ? quote.free_shipping_min - quote.subtotal : 0;

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!quote || changed) return;
    setError(""); setBusy(method === "online" ? "Opening secure payment…" : "Placing your order…");
    const address = saved
      ? { full_name: saved.full_name, line1: saved.line1, line2: saved.line2 ?? "", landmark: saved.landmark ?? "", city: saved.city, state: saved.state, pincode: saved.pincode }
      : addr;
    try {
      if (method === "online" && !(await loadRazorpay())) throw new Error("The payment window couldn't load. Check your internet connection and try again.");
      const res = await fetch("/api/checkout/place", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines: wire, method, ...contact, address, note, save_address: signedIn && !saved && saveAddr, expected_total: quote.total,
          coupon: quote.coupon?.ok ? coupon : "" }),
      });
      const out = await res.json();
      if (!res.ok) {
        if (out.cartChanged) router.push("/cart");
        if (out.couponError) { setCoupon(""); setCouponInput(""); }
        throw new Error(out.error ?? "Couldn't place the order.");
      }
      if (out.kind === "cod") {
        cartActions.clear();
        router.push(out.redirect);
        return;
      }
      // Online: Razorpay's window takes the payment; we confirm it on our server.
      const rz = new window.Razorpay!({
        ...out.razorpay,
        theme: { color: "#3e2c25" },
        handler: async (r) => {
          setBusy("Confirming your payment…");
          const v = await fetch("/api/checkout/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r) });
          const vo = await v.json().catch(() => ({}));
          cartActions.clear();
          router.push(`${out.order.link}${v.ok ? "&placed=1" : `&verify=${encodeURIComponent(vo.error ?? "pending")}`}`);
        },
        modal: {
          ondismiss: () => {
            fetch("/api/checkout/abandon", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: out.order.id, token: out.order.token }) });
            setBusy("");
            setError("Payment was cancelled. Your cart is still here — you can try again.");
          },
        },
      });
      rz.open();
    } catch (err) {
      setBusy("");
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={placeOrder} className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        {!signedIn && (
          <p className="rounded-2xl bg-lavender/50 px-5 py-3 text-sm text-cocoa">
            Have an account? <Link href="/login?next=/checkout" className="font-medium underline underline-offset-4">Sign in</Link> to use saved addresses and see your orders later. Or simply continue as a guest.
          </p>
        )}

        <section className={box} aria-labelledby="h-contact">
          <h2 id="h-contact" className="text-2xl font-medium">1. Contact</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="c-name" className={label}>Full name</label>
              <input id="c-name" required minLength={2} maxLength={80} autoComplete="name" className={field}
                value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c-phone" className={label}>Mobile number</label>
              <input id="c-phone" required inputMode="tel" autoComplete="tel" placeholder="10-digit mobile" pattern="(\+?91[\s-]?)?[6-9][0-9\s-]{9,11}" className={field}
                value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c-email" className={label}>Email</label>
              <input id="c-email" type="email" required autoComplete="email" className={field}
                value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              <p className="mt-1 text-xs text-taupe">For your order details.</p>
            </div>
          </div>
        </section>

        <section className={box} aria-labelledby="h-addr">
          <h2 id="h-addr" className="text-2xl font-medium">2. Delivery address</h2>
          {addresses.length > 0 && (
            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">Choose an address</legend>
              {addresses.map((a) => (
                <label key={a.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 text-sm ${choice === a.id ? "border-cocoa bg-ivory" : "border-champagne"}`}>
                  <input type="radio" name="addr" checked={choice === a.id} onChange={() => setChoice(a.id)} className="mt-1 accent-cocoa" />
                  <span><span className="font-medium">{a.full_name}</span> · {a.phone}<br />
                    <span className="text-taupe">{[a.line1, a.line2, a.landmark, a.city, a.state].filter(Boolean).join(", ")} – {a.pincode}</span></span>
                </label>
              ))}
              <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 text-sm ${choice === "new" ? "border-cocoa bg-ivory" : "border-champagne"}`}>
                <input type="radio" name="addr" checked={choice === "new"} onChange={() => setChoice("new")} className="accent-cocoa" /> Deliver to a new address
              </label>
            </fieldset>
          )}
          {choice === "new" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="a-name" className={label}>Receiver&apos;s name</label>
                <input id="a-name" required minLength={2} maxLength={80} className={field} value={addr.full_name} onChange={(e) => setAddr({ ...addr, full_name: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="a-line1" className={label}>House no., building, street</label>
                <input id="a-line1" required minLength={3} maxLength={160} autoComplete="address-line1" className={field} value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} />
              </div>
              <div>
                <label htmlFor="a-line2" className={label}>Area / locality <span className="font-normal text-taupe">(optional)</span></label>
                <input id="a-line2" maxLength={160} autoComplete="address-line2" className={field} value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} />
              </div>
              <div>
                <label htmlFor="a-landmark" className={label}>Landmark <span className="font-normal text-taupe">(optional)</span></label>
                <input id="a-landmark" maxLength={80} className={field} value={addr.landmark} onChange={(e) => setAddr({ ...addr, landmark: e.target.value })} />
              </div>
              <div>
                <label htmlFor="a-city" className={label}>City / town</label>
                <input id="a-city" required minLength={2} maxLength={60} autoComplete="address-level2" className={field} value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
              </div>
              <div>
                <label htmlFor="a-pin" className={label}>PIN code</label>
                <input id="a-pin" required inputMode="numeric" maxLength={6} pattern="[1-9][0-9]{5}" autoComplete="postal-code" className={field}
                  value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value.replace(/\D/g, "") })} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="a-state" className={label}>State</label>
                <select id="a-state" required className={field} value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })}>
                  <option value="">Choose…</option>
                  {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              {signedIn && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} className="size-4 accent-cocoa" /> Save this address for next time
                </label>
              )}
            </div>
          )}
          <div className="mt-4">
            <label htmlFor="o-note" className={label}>Note for the store <span className="font-normal text-taupe">(optional)</span></label>
            <textarea id="o-note" rows={2} maxLength={500} className={`${field} h-auto py-3`} placeholder="E.g. match the blouse to a maroon saree"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </section>

        <section className={box} aria-labelledby="h-pay">
          <h2 id="h-pay" className="text-2xl font-medium">3. Payment</h2>
          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">Payment method</legend>
            {onlineReady && (
              <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${method === "online" ? "border-cocoa bg-ivory" : "border-champagne"}`}>
                <input type="radio" name="method" checked={method === "online"} onChange={() => setMethod("online")} className="mt-1 accent-cocoa" />
                <span><span className="flex items-center gap-2 font-medium"><CreditCard className="size-4" /> Pay online</span>
                  <span className="text-sm text-taupe">UPI, cards, net banking, wallets — secured by Razorpay.</span></span>
              </label>
            )}
            
          </fieldset>
          {noMethod && (
            <p className="mt-3 rounded-xl bg-blush px-4 py-3 text-sm">
              Online payment isn&apos;t available right now.
              {whatsapp && <> Please <a className="underline" href={whatsappLink(whatsapp, "Hi, I'd like to place an order.")} target="_blank" rel="noopener noreferrer">order on WhatsApp</a>.</>}
            </p>
          )}
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-3xl bg-blush/50 p-6 lg:sticky lg:top-40">
        <h2 className="text-2xl font-medium">Order summary</h2>
        {changed && (
          <p role="alert" className="rounded-xl bg-cream px-4 py-3 text-sm text-rose">
            Some items changed since you added them. <Link href="/cart" className="font-medium underline">Review your cart</Link>.
          </p>
        )}
        <ul className="space-y-3">
          {(quote?.lines ?? []).filter((l) => l.status !== "removed").map((l) => (
            <li key={l.variant_id} className="flex gap-3 text-sm">
              {l.image_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={l.image_url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                : <PhotoPlaceholder tone="blush" motif="none" label="" className="size-14 shrink-0 rounded-lg" />}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2">{l.name}</span>
                <span className="text-taupe">{l.title && l.title !== "Default" ? `${l.title} · ` : ""}{l.qty}{l.unit === "metre" ? " m" : l.unit === "yard" ? " yd" : " ×"}</span>
              </span>
              <span className="shrink-0 font-medium">{formatINR(l.line_total ?? 0)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-champagne pt-4">
          {coupon && quote?.coupon?.ok ? (
            <p className="flex items-center justify-between gap-2 rounded-xl bg-cream px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-sage-deep"><Tag className="size-4" /> <strong>{quote.coupon.code}</strong> {quote.coupon.message}</span>
              <button type="button" onClick={() => { setCoupon(""); setCouponInput(""); }} aria-label="Remove coupon" className="grid size-7 place-items-center rounded-full hover:bg-ivory"><X className="size-4" /></button>
            </p>
          ) : (
            <div>
              <label htmlFor="coupon" className="text-xs font-medium text-cocoa">Coupon code</label>
              <div className="mt-1 flex gap-2">
                <input id="coupon" value={couponInput} maxLength={30} autoComplete="off" placeholder="e.g. WELCOME10"
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setCoupon(couponInput); } }}
                  className="h-10 min-w-0 flex-1 rounded-full border border-champagne bg-ivory px-4 text-sm uppercase focus:border-cocoa/50 focus:outline-none" />
                <button type="button" disabled={!couponInput} onClick={() => setCoupon(couponInput)}
                  className="h-10 rounded-full border border-cocoa/30 px-4 text-sm hover:border-cocoa disabled:opacity-40">Apply</button>
              </div>
              {coupon && quote?.coupon && !quote.coupon.ok && <p role="alert" className="mt-1.5 text-xs text-rose">{quote.coupon.message}</p>}
            </div>
          )}
        </div>
        <dl className="space-y-2 border-t border-champagne pt-4 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{quote ? formatINR(quote.subtotal) : "…"}</dd></div>
          {quote && quote.discount > 0 && <div className="flex justify-between text-sage-deep"><dt>Coupon {quote.coupon?.code}</dt><dd>−{formatINR(quote.discount)}</dd></div>}
          <div className="flex justify-between"><dt>Shipping</dt><dd>{quote ? (quote.shipping_fee ? formatINR(quote.shipping_fee) : "Free") : "…"}</dd></div>
          {quote && quote.cod_fee > 0 && <div className="flex justify-between"><dt>COD charge</dt><dd>{formatINR(quote.cod_fee)}</dd></div>}
          <div className="flex justify-between border-t border-champagne pt-3 text-base font-semibold"><dt>Total</dt><dd data-testid="checkout-total">{quote ? formatINR(quote.total) : "…"}</dd></div>
        </dl>
        {toFree > 0 && <p className="text-xs text-sage-deep">Add {formatINR(toFree)} more for free shipping.</p>}
        <p className="text-xs text-taupe">Prices include GST. Delivery in about {delivery}.</p>
        {error && <p role="alert" className="rounded-xl bg-cream px-4 py-3 text-sm text-rose">{error}</p>}
        <button type="submit" disabled={!quote || changed || Boolean(busy) || noMethod}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-cocoa text-sm font-medium text-cream hover:bg-cocoa-soft disabled:opacity-50">
          <Lock className="size-4" /> {busy || (method === "online" ? `Pay ${quote ? formatINR(quote.total) : ""}` : "Place order")}
        </button>
        {whatsapp && (
          <a href={whatsappLink(whatsapp, "Hi, I need help with my order.")} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-xs text-taupe hover:text-cocoa">
            <MessageCircle className="size-3.5" /> Need help? WhatsApp us
          </a>
        )}
      </aside>
    </form>
  );
}
