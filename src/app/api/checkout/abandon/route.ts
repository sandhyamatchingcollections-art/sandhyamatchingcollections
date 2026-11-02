import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseForUser } from "@/lib/supabase/server";

const Body = z.object({ id: z.string().uuid(), token: z.string().uuid() });

/** Shopper closed the payment window: cancel the unpaid order and give the stock back. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const s = await supabaseForUser();
  await s.rpc("abandon_order", { p_order: parsed.data.id, p_token: parsed.data.token });
  return NextResponse.json({ ok: true });
}
