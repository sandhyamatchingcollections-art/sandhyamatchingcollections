"use client";

import { useActionState } from "react";
import { signInWithPassword, type LoginState } from "./actions";

const field = "mt-2 h-12 w-full rounded-xl border border-champagne bg-ivory px-4 text-[15px] text-cocoa focus:border-cocoa/50 focus:outline-none";

export function PasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInWithPassword, { status: "idle" });
  return (
        <details className="mt-6 border-t border-champagne pt-4" open>
      <summary className="cursor-pointer text-sm text-taupe">Staff: sign in with password</summary>
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm font-medium text-cocoa">Email
          <input name="email" type="email" autoComplete="email" required defaultValue={state.email} className={field} />
        </label>
        <label className="block text-sm font-medium text-cocoa">Password
          <input name="password" type="password" autoComplete="current-password" required className={field} />
        </label>
        {state.status === "error" && <p role="alert" className="text-sm text-rose">{state.message}</p>}
        <button disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-cocoa/30 text-sm font-medium text-cocoa hover:border-cocoa disabled:opacity-60">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </details>
  );
}
