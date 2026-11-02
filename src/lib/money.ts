import type { Paise, SellingUnit } from "./types";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** Format integer paise as ₹ with Indian digit grouping. */
const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ₹1,234 (whole rupees shown without decimals) — or always with paise for invoices: ₹1,234.50 */
export function formatINR(paise: Paise, opts?: { paise?: boolean }): string {
  return (opts?.paise ? inrPaise : inr).format(paise / 100);
}

export function discountPercent(price: Paise, mrp: Paise | null): number | null {
  if (!mrp || mrp <= price) return null;
  return Math.round(((mrp - price) / mrp) * 100);
}

export function unitSuffix(unit: SellingUnit): string {
  return unit === "metre" ? "/ m" : unit === "yard" ? "/ yd" : unit === "set" ? "/ set" : "";
}

/** "919885949698" -> "+91 98859 49698" */
export function formatIndianPhone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  const local = d.startsWith("91") && d.length === 12 ? d.slice(2) : d;
  return local.length === 10 ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : `+${d}`;
}

export function whatsappLink(e164: string, text?: string): string {
  const base = `https://wa.me/${e164.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
