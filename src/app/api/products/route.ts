import { NextResponse } from "next/server";
import { z } from "zod";
import { getProductsByIds } from "@/server/catalog";

const Ids = z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).max(100);

/** Returns product cards for a list of ids (used by the guest wishlist). */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("ids") ?? "";
  const parsed = Ids.safeParse(raw ? raw.split(",") : []);
  if (!parsed.success) return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
  return NextResponse.json({ products: await getProductsByIds(parsed.data) });
}
