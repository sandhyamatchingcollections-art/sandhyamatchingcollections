// GST split for an invoice. Prices in the store include GST, so tax is worked out backwards:
// taxable value = amount × 100 / (100 + rate). Any order coupon is shared across the lines in
// proportion to their value (it lowers the taxable value). Totals always add up to the order total.

export type InvoiceLineIn = { line_total: number; gst_rate: number | null };
export type InvoiceLine = { net: number; discount: number; taxable: number; tax: number; cgst: number; sgst: number; igst: number; rate: number };

function split(amount: number, rate: number, intra: boolean, discount = 0): InvoiceLine {
  const taxable = Math.round((amount * 100) / (100 + rate));
  const tax = amount - taxable;
  const cgst = intra ? Math.round(tax / 2) : 0;
  return { net: amount, discount, taxable, tax, cgst, sgst: intra ? tax - cgst : 0, igst: intra ? 0 : tax, rate };
}

export const sameState = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

export function computeInvoice(items: InvoiceLineIn[], discount: number, shipping: number, shippingRate: number, intra: boolean, defaultRate = 5) {
  const gross = items.reduce((s, i) => s + i.line_total, 0);
  let left = discount;
  const lines = items.map((i, idx) => {
    const d = idx === items.length - 1 ? left : Math.min(left, Math.round((discount * i.line_total) / (gross || 1)));
    left -= d;
    return split(i.line_total - d, Number(i.gst_rate ?? defaultRate), intra, d);
  });
  const ship = shipping > 0 ? split(shipping, shippingRate, intra) : null;
  const all = ship ? [...lines, ship] : lines;
  const sum = (k: keyof InvoiceLine) => all.reduce((s, l) => s + (l[k] as number), 0);
  return { lines, ship, taxable: sum("taxable"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), tax: sum("tax"), total: sum("net") };
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
  "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function under1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const t = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? " " + ONES[r % 10] : ""}`;
  return [h ? `${ONES[h]} Hundred` : "", t].filter(Boolean).join(" ");
}
/** 123456 → "One Lakh Twenty Three Thousand Four Hundred Fifty Six" (Indian numbering). */
export function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${numberToWords(crore)} Crore`);
  if (lakh) parts.push(`${under1000(lakh)} Lakh`);
  if (thousand) parts.push(`${under1000(thousand)} Thousand`);
  if (n) parts.push(under1000(n));
  return parts.join(" ");
}
export function amountInWords(paise: number): string {
  const r = Math.floor(paise / 100), p = paise % 100;
  return `Rupees ${numberToWords(r)}${p ? ` and ${numberToWords(p)} Paise` : ""} Only`;
}
