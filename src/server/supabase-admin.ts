import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";

/**
 * The app server's own database client, used ONLY to record payments that the
 * server has verified with Razorpay (confirm_payment / attach_razorpay_order).
 * The secret key never reaches the browser: it has no NEXT_PUBLIC_ prefix and
 * this file is server-only. Everything else uses the visitor's own rights.
 */
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";
export const serverKeyConfigured = Boolean(SUPABASE_URL && SECRET);

let client: SupabaseClient | null = null;
export function supabaseServer(): SupabaseClient {
  if (!serverKeyConfigured) throw new Error("SUPABASE_SECRET_KEY is not set");
  client ??= createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
