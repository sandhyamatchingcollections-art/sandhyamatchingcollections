import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/env";

// Keeps the sign-in session fresh on every page load (Supabase SSR pattern).
// Authorisation is NOT decided here — each admin page and server action checks permissions itself.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!supabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // Refreshes the session cookie when needed. getClaims() checks the sign-in token's signature
  // locally (Supabase's signing keys), so most page loads need no round trip to the Auth server.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Every page except static files (the store header shows sign-in state and the saved cart).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)"],
};
