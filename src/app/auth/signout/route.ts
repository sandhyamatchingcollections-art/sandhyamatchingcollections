import { NextResponse, type NextRequest } from "next/server";
import { supabaseForUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";

// POST only, so a link or image on another site can't sign people out.
export async function POST(request: NextRequest) {
  if (supabaseConfigured) {
    const supabase = await supabaseForUser();
    await supabase.auth.signOut();
  }
  // ?signedout=1 tells the page to clear this device's cart and wishlist.
  return NextResponse.redirect(new URL("/?signedout=1", request.url), { status: 303 });
}
