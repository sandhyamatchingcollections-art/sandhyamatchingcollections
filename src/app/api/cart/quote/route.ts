import { NextResponse } from "next/server";
import { quoteCart } from "@/server/catalog";
import { CartLines } from "../schema";

/** Check a cart against live prices, stock and quantity rules. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = CartLines.safeParse(body?.lines);
  if (!parsed.success) return NextResponse.json({ error: "Invalid cart" }, { status: 400 });
  try {
    return NextResponse.json(await quoteCart(parsed.data), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't check the cart. Please try again." }, { status: 503 });
  }
}
