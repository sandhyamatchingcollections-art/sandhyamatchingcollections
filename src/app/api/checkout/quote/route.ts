import { NextResponse } from "next/server";
import { checkoutQuote } from "@/server/orders";
import { CartLines } from "../../cart/schema";
import { Coupon, Method } from "../schema";

/** Totals for the checkout page: items + shipping + COD fee, priced by the database. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const lines = CartLines.safeParse(body?.lines);
  const method = Method.safeParse(body?.method ?? "online");
  const coupon = Coupon.safeParse(body?.coupon ?? "");
  if (!lines.success || !method.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    return NextResponse.json(await checkoutQuote(lines.data, method.data, coupon.success ? coupon.data : ""), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load the totals. Please try again." }, { status: 503 });
  }
}
