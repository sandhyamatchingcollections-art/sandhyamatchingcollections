import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseForUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";

// Landing point for the emailed sign-in link. Handles both link styles Supabase can send:
// ?code=… (default template) and ?token_hash=…&type=… (custom template).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const nextParam = url.searchParams.get("next") ?? "/account";
  const next = /^\/(?!\/)/.test(nextParam) ? nextParam : "/account"; // never redirect off-site
  if (!supabaseConfigured) return NextResponse.redirect(new URL("/login", url.origin));
  const supabase = await supabaseForUser();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=link&next=${encodeURIComponent(next)}`, url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
