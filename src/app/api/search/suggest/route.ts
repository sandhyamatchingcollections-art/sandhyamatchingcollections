import { NextResponse } from "next/server";
import { suggestions } from "@/server/catalog";

/** Header search suggestions. Short-lived cache: results change as stock changes. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ products: [], categories: [] });
  try {
    const data = await suggestions(q);
    return NextResponse.json(data, { headers: { "cache-control": "public, max-age=30" } });
  } catch {
    return NextResponse.json({ products: [], categories: [] }, { status: 200 });
  }
}
