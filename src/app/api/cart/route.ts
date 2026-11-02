import { NextResponse } from "next/server";
import { getUser } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { quoteCart } from "@/server/catalog";
import { CartLines } from "./schema";

const noStore = { "cache-control": "no-store" };

/** The signed-in customer's saved cart, already checked against live prices and stock. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: noStore });
  const s = await supabaseForUser();
  const { data, error } = await s.from("cart_items").select("variant_id, qty").order("added_at");
  if (error) return NextResponse.json({ error: "Couldn't load your cart" }, { status: 503, headers: noStore });
  const lines = (data ?? []).map((r) => ({ variant_id: r.variant_id as string, qty: Number(r.qty) }));
  return NextResponse.json(lines.length ? await quoteCart(lines) : { lines: [], subtotal: 0 }, { headers: noStore });
}

/** Save the signed-in customer's cart (replaces it). */
export async function PUT(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: noStore });
  const body = await req.json().catch(() => null);
  const parsed = CartLines.safeParse(body?.lines);
  if (!parsed.success) return NextResponse.json({ error: "Invalid cart" }, { status: 400, headers: noStore });
  const s = await supabaseForUser();
  const { error } = await s.rpc("save_my_cart", { p_lines: parsed.data });
  if (error) return NextResponse.json({ error: "Couldn't save your cart" }, { status: 503, headers: noStore });
  return new NextResponse(null, { status: 204, headers: noStore });
}
