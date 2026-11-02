import { notFound } from "next/navigation";
import { supabaseForUser } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { amountInWords, computeInvoice, sameState } from "@/lib/invoice";
import type { ShippingAddress } from "@/lib/types";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Invoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Item = { id: string; name: string; title: string; sku: string; hsn: string | null; qty: number; unit: string; price: number; line_total: number; gst_rate: number | null };
type Data = {
  order: { order_number: string; invoice_number: string; invoiced_at: string; created_at: string; customer_name: string; email: string; phone: string;
    shipping_address: ShippingAddress; subtotal: number; discount: number; shipping_fee: number; cod_fee: number; total: number; payment_method: string; coupon_code: string | null };
  items: Item[];
  seller: { name: string; trade_name: string; gstin: string | null; state: string | null; address: string | null; email: string | null; phone: string | null; shipping_gst_rate: number };
};

const d = (s: string) => new Date(s).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const money = (p: number) => formatINR(p, { paise: true });

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ number }, { t }] = await Promise.all([params, searchParams]);
  if (!/^SMC\d{4,10}$/i.test(number)) notFound();
  const s = await supabaseForUser();
  const { data } = await s.rpc("invoice_view", { p_number: number, p_token: t && /^[0-9a-f-]{36}$/i.test(t) ? t : null });
  if (!data) notFound();
  const { order: o, items, seller } = data as Data;
  const a = o.shipping_address;
  const gst = Boolean(seller.gstin);
  const intra = sameState(seller.state, a.state);
  const inv = computeInvoice(items.map((i) => ({ line_total: Number(i.line_total), gst_rate: i.gst_rate == null ? null : Number(i.gst_rate) })),
    Number(o.discount), Number(o.shipping_fee) + Number(o.cod_fee), Number(seller.shipping_gst_rate), intra);
  const unit = (u: string) => (u === "metre" ? "m" : u === "yard" ? "yd" : u === "set" ? "set" : "pc");

  return (
    <div className="min-h-screen bg-ivory py-8 print:bg-white print:py-0">
      <style>{`@media print { @page { size: A4; margin: 12mm } .no-print { display: none !important } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-4xl justify-end gap-2 px-4"><PrintButton /></div>
      <article className="mx-auto max-w-4xl bg-white p-8 text-[13px] text-cocoa shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-champagne pb-5">
          <div>
            <p className="font-serif text-2xl">{seller.trade_name}</p>
            {seller.name !== seller.trade_name && <p>{seller.name}</p>}
            {seller.address && <p className="max-w-xs whitespace-pre-line text-taupe">{seller.address}</p>}
            {seller.state && <p className="text-taupe">State: {seller.state}</p>}
            {gst && <p className="font-medium">GSTIN: {seller.gstin}</p>}
            {(seller.phone || seller.email) && <p className="text-taupe">{[seller.phone, seller.email].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="text-right">
            <h1 className="text-xl font-semibold uppercase tracking-wide">{gst ? "Tax Invoice" : "Invoice"}</h1>
            <p>Invoice no. <strong>{o.invoice_number}</strong></p>
            <p>Invoice date: {d(o.invoiced_at)}</p>
            <p>Order no. {o.order_number} · {d(o.created_at)}</p>
            <p>Payment: {o.payment_method === "cod" ? "Cash on Delivery" : "Prepaid (online)"}</p>
          </div>
        </header>

        <section className="grid gap-6 border-b border-champagne py-5 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-taupe">Bill to / Ship to</p>
            <p className="font-medium">{a.full_name}</p>
            <p>{[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}</p>
            <p>{a.city}, {a.state} – {a.pincode}</p>
            <p>Phone: {a.phone} · {o.email}</p>
          </div>
          {gst && (
            <div className="sm:text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-taupe">Place of supply</p>
              <p>{a.state}</p>
              <p className="text-taupe">{intra ? "Intra-state supply (CGST + SGST)" : "Inter-state supply (IGST)"}</p>
            </div>
          )}
        </section>

        <table className="mt-5 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-cocoa/30 text-[11px] uppercase tracking-wide text-taupe">
              <th className="py-2 pr-2">#</th><th className="py-2 pr-2">Item</th>{gst && <th className="py-2 pr-2">HSN</th>}
              <th className="py-2 pr-2 text-right">Qty</th><th className="py-2 pr-2 text-right">Rate</th>
              {gst && <><th className="py-2 pr-2 text-right">Taxable</th><th className="py-2 pr-2 text-right">GST</th></>}
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => {
              const l = inv.lines[idx];
              return (
                <tr key={i.id} className="border-b border-champagne align-top">
                  <td className="py-2 pr-2">{idx + 1}</td>
                  <td className="py-2 pr-2">{i.name}{i.title !== "Default" && <span className="text-taupe"> · {i.title}</span>}<br /><span className="text-[11px] text-taupe">SKU {i.sku}</span></td>
                  {gst && <td className="py-2 pr-2">{i.hsn ?? "—"}</td>}
                  <td className="py-2 pr-2 text-right">{Number(i.qty)} {unit(i.unit)}</td>
                  <td className="py-2 pr-2 text-right">{money(Number(i.price))}</td>
                  {gst && <><td className="py-2 pr-2 text-right">{money(l.taxable)}</td>
                    <td className="py-2 pr-2 text-right">{l.rate}%<br /><span className="text-[11px] text-taupe">{money(l.tax)}</span></td></>}
                  <td className="py-2 text-right">{money(l.net)}{l.discount > 0 && <><br /><span className="text-[11px] text-sage-deep">after −{money(l.discount)} coupon</span></>}</td>
                </tr>
              );
            })}
            {inv.ship && (
              <tr className="border-b border-champagne">
                <td className="py-2 pr-2">{items.length + 1}</td><td className="py-2 pr-2">Shipping &amp; handling</td>{gst && <td className="py-2 pr-2">996812</td>}
                <td /><td />
                {gst && <><td className="py-2 pr-2 text-right">{money(inv.ship.taxable)}</td><td className="py-2 pr-2 text-right">{inv.ship.rate}%<br /><span className="text-[11px] text-taupe">{money(inv.ship.tax)}</span></td></>}
                <td className="py-2 text-right">{money(inv.ship.net)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <section className="mt-5 flex flex-wrap justify-between gap-6">
          <p className="max-w-sm text-taupe"><span className="font-medium text-cocoa">Amount in words:</span> {amountInWords(inv.total)}</p>
          <dl className="w-72 space-y-1">
            {gst && <div className="flex justify-between"><dt>Taxable value</dt><dd>{money(inv.taxable)}</dd></div>}
            {gst && intra && <><div className="flex justify-between"><dt>CGST</dt><dd>{money(inv.cgst)}</dd></div><div className="flex justify-between"><dt>SGST</dt><dd>{money(inv.sgst)}</dd></div></>}
            {gst && !intra && <div className="flex justify-between"><dt>IGST</dt><dd>{money(inv.igst)}</dd></div>}
            {Number(o.discount) > 0 && <div className="flex justify-between gap-3 text-taupe"><dt>Coupon {o.coupon_code} (included above)</dt><dd className="whitespace-nowrap">−{money(Number(o.discount))}</dd></div>}
            <div className="flex justify-between border-t border-cocoa/30 pt-2 text-base font-semibold"><dt>Total</dt><dd>{money(inv.total)}</dd></div>
          </dl>
        </section>
        <footer className="mt-8 border-t border-champagne pt-4 text-[11px] text-taupe">
          {gst ? "Prices are inclusive of GST. " : "Seller GSTIN not provided. "}This is a computer-generated invoice and needs no signature.
        </footer>
      </article>
    </div>
  );
}
