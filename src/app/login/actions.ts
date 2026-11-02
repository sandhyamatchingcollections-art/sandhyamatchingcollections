"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseForUser } from "@/lib/supabase/server";
import { SITE_URL, supabaseConfigured } from "@/lib/supabase/env";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const Input = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254),
  next: z.string().regex(/^\/(?!\/)[A-Za-z0-9\-_/?=&.]*$/).catch("/account"), // only same-site paths
});

/** Emails a one-time sign-in link. Accounts are created on first sign-in. */
export async function sendLoginLink(_: LoginState, form: FormData): Promise<LoginState> {
  if (!supabaseConfigured) return { status: "error", message: "Sign-in isn't set up yet." };
  const parsed = Input.safeParse({ email: form.get("email"), next: form.get("next") ?? "/account" });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const { email, next } = parsed.data;

  // Use the address the visitor is actually on (works for localhost and the live domain).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${proto}://${host}` : SITE_URL;

  const supabase = await supabaseForUser();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
  });
  if (error) {
    const message = /rate|seconds/i.test(error.message)
      ? "Too many sign-in emails were sent recently. Check your inbox and spam for an earlier link, or try again later."
      : "We couldn't send the email. Please check the address and try again.";
    console.error("signInWithOtp:", error.message);
    return { status: "error", message, email };
  }
  return { status: "sent", email };
}

/** Password sign-in for staff who have a password set. */
export async function signInWithPassword(_: LoginState, form: FormData): Promise<LoginState> {
  if (!supabaseConfigured) return { status: "error", message: "Sign-in isn't set up yet." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const nextRaw = String(form.get("next") ?? "/account");
  const next = /^\/(?!\/)/.test(nextRaw) ? nextRaw : "/account";
  if (!email || !password) return { status: "error", message: "Enter your email and password.", email };
  const supabase = await supabaseForUser();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", message: "Email or password is incorrect.", email };
  redirect(next);
}
